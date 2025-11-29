import cv2
import time
import traceback
import logging
import threading
import os
import numpy as np
from datetime import datetime
from ultralytics import YOLO
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction

# ================= КОНФИГУРАЦИЯ МОДЕЛЕЙ =================
MODEL_P2_PATH = r'../scripts/Argus_Train/run_p2_lowmem_v215/weights/best.pt'
MODEL_PPE_PATH = r'../data/models/argus_ppe_v12/weights/best.pt'
MODEL_POSE_PATH = 'yolo11n-pose.pt'

# ================= НАСТРОЙКИ СИСТЕМЫ =================
VIDEO_SOURCE = 0

# SAHI параметры (для P2-детектора)
USE_SAHI = True  # Включить/выключить режим нарезки
SLICE_SIZE = 640
SLICE_OVERLAP = 0.2

# Пороги
MIN_HEIGHT_FOR_PPE = 80
MIN_HEIGHT_FOR_POSE = 60
CONF_THRESH = 0.25

# Heatmap
HEATMAP_ALPHA = 0.4
HEATMAP_DECAY = 0.995
HEATMAP_INTENSITY = 20

# Система
RECONNECT_DELAY = 5
WATCHDOG_TIMEOUT = 30
EVIDENCE_DIR = "detections_evidence"
LOG_FILE = "argus_system.log"


# ================= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =================
class HeatmapGenerator:
    def __init__(self, width, height):
        self.heatmap_accum = np.zeros((height, width), dtype=np.float32)

    def update(self, detections):
        self.heatmap_accum *= HEATMAP_DECAY
        for bbox in detections:
            x1, y1, x2, y2 = map(int, bbox)
            h, w = self.heatmap_accum.shape
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            self.heatmap_accum[y1:y2, x1:x2] += HEATMAP_INTENSITY
        np.clip(self.heatmap_accum, 0, 255, out=self.heatmap_accum)

    def apply_to_frame(self, frame):
        heatmap_uint8 = self.heatmap_accum.astype(np.uint8)
        colored_heatmap = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
        return cv2.addWeighted(frame, 1.0 - HEATMAP_ALPHA, colored_heatmap, HEATMAP_ALPHA, 0)


def enhance_image(image):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    avg_brightness = np.mean(l)
    if avg_brightness < 90:
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        limg = cv2.merge((cl, a, b))
        return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR), True
    return image, False


def classify_pose(keypoints):
    if keypoints is None or len(keypoints) == 0:
        return "Unknown"
    kps = keypoints[0] if len(keypoints.shape) > 1 else keypoints
    nose = kps[0]
    left_shoulder = kps[5]
    right_shoulder = kps[6]
    left_hip = kps[11]
    right_hip = kps[12]
    visible = sum([1 for kp in [nose, left_shoulder, right_shoulder, left_hip, right_hip]
                   if len(kp) > 2 and kp[2] > 0.5])
    if visible < 3:
        return "Unknown"
    if len(nose) > 1 and len(left_hip) > 1:
        vertical_diff = left_hip[1] - nose[1]
        if vertical_diff < 20:
            return "Fallen"
        if len(left_shoulder) > 1 and left_shoulder[1] < nose[1] - 30:
            return "Working"
    return "Standing"


