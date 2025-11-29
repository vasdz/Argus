from fastapi import APIRouter, UploadFile, File, Depends, BackgroundTasks, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc, func
from app.db.session import get_db
from app.db.models import VideoFile, SafetyEvent
from app.services.video_stream import start_video_processing_task
import shutil
import os
from pydantic import BaseModel
from typing import List, Union
from app.services.zones import zone_service
from app.api.v1.endpoints import trains

api_router = APIRouter()

class AIQuery(BaseModel):
    query: str

api_router.include_router(trains.router, prefix="/trains", tags=["trains"])

@api_router.post("/ask_ai")
async def ask_ai_agent(body: AIQuery, db: AsyncSession = Depends(get_db)):
    return {"answer": "Анализ завершен. Умный агент готов к работе."}

@api_router.post("/reset_db")
async def reset_db(db: AsyncSession = Depends(get_db)):
    """Полная очистка базы данных (для демо)"""
    try:
        await db.execute(delete(SafetyEvent))
        await db.execute(delete(VideoFile))
        await db.commit()

        folder = 'app/temp'
        if os.path.exists(folder):
            for filename in os.listdir(folder):
                file_path = os.path.join(folder, filename)
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)

        return {"status": "Database cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- СТАТИСТИКА ---
@api_router.get("/stats")
async def get_stats(video_id: int = Query(None), db: AsyncSession = Depends(get_db)):
    base_query = select(SafetyEvent)
    if video_id:
        base_query = base_query.where(SafetyEvent.video_id == video_id)

    count_q = select(func.count()).select_from(base_query.subquery())
    res = await db.execute(count_q)
    total = res.scalar_one()

    workers_q = select(func.count(func.distinct(SafetyEvent.track_id))).select_from(base_query.subquery())
    res_w = await db.execute(workers_q)
    workers_total = res_w.scalar_one()

    safety_score = max(100 - total * 2, 0)

    bucket_col = func.floor(SafetyEvent.video_timestamp).label("sec")
    trend_base = select(bucket_col, func.count(SafetyEvent.id))
    if video_id:
        trend_base = trend_base.where(SafetyEvent.video_id == video_id)

    trend_q = trend_base.group_by(bucket_col).order_by(bucket_col)
    trend_res = await db.execute(trend_q)
    trend_rows = trend_res.all()

    incidents_trend = []
    for sec, cnt in trend_rows:
        sec = int(sec or 0)
        m = sec // 60
        s = sec % 60
        time_str = f"{m:02d}:{s:02d}"
        incidents_trend.append({"time": time_str, "count": cnt})

    return {
        "total_incidents": total,
        "safety_score": safety_score,
        "trir": round(total / (workers_total + 1) * 0.2, 2),
        "active_cameras": 1,
        "workers_total": workers_total,
        "incidents_trend": incidents_trend,
    }

# --- ВИДЕО ---
@api_router.get("/videos")
async def get_videos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VideoFile).order_by(desc(VideoFile.upload_time)))
    videos = result.scalars().all()
    return [{
        "id": v.id,
        "filename": v.filename,
        "processed": v.processed,
        "url": f"http://localhost:8000/static/{v.filename}"
    } for v in videos]

@api_router.post("/upload_video")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...),
                       db: AsyncSession = Depends(get_db)):
    if not os.path.exists("app/temp"):
        os.makedirs("app/temp")

    file_location = f"app/temp/{file.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)

    new_video = VideoFile(filename=file.filename, processed=0)
    db.add(new_video)
    await db.commit()
    await db.refresh(new_video)

    background_tasks.add_task(start_video_processing_task, file_location, new_video.id)
    return {"id": new_video.id, "filename": file.filename}

@api_router.delete("/videos/{video_id}")
async def delete_video(video_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(SafetyEvent).where(SafetyEvent.video_id == video_id))
    result = await db.execute(select(VideoFile).where(VideoFile.id == video_id))
    video = result.scalar_one_or_none()
    if video:
        try:
            if os.path.exists(f"app/temp/{video.filename}"):
                os.remove(f"app/temp/{video.filename}")
        except:
            pass
        await db.delete(video)
        await db.commit()
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Video not found")

@api_router.get("/videos/{video_id}/events")
async def get_video_events(video_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SafetyEvent).where(SafetyEvent.video_id == video_id).order_by(desc(SafetyEvent.timestamp)))
    events = result.scalars().all()

    return [{
        "id": e.id,
        "type": e.event_type,
        "timestamp": e.timestamp,
        "video_timestamp": e.video_timestamp,
        "track_id": e.track_id,
        "bbox": e.bbox,
        "action": e.action,
        "zone": e.zone,
        "real_time": e.real_time
    } for e in events]

@api_router.get("/videos/{video_id}/risk_ranking")
async def get_risk_ranking(video_id: int, db: AsyncSession = Depends(get_db)):
    query = select(SafetyEvent.track_id, SafetyEvent.event_type, func.count(SafetyEvent.id)) \
        .where(SafetyEvent.video_id == video_id) \
        .where(SafetyEvent.track_id.is_not(None)) \
        .group_by(SafetyEvent.track_id, SafetyEvent.event_type)

    result = await db.execute(query)
    ranking = {}

    for track_id, v_type, count in result.all():
        if track_id not in ranking:
            ranking[track_id] = {"id": track_id, "score": 0, "violations": {}}

        points = 50 if "fall" in v_type else (20 if "zone" in v_type else (10 if "helmet" in v_type else 5))
        ranking[track_id]["score"] += points * count
        ranking[track_id]["violations"][v_type] = count

    return sorted(ranking.values(), key=lambda x: x['score'], reverse=True)[:5]

# --- ЗОНЫ ---

# Объявляем модель, которую используем ниже в Union
class ZoneUpdateModel(BaseModel):
    points: List[List[float]]

@api_router.post("/update_zone")
async def set_danger_zone(
        body: Union[ZoneUpdateModel, List[List[float]]], # Union теперь работает
        video_id: int = Query(1)
):
    """
    Принимает зону.
    video_id передаем через Query параметр.
    Body может быть списком точек или объектом {points: []}
    """
    points = []
    # Проверяем тип входящих данных
    if isinstance(body, list):
        points = body
    elif isinstance(body, ZoneUpdateModel):
        points = body.points

    print(f"📥 ZONE UPDATE for Video {video_id}: {len(points)} points")

    if len(points) < 3:
        raise HTTPException(status_code=400, detail="Need at least 3 points")

    zone_service.set_zone(video_id, points)

    return {"status": "Zone updated", "video_id": video_id}

@api_router.get("/get_zone")
async def get_danger_zone(video_id: int = Query(1)):
    zone = zone_service.get_zone(video_id)
    return zone


@api_router.post("/videos/{video_id}/reprocess")
async def reprocess_video(video_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # 1. Находим видео
    video = await db.get(VideoFile, video_id)
    if not video: return {"error": "not found"}

    # 2. Удаляем старые события
    await db.execute(delete(SafetyEvent).where(SafetyEvent.video_id == video_id))
    await db.commit()

    # 3. Запускаем процесс заново
    # Путь к файлу нужно восстановить, если он сохранился, или хранить путь в БД
    # У тебя в upload_video путь: f"app/temp/{file.filename}"
    file_path = f"app/temp/{video.filename}"

    background_tasks.add_task(start_video_processing_task, file_path, video_id)
    return {"status": "reprocessing started"}
