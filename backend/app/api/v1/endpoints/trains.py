# backend/app/api/v1/endpoints/trains.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import io, base64

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

from app.db.session import get_db
from app.db.models import TrainEvent

router = APIRouter()


@router.get("/summary/{video_id}")
async def get_trains_summary(video_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(TrainEvent).where(TrainEvent.video_id == video_id).order_by(TrainEvent.timestamp)
    )
    events = res.scalars().all()

    by_train = {}
    for ev in events:
        tid = ev.full_train_id
        by_train.setdefault(tid, []).append(ev)

    summary = []
    for tid, evs in by_train.items():
        arrivals = [e for e in evs if e.event_type == "arrival"]
        departures = [e for e in evs if e.event_type == "departure"]

        for i, arr in enumerate(arrivals):
            dep = departures[i] if i < len(departures) else None
            duration_min = None
            if dep:
                dt = (dep.timestamp - arr.timestamp).total_seconds() / 60.0  # минуты[web:55]
                duration_min = round(dt, 1)
            summary.append({
                "train_id": tid,
                "arrival": arr.timestamp.isoformat(),
                "departure": dep.timestamp.isoformat() if dep else None,
                "duration_minutes": duration_min,
            })

    return summary


@router.get("/chart/{video_id}")
async def get_trains_chart(video_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(TrainEvent).where(TrainEvent.video_id == video_id).order_by(TrainEvent.timestamp)
    )
    events = res.scalars().all()

    by_train = {}
    for ev in events:
        tid = ev.full_train_id
        by_train.setdefault(tid, []).append(ev)

    # Готовим данные для Gantt‑графика (горизонтальные бары)[web:63]
    fig, ax = plt.subplots(figsize=(10, 4))
    y = 0
    yticks = []
    ylabels = []

    for tid, evs in by_train.items():
        arrivals = [e for e in evs if e.event_type == "arrival"]
        departures = [e for e in evs if e.event_type == "departure"]

        for i, arr in enumerate(arrivals):
            dep = departures[i] if i < len(departures) else None
            if not dep:
                continue

            start = mdates.date2num(arr.timestamp)
            end = mdates.date2num(dep.timestamp)
            width = end - start  # в днях

            ax.barh(y, width, left=start, height=0.4, align="center",
                    color="#4CAF50", edgecolor="black")
            yticks.append(y)
            ylabels.append(tid)
            y += 1

    ax.set_yticks(yticks)
    ax.set_yticklabels(ylabels)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M:%S"))
    ax.set_xlabel("Время")
    ax.set_title("Пребывание поездов в депо")
    ax.grid(True, axis="x", alpha=0.3)

    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png", dpi=100)
    buf.seek(0)
    img_b64 = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)

    return {"chart": f"data:image/png;base64,{img_b64}"}
