from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

# Базовая схема события (нарушения)
class EventBase(BaseModel):
    camera_id: str
    event_type: str  # 'no_helmet', 'fall', 'intrusion'
    confidence: float

class EventCreate(EventBase):
    bbox: List[int]  # [x1, y1, x2, y2]

class Event(EventBase):
    id: int
    timestamp: datetime
    snapshot_url: Optional[str] = None

    class Config:
        from_attributes = True
