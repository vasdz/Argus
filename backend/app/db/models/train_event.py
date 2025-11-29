# backend/app/db/models/train_event.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.db.session import Base
from datetime import datetime


class TrainEvent(Base):
    __tablename__ = "train_events"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False)

    # Данные поезда
    train_model = Column(String, nullable=False)  # "ЭП20"
    train_number = Column(String, nullable=False)  # "076"
    full_train_id = Column(String, nullable=False, index=True)  # "ЭП20-076"

    # События
    event_type = Column(String, nullable=False)  # "arrival" или "departure"
    timestamp = Column(DateTime, nullable=False)  # Время с видео (OCR)
    frame_number = Column(Integer)

    # Координаты на кадре (опционально)
    bbox_x1 = Column(Integer)
    bbox_y1 = Column(Integer)
    bbox_x2 = Column(Integer)
    bbox_y2 = Column(Integer)

    # Метаданные
    confidence = Column(Float, default=0.0)  # Уверенность OCR
    created_at = Column(DateTime, default=datetime.utcnow)

    # Связь с видео
    video = relationship("Video", back_populates="train_events")

# Добавьте в backend/app/db/models/__init__.py:


# И в модель Video добавьте:
# train_events = relationship("TrainEvent", back_populates="video")
