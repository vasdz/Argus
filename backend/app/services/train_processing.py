# backend/app/services/train_processing.py
import cv2
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models import TrainEvent, VideoFile
from app.services.ocr_service import ocr_instance
from app.services.train_tracker import TrainTracker


async def process_trains_for_video(
    video_id: int,
    video_path: str,
    db: AsyncSession,
    frame_step: int = 5,        # анализировать каждый N-й кадр
    departure_timeout: int = 30 # секунд без поезда до departure
):
    tracker = TrainTracker(departure_timeout=departure_timeout)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    frame_idx = 0

    # Можно заранее удостовериться, что видео существует
    res = await db.execute(select(VideoFile).where(VideoFile.id == video_id))
    video_obj = res.scalar_one_or_none()
    if not video_obj:
        print(f"[TRAIN] Video {video_id} not found in DB")
        return

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame_idx += 1
        if frame_idx % frame_step != 0:
            continue

        # 1) OCR времени в левом верхнем углу
        ts_str = ocr_instance.extract_timestamp(frame)
        if not ts_str:
            continue

        # timestamp с видео. Здесь предполагаем формат 'YYYY-MM-DD HH:MM:SS'
        try:
            if len(ts_str) > 8:
                video_ts = datetime.strptime(ts_str, "%Y-%m-%d%H:%M:%S")
            else:
                # fallback: только время, дату можно брать из метаданных видео
                video_ts = datetime.strptime("2022-01-01" + ts_str, "%Y-%m-%d%H:%M:%S")
        except ValueError:
            continue

        # 2) OCR номера поезда (берём весь кадр как bbox)
        h, w, _ = frame.shape
        train_info = ocr_instance.extract_train_number(frame, (0, 0, w, h))
        if not train_info:
            # если поезда нет в кадре, всё равно нужно проверить departures
            for dep in tracker.check_departures(video_ts):
                await _store_departure_event(db, video_id, dep)
            continue

        model, number, conf = train_info
        train_id = f"{model}-{number}"

        # 3) Трекер: первое появление -> arrival
        evt = tracker.update_presence(train_id, video_ts, frame_idx)
        if evt and evt["event_type"] == "arrival":
            await _store_arrival_event(
                db=db,
                video_id=video_id,
                train_id=train_id,
                model=model,
                number=number,
                ts=video_ts,
                frame_number=frame_idx,
                confidence=conf,
            )
            # здесь можно пушнуть Live Event (WebSocket / лог / AI-репорт)

        # 4) Периодически проверяем departures
        for dep in tracker.check_departures(video_ts):
            await _store_departure_event(db, video_id, dep)

    # финальная проверка в конце ролика
    now = datetime.utcnow()
    for dep in tracker.check_departures(now):
        await _store_departure_event(db, video_id, dep)

    cap.release()


async def _store_arrival_event(
    db: AsyncSession,
    video_id: int,
    train_id: str,
    model: str,
    number: str,
    ts: datetime,
    frame_number: int,
    confidence: float,
):
    ev = TrainEvent(
        video_id=video_id,
        train_model=model,
        train_number=number,
        full_train_id=train_id,
        event_type="arrival",
        timestamp=ts,
        frame_number=frame_number,
        confidence=confidence,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    print(f"[TRAIN] ARRIVAL {train_id} at {ts}")

    # TODO: сюда же можно добавить запись в Live Event Log / AI Report,
    # по аналогии с тем, как ты делаешь для SafetyEvent.


async def _store_departure_event(
    db: AsyncSession,
    video_id: int,
    dep: dict,
):
    model, number = dep["train_id"].split("-", 1)
    duration_sec = dep["duration_seconds"]

    ev = TrainEvent(
        video_id=video_id,
        train_model=model,
        train_number=number,
        full_train_id=dep["train_id"],
        event_type="departure",
        timestamp=dep["timestamp"],
        frame_number=None,
        confidence=1.0,
    )
    # Можно сохранить длительность стоянки в отдельную колонку, если добавишь:
    # dwell_seconds = Column(Float) в TrainEvent
    # ev.dwell_seconds = duration_sec

    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    print(f"[TRAIN] DEPARTURE {dep['train_id']} after {duration_sec/60:.1f} min")
    # Тут же — запись в Live Event Log / AI Report.