# ================= ИНИЦИАЛИЗАЦИЯ =================
os.makedirs(EVIDENCE_DIR, exist_ok=True)
logging.basicConfig(filename=LOG_FILE, level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s', filemode='a')
logging.getLogger().addHandler(logging.StreamHandler())

last_frame_time = time.time()
watchdog_active = True
fall_timers = {}


def watchdog_monitor():
    global last_frame_time, watchdog_active
    logging.info("🛡️ Watchdog запущен")
    while watchdog_active:
        time.sleep(5)
        elapsed = time.time() - last_frame_time
        if elapsed > WATCHDOG_TIMEOUT:
            logging.critical(f"💀 ЗАВИСАНИЕ! {elapsed:.1f}с")
            os._exit(1)


def load_models():
    logging.info("🔄 Загрузка моделей...")

    # Модель 1: P2-Detector с SAHI
    if USE_SAHI:
        model_p2 = AutoDetectionModel.from_pretrained(
            model_type='yolov8',
            model_path=MODEL_P2_PATH,
            confidence_threshold=CONF_THRESH,
            device="cuda:0"
        )
        logging.info(f"✅ P2-Detector (SAHI Mode) загружен: {MODEL_P2_PATH}")
    else:
        model_p2 = YOLO(MODEL_P2_PATH)
        logging.info(f"✅ P2-Detector (Standard) загружен: {MODEL_P2_PATH}")

    # Модель 2: PPE
    try:
        model_ppe = YOLO(MODEL_PPE_PATH)
        logging.info(f"✅ PPE-Checker загружен: {MODEL_PPE_PATH}")
    except Exception as e:
        logging.warning(f"⚠️ PPE-модель не найдена: {e}")
        model_ppe = None

    # Модель 3: Pose
    model_pose = YOLO(MODEL_POSE_PATH)
    logging.info(f"✅ Pose-Estimator загружен: {MODEL_POSE_PATH}")

    return model_p2, model_ppe, model_pose


def run_system():
    global last_frame_time, fall_timers

    wd_thread = threading.Thread(target=watchdog_monitor, daemon=True)
    wd_thread.start()

    model_p2, model_ppe, model_pose = load_models()
    heatmap = None
    last_save_time = 0

    while True:
        cap = None
        try:
            logging.info(f"📡 Подключение: {VIDEO_SOURCE}")
            cap = cv2.VideoCapture(VIDEO_SOURCE)
            if not cap.isOpened():
                raise Exception("Ошибка открытия камеры")

            ret, frame = cap.read()
            if ret:
                h, w = frame.shape[:2]
                heatmap = HeatmapGenerator(w, h)

            logging.info("🚀 Старт обработки")
            frame_count = 0

            while True:
                ret, frame = cap.read()
                current_time = time.time()
                last_frame_time = current_time
                if not ret:
                    break

                frame_count += 1
                enhanced_frame, is_night = enhance_image(frame)

                # --- STAGE 1: P2-DETECTOR (с SAHI или без) ---
                try:
                    current_detections = []
                    boxes_data = []  # [x1, y1, x2, y2, conf]

                    if USE_SAHI:
                        # SAHI режим
                        sahi_result = get_sliced_prediction(
                            enhanced_frame,
                            model_p2,
                            slice_height=SLICE_SIZE,
                            slice_width=SLICE_SIZE,
                            overlap_height_ratio=SLICE_OVERLAP,
                            overlap_width_ratio=SLICE_OVERLAP,
                            perform_standard_pred=True,
                            verbose=0
                        )

                        for obj in sahi_result.object_prediction_list:
                            bbox = obj.bbox.to_xyxy()
                            x1, y1, x2, y2 = map(int, bbox)
                            conf = obj.score.value
                            boxes_data.append([x1, y1, x2, y2, conf])
                    else:
                        # Стандартный режим
                        results_p2 = model_p2.predict(enhanced_frame, conf=CONF_THRESH,
                                                      verbose=False, classes=[0])
                        for result in results_p2:
                            for box in result.boxes:
                                x1, y1, x2, y2 = map(int, box.xyxy[0])
                                conf = float(box.conf[0])
                                boxes_data.append([x1, y1, x2, y2, conf])

                    # --- Обработка каждой детекции ---
                    for i, bbox_data in enumerate(boxes_data):
                        x1, y1, x2, y2, conf = bbox_data
                        current_detections.append([x1, y1, x2, y2])

                        width = x2 - x1
                        height = y2 - y1
                        color = (0, 255, 0)
                        label = f"Person {conf:.2f}"
                        violations = []

                        # --- STAGE 2: PPE-CHECK ---
                        if height >= MIN_HEIGHT_FOR_PPE and model_ppe is not None:
                            person_crop = enhanced_frame[y1:y2, x1:x2]
                            ppe_results = model_ppe.predict(person_crop, conf=0.4, verbose=False)

                            has_helmet = False
                            has_vest = False

                            for ppe_result in ppe_results:
                                for ppe_box in ppe_result.boxes:
                                    cls_id = int(ppe_box.cls[0])
                                    if cls_id == 0:
                                        has_helmet = True
                                    elif cls_id == 1:
                                        has_vest = True

                            if not has_helmet:
                                violations.append("NO HELMET")
                            if not has_vest:
                                violations.append("NO VEST")

                            if violations:
                                color = (0, 0, 255)
                                label = "⚠️ " + ", ".join(violations)

                        # --- STAGE 3: POSE ---
                        activity = "Far"
                        if height >= MIN_HEIGHT_FOR_POSE:
                            person_crop = enhanced_frame[y1:y2, x1:x2]
                            pose_results = model_pose.predict(person_crop, conf=0.3, verbose=False)

                            if len(pose_results) > 0 and pose_results[0].keypoints is not None:
                                keypoints = pose_results[0].keypoints.data.cpu().numpy()
                                activity = classify_pose(keypoints)

                                aspect_ratio = width / height
                                if activity == "Fallen" or aspect_ratio > 1.2:
                                    if i not in fall_timers:
                                        fall_timers[i] = time.time()
                                    fall_duration = time.time() - fall_timers[i]
                                    if fall_duration > 2.0:
                                        color = (0, 0, 255)
                                        label = f"🚨 MAN DOWN! {fall_duration:.1f}s"
                                        logging.critical(f"ALARM: Падение - кадр {frame_count}")
                                else:
                                    if i in fall_timers:
                                        del fall_timers[i]

                                label += f" | {activity}"

                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, label, (x1, y1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                    # --- HEATMAP ---
                    if heatmap:
                        heatmap.update(current_detections)
                        frame = heatmap.apply_to_frame(frame)

                    # --- EVIDENCE SAVER ---
                    if len(current_detections) > 0 and current_time - last_save_time > 2.0:
                        ts = datetime.now().strftime("%Y%m%d_%H-%M-%S")
                        cv2.imwrite(os.path.join(EVIDENCE_DIR, f"det_{ts}.jpg"), frame)
                        last_save_time = current_time

                except Exception as e:
                    logging.error(f"Ошибка инференса: {e}")
                    logging.error(traceback.format_exc())

                # --- UI ---
                fps = 1.0 / (time.time() - current_time + 0.001)
                mode = "SAHI" if USE_SAHI else "STD"
                status = f"FPS: {fps:.1f} | {mode} | Frame: {frame_count}"
                if is_night:
                    status += " | 🌙 NIGHT"

                cv2.putText(frame, status, (20, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                cv2.imshow("Argus Multi-Model System", frame)

                if cv2.waitKey(1) & 0xFF == ord('q'):
                    return

        except KeyboardInterrupt:
            logging.info("🛑 Остановка")
            break
        except Exception as e:
            logging.error(f"🔥 СБОЙ: {e}")
            logging.error(traceback.format_exc())
        finally:
            if cap:
                cap.release()
            cv2.destroyAllWindows()

        time.sleep(RECONNECT_DELAY)


def start_detection_service():
    """
    Точка входа для запуска из FastAPI.
    Запускается в отдельном потоке.
    """
    print("="*50)
    print("   ARGUS DETECTION SERVICE STARTED")
    print("="*50)
    run_system()

if __name__ == "__main__":
    # Для standalone запуска (через python inference_service.py)
    start_detection_service()
