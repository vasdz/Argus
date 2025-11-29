# backend/app/services/tracker.py
from ultralytics import YOLO
import numpy as np
from typing import List, Dict, Any


class ObjectTracker:
    def __init__(self, model_path: str = "yolo11n.pt"):
        print(f"Initializing Tracker with {model_path}...")
        self.model = YOLO(model_path)

    def track_frame(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Запускает трекинг на одном кадре.
        Возвращает детекции + track_id.
        """
        # persist=True важен для трекинга видеопотока!
        results = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
            classes=[0]  # Только люди пока
        )[0]

        tracked_objects = []

        if results.boxes and results.boxes.id is not None:
            boxes = results.boxes.xyxy.cpu().numpy().astype(int)
            track_ids = results.boxes.id.cpu().numpy().astype(int)
            confs = results.boxes.conf.cpu().numpy()

            for box, track_id, conf in zip(boxes, track_ids, confs):
                tracked_objects.append({
                    "track_id": int(track_id),
                    "bbox": box.tolist(),  # [x1, y1, x2, y2]
                    "confidence": float(conf),
                    "class_name": "person"
                })

        return tracked_objects


tracker_instance = ObjectTracker()
