import cv2
import asyncio
import numpy as np
from datetime import datetime, timedelta
from collections import deque, defaultdict
from typing import Dict, Tuple, List

from app.services.detector import detector_instance
from app.db.session import AsyncSessionLocal
from app.db.models import SafetyEvent, TrainEvent
from app.services.zones import zone_service
from app.services.ocr_service import ocr_instance
from app.services.train_tracker import TrainTracker


class WorkerState:
    def __init__(self, track_id):
        self.track_id = track_id
        self.positions = deque(maxlen=30)
        self.keypoints_history = deque(maxlen=30)
        self.state = "Unknown"
        self.zone = "Safe"
        self.violation_buffer = defaultdict(lambda: deque(maxlen=10))
        self.risk_score = 0


async def start_video_processing_task(video_path: str, video_id: int):
    processor = SmartVideoProcessor(video_path, video_id)
    await processor.process()


class SmartVideoProcessor:
    def __init__(self, video_path: str, video_db_id: int):
        self.video_path = video_path
        self.video_db_id = video_db_id
        self.workers: Dict[int, WorkerState] = {}
        self.last_alert_time: Dict[int, float] = defaultdict(float)
        self.ghost_tracks: Dict[int, Tuple[float, float, int]] = {}

        # OCR State
        self.current_real_time = "00:00:00"
        # Датасет записан 2022-03-20, стартуем от полуночи
        self.video_start_dt: datetime | None = datetime(2022, 3, 20, 0, 0, 0)
        self.current_video_dt = None
        self.train_tracker = TrainTracker(departure_timeout=30)

        # ФЛАГ: найден ли поезд?
        self.train_found_session = False

    def check_zone(self, bbox, frame_w, frame_h):
        foot_x = int((bbox[0] + bbox[2]) / 2)
        foot_y = int(bbox[3])
        return zone_service.check_point(self.video_db_id, foot_x, foot_y, frame_w, frame_h)

    def analyze_complex_activity(self, worker: WorkerState, bbox, kpts):
        center = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
        worker.positions.append(center)

        if kpts is not None:
            worker.keypoints_history.append(np.array(kpts))

        if len(worker.positions) < 5:
            return "Анализ..."

        positions = np.array(worker.positions)
        dist = np.linalg.norm(positions[-1] - positions[0])
        movement_intensity = dist

        current_state = "Стоит" if movement_intensity < 10 else "Идет"

        if kpts is None:
            return current_state

        hands_active = False
        if len(worker.keypoints_history) > 5:
            past_kpts = np.array(worker.keypoints_history)
            wrists = past_kpts[:, [9, 10], :2]
            if np.mean(np.std(wrists, axis=0)) > 2.0:
                hands_active = True

        if movement_intensity > 20.0:
            return "Идет"
        elif hands_active:
            return "Работает"

        box_h = bbox[3] - bbox[1]
        box_w = bbox[2] - bbox[0]
        if box_w > box_h * 0.8 and movement_intensity < 10:
            return "Сидит"

        return "Стоит"

    def check_spatial_logic(self, person_box, object_box):
        px1, py1, px2, py2 = person_box
        ox1, oy1, ox2, oy2 = object_box
        o_cx, o_cy = (ox1 + ox2) / 2, (oy1 + oy2) / 2
        return (px1 - 40 < o_cx < px2 + 40) and (py1 - 60 < o_cy < py2 + 60)

    async def process(self):
        print(f"🚀 ENTERPRISE PIPELINE STARTED: Video {self.video_db_id}")
        cap = cv2.VideoCapture(self.video_path)
        frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
        frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080
        fps = cap.get(cv2.CAP_PROP_FPS) or 25

        async with AsyncSessionLocal() as db:
            frame_id = 0
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                frame_id += 1
                current_ts = frame_id / fps  # секунды от начала ролика

                # Инициализируем базовое время, если ещё не было
                if self.video_start_dt is None:
                    self.video_start_dt = datetime.utcnow()

                # Fallback-время кадра: от старта + current_ts
                video_dt = self.video_start_dt + timedelta(seconds=current_ts)

                OCR_INTERVAL_SEC = 10  # Проверяем OCR раз в 10 секунд

                if frame_id % int(fps * OCR_INTERVAL_SEC) == 0:
                    ts = ocr_instance.extract_timestamp(frame)
                    if ts:
                        self.current_real_time = ts
                        try:
                            if len(ts) > 8:
                                real_dt = datetime.strptime(ts, "%Y-%m-%d%H:%M:%S")
                            else:
                                base_date = self.video_start_dt.date()
                                real_dt = datetime.strptime(
                                    base_date.strftime("%Y-%m-%d") + ts,
                                    "%Y-%m-%d%H:%M:%S",
                                )
                            self.video_start_dt = real_dt - timedelta(seconds=current_ts)
                            video_dt = real_dt
                            self.current_video_dt = real_dt
                        except ValueError:
                            pass

                if video_dt is not None:
                    self.current_video_dt = video_dt
                else:
                    video_dt = self.current_video_dt

                if frame_id % 3 != 0: continue

                # 1. AI INFERENCE (Детекция людей)
                detections = detector_instance.detect_with_slicing(frame)

                # Фильтруем людей
                raw_objects = [d for d in detections if d["class_name"] == "person"]
                ppe_objects = [d for d in detections if d["class_name"] not in ["person", "train"]]

                # 2. ID RECOVERY (Трекинг людей)
                raw_objects.sort(key=lambda x: x['track_id'] if x['track_id'] is not None else 999999)
                final_objects = []
                used_ids = set()

                for p in raw_objects:
                    if p['track_id'] is None: continue
                    tid = p['track_id']
                    bbox = p['bbox']
                    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
                    recovered_id = tid
                    min_dist = 10000
                    match_ghost = None
                    for gid, (gx, gy, gframe) in self.ghost_tracks.items():
                        if frame_id - gframe < 30:
                            dist = ((cx - gx) ** 2 + (cy - gy) ** 2) ** 0.5
                            if dist < 150 and dist < min_dist:
                                min_dist = dist
                                match_ghost = gid
                    if match_ghost is not None:
                        if match_ghost < recovered_id:
                            recovered_id = match_ghost
                        elif recovered_id != match_ghost and recovered_id in used_ids:
                            recovered_id = match_ghost
                    p['track_id'] = recovered_id
                    if recovered_id not in used_ids:
                        used_ids.add(recovered_id)
                        final_objects.append(p)
                        self.ghost_tracks[recovered_id] = (cx, cy, frame_id)

                final_persons = [o for o in final_objects if o["class_name"] == "person"]

                # --- ЛОГИКА ПОЕЗДА (Full-Frame OCR) ---
                # Работаем только если поезд ЕЩЕ НЕ БЫЛ НАЙДЕН в этой сессии
                if not self.train_found_session and frame_id % int(fps) == 0:
                    h, w, _ = frame.shape
                    train_info = ocr_instance.extract_train_from_full_frame(frame)

                    if train_info:
                        print(f"[DEBUG] full-frame train OCR={train_info}")
                        model, number, conf = train_info

                        # Нормализация
                        if model == "Э20": model = "ЭП20"
                        if not model.startswith("Э"):
                            model = "Э" + model

                        train_id = f"{model}-{number}"

                        evt = self.train_tracker.update_presence(train_id, video_dt, frame_id)
                        if evt and evt["event_type"] == "arrival":
                            print(f"🚂 ARRIVAL {train_id} at {video_dt} (video {self.video_db_id})")
                            te = TrainEvent(
                                video_id=self.video_db_id,
                                train_model=model,
                                train_number=number,
                                full_train_id=train_id,
                                event_type="arrival",
                                timestamp=video_dt,
                                frame_number=frame_id,
                                bbox_x1=None, bbox_y1=None, bbox_x2=None, bbox_y2=None,
                                confidence=conf,
                            )
                            db.add(te)
                            await db.commit()
                            await db.refresh(te)

                            # ВАЖНО: Ставим флаг, что поезд найден.
                            # Больше OCR делать не будем, но цикл продолжится!
                            print("✅ Поезд записан. Выключаем поиск поездов, продолжаем анализ людей.")
                            self.train_found_session = True

                # --- ЛОГИКА ЛЮДЕЙ (ПРОДОЛЖАЕТ РАБОТАТЬ) ---
                for person in final_persons:
                    tid = person["track_id"]
                    bbox = person["bbox"]
                    kpts = person.get("keypoints")

                    if tid not in self.workers: self.workers[tid] = WorkerState(tid)
                    worker = self.workers[tid]

                    zone = self.check_zone(bbox, frame_w, frame_h)
                    worker.zone = zone
                    activity = self.analyze_complex_activity(worker, bbox, kpts)
                    worker.state = activity

                    violations = []
                    if kpts is not None:
                        if (bbox[2] - bbox[0]) > (bbox[3] - bbox[1]) * 1.2: violations.append("fall_detected")

                    for obj in ppe_objects:
                        if self.check_spatial_logic(bbox, obj['bbox']):
                            if obj['class_name'] == 'head_nohelmet':
                                violations.append("no_helmet")
                            elif obj['class_name'] == 'face_nomask':
                                violations.append("no_mask")
                            elif obj['class_name'] == 'hand_noglove':
                                violations.append("no_glove")

                    violations = list(set(violations))
                    if zone == "Danger Zone": violations.append("zone_intrusion")

                    if violations:
                        points = 0
                        for v in violations:
                            worker.violation_buffer[v].append(True)
                            points += 10 if v == 'no_helmet' else 5
                        worker.risk_score += points

                        stable_violation = None
                        for v in violations:
                            if sum(worker.violation_buffer[v]) >= 2:
                                stable_violation = v
                                break

                        if stable_violation:
                            import time
                            now = time.time()
                            if now - self.last_alert_time[tid] > 1.5:
                                print(f"🚨 INCIDENT: Worker #{tid} | {activity} in {zone} | {violations}")
                                event = SafetyEvent(
                                    timestamp=datetime.utcnow(),
                                    video_timestamp=current_ts,
                                    real_time=self.current_real_time,
                                    camera_id="CAM-01",
                                    event_type=stable_violation,
                                    confidence=person["confidence"],
                                    bbox=person["bbox"],
                                    track_id=tid,
                                    video_id=self.video_db_id,
                                    action=activity,
                                    zone=zone
                                )
                                db.add(event)
                                self.last_alert_time[tid] = now
                                for v in violations: worker.violation_buffer[v].clear()

                if frame_id % int(fps) == 0:
                    await db.commit()
                    await asyncio.sleep(0.001)

            await db.commit()
            cap.release()
        print("✅ ENTERPRISE ANALYSIS COMPLETE")
