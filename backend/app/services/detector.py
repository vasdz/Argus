# backend/app/services/detector.py
from ultralytics import YOLO
import os
from pathlib import Path


class GodModeDetector:
    def __init__(self):
        # Определяем корневую папку проекта (Argus/)
        BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

        # 1. PPE МОДЕЛЬ (Каски, жилеты, маски)
        self.ppe_model_path = str(BASE_DIR / 'data' / 'models' / 'argus_ppe_v12' / 'weights' / 'best.pt')

        if os.path.exists(self.ppe_model_path):
            print(f"⚡ LOADING PPE MODEL: {self.ppe_model_path}")
            self.ppe_model = YOLO(self.ppe_model_path)
        else:
            print(f"⚠️ WARNING: PPE model not found at {self.ppe_model_path}")
            self.ppe_model = None

        # 2. P2 МОДЕЛЬ (Дальний детектор людей)
        self.p2_model_path = str(BASE_DIR / 'scripts' / 'Argus_Train' / 'run_p2_lowmem_v215' / 'weights' / 'best.pt')

        if os.path.exists(self.p2_model_path):
            print(f"⚡ LOADING P2 MODEL: {self.p2_model_path}")
            self.p2_model = YOLO(self.p2_model_path)
        else:
            print(f"⚠️ WARNING: P2 model not found at {self.p2_model_path}")
            self.p2_model = None

        # 3. POSE МОДЕЛЬ (Скелеты для аналитики действий)
        self.pose_model_path = 'yolo11n-pose.pt'  # Скачается автоматически
        print(f"⚡ LOADING POSE MODEL: {self.pose_model_path}")
        self.pose_model = YOLO(self.pose_model_path)

        self.class_map = {
            0: 'boots', 1: 'face_mask', 2: 'face_nomask', 3: 'glasses',
            4: 'goggles', 5: 'hand_glove', 6: 'hand_noglove', 7: 'head_helmet',
            8: 'head_nohelmet', 9: 'person', 10: 'shoes', 11: 'vest'
        }

    def detect_with_slicing(self, frame, conf_threshold=0.35):
        """
        Гибридный пайплайн:
        - P2 Model: Находит ВСЕХ людей (дальние + ближние).
        - Pose Model: Получает скелеты + трекинг.
        - PPE Model: Находит экипировку.
        """

        combined_detections = []

        # 1. P2 DETECTION (Дальнобойный поиск людей)
        # Если P2 модель есть, используем её для первичного поиска
        people_boxes = []

        if self.p2_model is not None:
            p2_results = self.p2_model(
                frame,
                conf=0.25,
                imgsz=1280,
                verbose=False,
                classes=[0]  # Только люди
            )[0]

            if p2_results.boxes:
                people_boxes = p2_results.boxes.xyxy.cpu().numpy()

        # 2. POSE TRACKING (Люди + Скелеты)
        # Используем Pose модель для трекинга людей + скелеты
        pose_results = self.pose_model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            conf=0.5,
            imgsz=640,
            verbose=False,
            classes=[0]
        )[0]

        # Собираем ЛЮДЕЙ из Pose модели (они будут иметь скелеты + ID)
        if pose_results.boxes:
            boxes = pose_results.boxes.xyxy.cpu().numpy()
            track_ids = pose_results.boxes.id.cpu().numpy() if pose_results.boxes.id is not None else [-1] * len(boxes)
            keypoints = pose_results.keypoints.data.cpu().numpy() if pose_results.keypoints is not None else None

            for i, box in enumerate(boxes):
                track_id = int(track_ids[i])
                kpts = keypoints[i].tolist() if keypoints is not None else None

                combined_detections.append({
                    "class_name": "person",
                    "bbox": box.astype(int).tolist(),
                    "confidence": float(pose_results.boxes.conf[i]),
                    "track_id": track_id,
                    "keypoints": kpts
                })

        # Добавляем людей из P2, которых не нашла Pose (дальние планы)
        if len(people_boxes) > 0:
            # Простая фильтрация дубликатов по IoU
            existing_boxes = [d['bbox'] for d in combined_detections if d['class_name'] == 'person']
            for p2_box in people_boxes:
                is_duplicate = False
                for ex_box in existing_boxes:
                    # Проверка пересечения (упрощенная)
                    iou = self._calculate_iou(p2_box, ex_box)
                    if iou > 0.5:
                        is_duplicate = True
                        break

                if not is_duplicate:
                    combined_detections.append({
                        "class_name": "person",
                        "bbox": p2_box.astype(int).tolist(),
                        "confidence": 0.0,  # P2 не имеет conf в этом контексте
                        "track_id": -1,
                        "keypoints": None
                    })

        # 3. PPE DETECTION (Экипировка)
        if self.ppe_model is not None:
            ppe_results = self.ppe_model(
                frame,
                conf=conf_threshold,
                imgsz=1280,
                verbose=False
            )[0]

            if ppe_results.boxes:
                for box in ppe_results.boxes:
                    cls_id = int(box.cls[0])
                    cls_name = self.class_map.get(cls_id, "unknown")

                    # Людей берем только из Pose/P2 моделей
                    if cls_name == 'person':
                        continue

                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)

                    combined_detections.append({
                        "class_name": cls_name,
                        "bbox": [x1, y1, x2, y2],
                        "confidence": float(box.conf[0]),
                        "track_id": None,
                        "keypoints": None
                    })

        return combined_detections

    def _calculate_iou(self, box1, box2):
        """Простой расчет IoU для фильтрации дубликатов"""
        x1_min, y1_min, x1_max, y1_max = box1[:4]
        x2_min, y2_min, x2_max, y2_max = box2[:4]

        inter_xmin = max(x1_min, x2_min)
        inter_ymin = max(y1_min, y2_min)
        inter_xmax = min(x1_max, x2_max)
        inter_ymax = min(y1_max, y2_max)

        if inter_xmax < inter_xmin or inter_ymax < inter_ymin:
            return 0.0

        inter_area = (inter_xmax - inter_xmin) * (inter_ymax - inter_ymin)
        box1_area = (x1_max - x1_min) * (y1_max - y1_min)
        box2_area = (x2_max - x2_min) * (y2_max - y2_min)
        union_area = box1_area + box2_area - inter_area

        return inter_area / union_area if union_area > 0 else 0.0


# Singleton
detector_instance = GodModeDetector()
