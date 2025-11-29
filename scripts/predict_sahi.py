from ultralytics import YOLO
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction
import cv2
import numpy as np

# 1. Путь к вашей обученной модели
MODEL_PATH = 'competition_yolo11/yolo11_p2_1280/weights/best.pt'
IMAGE_PATH = 'test_image.jpg'

# 2. Инициализация модели через SAHI
# Используем тип 'yolov8', так как он совместим с YOLO11 в ultralytics
detection_model = AutoDetectionModel.from_pretrained(
    model_type='yolov8',
    model_path=MODEL_PATH,
    confidence_threshold=0.25,
    device="cuda:0"
)

# 3. Параметры нарезки (Slicing)
# slice_height/width - размер окна. Для дальних планов 640 отлично подойдет.
# overlap_ratio - перекрытие 25%
result = get_sliced_prediction(
    IMAGE_PATH,
    detection_model,
    slice_height=640,
    slice_width=640,
    overlap_height_ratio=0.25,
    overlap_width_ratio=0.25,
    perform_standard_pred=True  # Дополнительно прогнать полный кадр для крупных объектов
)

# 4. Визуализация и сохранение
# Конвертация результата в формат OpenCV для отображения
img = cv2.imread(IMAGE_PATH)
for object_prediction in result.object_prediction_list:
    bbox = object_prediction.bbox.to_xyxy()
    score = object_prediction.score.value
    category = object_prediction.category.name

    # Рисуем бокс
    x1, y1, x2, y2 = map(int, bbox)
    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
    label = f"{category} {score:.2f}"
    cv2.putText(img, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

cv2.imwrite("result_sahi.jpg", img)
print("Done! Result saved to result_sahi.jpg")
