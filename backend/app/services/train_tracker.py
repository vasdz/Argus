# backend/app/services/train_tracker.py
from datetime import datetime
from typing import Dict, Optional, List


class TrainTracker:
    """
    Держит в памяти активные поезда и решает:
    - когда считать, что поезд ПРИЕХАЛ (первое появление),
    - когда УЕХАЛ (нет в кадре N секунд).
    """
    def __init__(self, departure_timeout: int = 30):
        self.departure_timeout = departure_timeout  # секунд без поезда до события departure
        self.active_trains: Dict[str, dict] = {}    # train_id -> state

    def update_presence(
        self,
        train_id: str,
        ts: datetime,
        frame_number: int,
    ) -> Optional[dict]:
        """
        Вызывается каждый раз, когда на кадре нашли этот train_id.
        Возвращает dict-событие arrival (один раз) или None.
        """
        state = self.active_trains.get(train_id)

        if state is None:
            # Это первое появление поезда -> ARRIVAL
            self.active_trains[train_id] = {
                "arrival_time": ts,
                "last_seen": ts,
                "arrival_frame": frame_number,
            }
            return {
                "event_type": "arrival",
                "train_id": train_id,
                "timestamp": ts,
                "frame_number": frame_number,
            }

        # Уже на станции – просто обновляем last_seen
        state["last_seen"] = ts
        return None

    def check_departures(self, now: datetime) -> List[dict]:
        """
        Периодически вызываем, чтобы понять, какие поезда «пропали» с камеры.
        Возвращает список departure-событий.
        """
        departures = []
        to_delete = []

        for train_id, state in self.active_trains.items():
            delta = (now - state["last_seen"]).total_seconds()
            if delta > self.departure_timeout:
                duration_sec = (state["last_seen"] - state["arrival_time"]).total_seconds()
                departures.append({
                    "event_type": "departure",
                    "train_id": train_id,
                    "timestamp": state["last_seen"],
                    "arrival_time": state["arrival_time"],
                    "duration_seconds": duration_sec,
                })
                to_delete.append(train_id)

        for tid in to_delete:
            del self.active_trains[tid]

        return departures
