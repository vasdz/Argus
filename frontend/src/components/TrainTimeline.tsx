import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { TrainSummaryItem } from "../types";
import { Paper, Typography, Box } from '@mui/material';
import TrainIcon from '@mui/icons-material/Train';

type Props = {
  videoId: number;
  height?: number;
};

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TrainTimeline({ videoId, height = 280 }: Props) {
  const [data, setData] = useState<TrainSummaryItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await api.getTrainSummary(videoId);
        if (!stop) setData(d);
      } catch (e: unknown) { console.error(e); }
    };

    setLoading(true);
    load().catch((e) => { if (!stop) setErr(e instanceof Error ? e.message : String(e)); })
          .finally(() => { if (!stop) setLoading(false); });

    const intervalId = setInterval(load, 2000);
    return () => { stop = true; clearInterval(intervalId); };
  }, [videoId]);

  const prepared = useMemo(() => {
    if (!data || data.length === 0) return null;

    const intervals = data.map((row) => {
      const a = new Date(row.arrival);
      const d = row.departure ? new Date(row.departure) : null;
      return { ...row, arrivalDate: a, departureDate: d };
    });

    let minT = intervals[0].arrivalDate.getTime();
    let maxT = (intervals[0].departureDate ?? new Date(intervals[0].arrivalDate.getTime() + 10*60000)).getTime();

    for (const it of intervals) {
      minT = Math.min(minT, it.arrivalDate.getTime());
      const end = (it.departureDate ?? new Date(it.arrivalDate.getTime() + 10*60000)).getTime();
      maxT = Math.max(maxT, end);
    }

    maxT += (maxT - minT) * 0.05;
    if (maxT === minT) maxT += 60000;

    return { rows: intervals, minT, maxT };
  }, [data]);

  // --- СТИЛИ ДЛЯ КОНТЕЙНЕРА (СТЕКЛО) ---
  const glassStyle = {
    p: 3,
    bgcolor: 'rgba(20, 20, 30, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    position: 'relative' as const,
    overflow: 'hidden'
  };

  if (loading && !data) return <Paper sx={{ ...glassStyle, textAlign: 'center', color: '#888' }}>LOADING TRAIN DATA...</Paper>;
  if (err) return <Paper sx={{ ...glassStyle, textAlign: 'center', color: '#ff5252' }}>DATA ERROR: {err}</Paper>;

  if (!prepared) {
    return (
      <Paper sx={{ ...glassStyle, textAlign: 'center', color: '#666', borderStyle: 'dashed' }}>
        <TrainIcon sx={{ fontSize: 40, opacity: 0.2, mb: 1 }} />
        <Typography variant="caption" display="block">NO TRAIN ACTIVITY DETECTED</Typography>
      </Paper>
    );
  }

  // --- ПАРАМЕТРЫ ОТРИСОВКИ ---
  const width = 900;
  const padLeft = 140;
  const padRight = 30;
  const padTop = 50;
  const rowH = 40;
  const gap = 16;

  const contentH = prepared.rows.length * (rowH + gap);
  const svgH = Math.max(height, contentH + padTop + 40);

  const scaleX = (t: number) => {
    const x0 = padLeft;
    const x1 = width - padRight;
    return x0 + ((t - prepared.minT) / (prepared.maxT - prepared.minT)) * (x1 - x0);
  };

  const ticks: number[] = [];
  const spanSec = (prepared.maxT - prepared.minT) / 1000;
  const stepSec = spanSec <= 600 ? 60 : spanSec <= 3600 ? 300 : 900;
  const startTick = Math.ceil(prepared.minT / (stepSec * 1000)) * stepSec * 1000;

  for (let t = startTick; t <= prepared.maxT; t += stepSec * 1000) ticks.push(t);

  return (
    <Paper sx={glassStyle}>
      {/* ЗАГОЛОВОК */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TrainIcon sx={{ color: '#FFD700' }} />
          <Typography variant="h6" sx={{ fontFamily: 'Orbitron', color: '#FFF', fontWeight: 700, letterSpacing: 1 }}>
              DEPOT OPERATIONS TIMELINE
          </Typography>
      </Box>

      <Box sx={{ overflowX: 'auto', pb: 1 }}>
        <svg width={width} height={svgH} style={{ minWidth: '100%' }}>
            <defs>
                {/* Градиент для активного поезда (Золото) */}
                <linearGradient id="gradActive" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 0.8 }} />
                    <stop offset="100%" style={{ stopColor: '#FFEA00', stopOpacity: 0.4 }} />
                </linearGradient>
                {/* Градиент для завершенного поезда (Серый) */}
                <linearGradient id="gradDone" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: '#424242', stopOpacity: 0.8 }} />
                    <stop offset="100%" style={{ stopColor: '#616161', stopOpacity: 0.4 }} />
                </linearGradient>
                {/* Паттерн сетки */}
                <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                    <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                </pattern>
            </defs>

            {/* Фон сетки */}
            <rect x={padLeft} y={padTop} width={width - padLeft - padRight} height={svgH - padTop - 20} fill="url(#grid)" />

            {/* Временная шкала */}
            {ticks.map((t, i) => (
            <g key={`tick-${i}`}>
                <line
                x1={scaleX(t)} x2={scaleX(t)}
                y1={padTop} y2={svgH - 20}
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="4 4"
                />
                <text
                x={scaleX(t)} y={svgH - 5}
                textAnchor="middle"
                fontSize={10}
                fill="#666"
                fontFamily="'JetBrains Mono', monospace"
                >
                {fmtTime(new Date(t))}
                </text>
            </g>
            ))}

            {/* Полосы поездов */}
            {prepared.rows.map((row, i) => {
            const y = padTop + i * (rowH + gap);
            const xStart = scaleX(row.arrivalDate.getTime());
            const tEnd = row.departureDate
                ? row.departureDate.getTime()
                : Math.max(row.arrivalDate.getTime() + 60000, prepared.maxT);
            const xEnd = scaleX(tEnd);
            const barW = Math.max(4, xEnd - xStart);
            const isActive = !row.departureDate;

            return (
                <g key={`train-${i}`}>
                {/* Название поезда */}
                <text
                    x={padLeft - 15}
                    y={y + rowH * 0.6}
                    textAnchor="end"
                    fontSize={13}
                    fontWeight={700}
                    fill={isActive ? '#FFD700' : '#AAA'}
                    fontFamily="'Orbitron', sans-serif"
                    letterSpacing={1}
                >
                    {row.train_id}
                </text>

                {/* Линия связи названия с баром */}
                <line
                    x1={padLeft - 10} y1={y + rowH/2}
                    x2={xStart} y2={y + rowH/2}
                    stroke="rgba(255,255,255,0.1)"
                    strokeDasharray="2 2"
                />

                {/* Тело бара */}
                <rect
                    x={xStart}
                    y={y}
                    width={barW}
                    height={rowH}
                    rx={4}
                    fill={isActive ? "url(#gradActive)" : "url(#gradDone)"}
                    stroke={isActive ? "#FFD700" : "#757575"}
                    strokeWidth={1}
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
                />

                {/* Инфо внутри */}
                {barW > 140 && (
                    <text
                    x={xStart + 10}
                    y={y + rowH * 0.6}
                    fontSize={11}
                    fontWeight={600}
                    fill={isActive ? "#000" : "#FFF"}
                    style={{ pointerEvents: "none", textShadow: isActive ? 'none' : '0 1px 2px black' }}
                    fontFamily="monospace"
                    >
                    {fmtTime(row.arrivalDate)} — {row.departureDate ? fmtTime(row.departureDate) : "ACTIVE"}
                    </text>
                )}
                </g>
            );
            })}
        </svg>
      </Box>
    </Paper>
  );
}
