# backend/app/db/models.py
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()


class VideoFile(Base):
    __tablename__ = "videos"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    filepath = Column(String)
    upload_time = Column(DateTime, default=datetime.utcnow)
    processed = Column(Integer, default=0)

    events = relationship("SafetyEvent", back_populates="video", cascade="all, delete")
    train_events = relationship("TrainEvent", back_populates="video", cascade="all, delete")


class SafetyEvent(Base):
    __tablename__ = "safety_events"
    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"))
    timestamp = Column(DateTime)
    video_timestamp = Column(Float)
    real_time = Column(String, nullable=True)
    camera_id = Column(String)
    event_type = Column(String)
    confidence = Column(Float)
    track_id = Column(Integer)
    bbox = Column(JSON)
    action = Column(String, default="Unknown")
    zone = Column(String, default="Safe")

    video = relationship("VideoFile", back_populates="events")


class TrainEvent(Base):
    __tablename__ = "train_events"
    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False)
    train_model = Column(String, nullable=False)
    train_number = Column(String, nullable=False)
    full_train_id = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    frame_number = Column(Integer)
    bbox_x1 = Column(Integer)
    bbox_y1 = Column(Integer)
    bbox_x2 = Column(Integer)
    bbox_y2 = Column(Integer)
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    video = relationship("VideoFile", back_populates="train_events")
