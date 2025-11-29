import cv2
from ultralytics import YOLO
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction
import numpy as np

# Укажите путь к модели, когда она доучится
MODEL_PATH = "scripts\Argus_Train\run_p2_lowmem_v215\weights\best.pt"
MODEL_PATH = "yolo11n.pt" # Пока заглушка для теста кода

# Инициализация
try:
    detection_model = AutoDetectionModel.from_pretrained(
        model_type='yolov11',
        model_path=MODEL_PATH,
        confidence_threshold=0.25,
        device="cuda:0"
    )
    print("Модель загружена!")
except Exception as e:
    print(f"Ошибка загрузки: {e}")

# Если код дошел сюда и не упал - значит окружение готово к бою.
