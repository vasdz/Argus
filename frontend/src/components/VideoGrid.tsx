import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Button,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VideocamIcon from '@mui/icons-material/Videocam';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import WarningIcon from '@mui/icons-material/Warning';
import CreateIcon from '@mui/icons-material/Create';
import CheckIcon from '@mui/icons-material/Check';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ClearIcon from '@mui/icons-material/Clear';
import { api } from '../services/api';
import { SafetyEvent } from '../types';

interface VideoGridProps {
  currentVideoId?: number | null;
  playbackUrl?: string | null;
  onPlayerReady?: (player: { seekTo: (time: number) => void }) => void;
  onUploadComplete?: (videoId: number) => void;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  currentVideoId,
  playbackUrl,
  onPlayerReady,
  onUploadComplete,
}) => {
  const [uploading, setUploading] = useState(false);
  const [internalUrl, setInternalUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<SafetyEvent[]>([]);

  // РЕЖИМЫ ОТОБРАЖЕНИЯ
  const [hudMode, setHudMode] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [showZones, setShowZones] = useState(true);

  // РИСОВАНИЕ ЗОНЫ
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<{x: number, y: number}[]>([]);
  const [activeZone, setActiveZone] = useState<{x: number, y: number}[]>([]);

  const [lastBoxes, setLastBoxes] = useState<Record<number, SafetyEvent>>({});
  const [hoverTrack, setHoverTrack] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeUrl = playbackUrl || internalUrl;

  // ЦВЕТОВАЯ ПАЛИТРА (SIBINTEK STYLE)
  const COLORS = {
    primary: '#FFD700',   // Золото (Акцент)
    danger: '#FF3D00',    // Красный (Тревога)
    safe: '#FFFFFF',      // Белый (Нейтрально)
    uiBg: 'rgba(10,10,10,0.8)',
    hudText: '#000000'
  };

  // ОПРОС ДАННЫХ
  useEffect(() => {
    if (!currentVideoId) {
      setEvents([]);
      setLastBoxes({});
      setActiveZone([]);
      return;
    }

    const loadZone = async () => {
        try {
            const zone = await api.getZone(currentVideoId);
            if (zone && zone.length > 0) {
                const formatted = zone.map((p: any) => ({ x: p[0], y: p[1] }));
                setActiveZone(formatted);
            } else {
                setActiveZone([]);
            }
        } catch (e) {
            console.error("Failed to load zone", e);
        }
    };
    loadZone();

    const fetch = async () => {
      try {
        const data = await api.getVideoEvents(currentVideoId);
        setEvents(data);
        const map: Record<number, SafetyEvent> = {};
        data.forEach((e) => {
          if (e.track_id != null) map[e.track_id] = e;
        });
        setLastBoxes(map);
      } catch (e) {
        console.error('VideoGrid getVideoEvents error:', e);
      }
    };
    fetch();
    const id = setInterval(fetch, 1000);
    return () => clearInterval(id);
  }, [currentVideoId]);

  // УПРАВЛЕНИЕ ПЛЕЕРОМ
  useEffect(() => {
    if (onPlayerReady && videoRef.current) {
      onPlayerReady({
        seekTo: (time: number) => {
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, time);
            videoRef.current.play();
          }
        },
      });
    }
  }, [onPlayerReady, activeUrl]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadVideo(file);
      if (onUploadComplete) onUploadComplete(res.data.id);
      setInternalUrl(URL.createObjectURL(file));
    } catch (err) {
      alert('Ошибка загрузки видео');
    } finally {
      setUploading(false);
    }
  };

  // --- ЛОГИКА РИСОВАНИЯ ---
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Нормализуем координаты (0..1) относительно размера канваса
    const normX = x / rect.width;
    const normY = y / rect.height;

    // Новая точка для отрисовки (в пикселях канваса)
    // Мы будем хранить нормализованные координаты в состоянии drawPoints,
    // чтобы они не зависели от ресайза
    const newPoint = { x: normX, y: normY };

    const newPoints = [...drawPoints, newPoint];
    setDrawPoints(newPoints);

    if (newPoints.length === 4) {
        // Преобразуем в формат массива для API: [[x,y], [x,y]...]
        const apiPoints = newPoints.map(p => [p.x, p.y]);

        try {
            if (currentVideoId) {
                await api.setZone(currentVideoId, apiPoints);
                setActiveZone(newPoints); // Обновляем активную зону сразу
                alert("Опасная зона установлена!");
            }
            setDrawMode(false);
            setDrawPoints([]);
        } catch (err) {
            console.error(err);
            alert("Ошибка сохранения зоны");
        }
    }
  };

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (drawMode || !canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Масштаб видео к канвасу
    const video = videoRef.current;
    const scaleX = canvas.width / (video.videoWidth || 1);
    const scaleY = canvas.height / (video.videoHeight || 1);

    let found: number | null = null;
    Object.entries(lastBoxes).forEach(([trackId, ev]) => {
      if (!ev.bbox) return;
      const [x1, y1, x2, y2] = ev.bbox;
      const rx = x1 * scaleX;
      const ry = y1 * scaleY;
      const rw = (x2 - x1) * scaleX;
      const rh = (y2 - y1) * scaleY;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) found = Number(trackId);
    });
    setHoverTrack(found);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Синхронизация размера канваса с видео
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth || 800;
      canvas.height = video.clientHeight || 450;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    const scaleX = width / (video.videoWidth || 1);
    const scaleY = height / (video.videoHeight || 1);
    const currentTime = video.currentTime;

    // 1. РИСУЕМ ЗОНЫ (DANGER ZONES)
    if (showZones) {
        // Если рисуем новую зону
        if (drawMode && drawPoints.length > 0) {
            ctx.beginPath();
            // Конвертируем нормализованные координаты в пиксели
            ctx.moveTo(drawPoints[0].x * width, drawPoints[0].y * height);
            for(let i=1; i<drawPoints.length; i++) {
                ctx.lineTo(drawPoints[i].x * width, drawPoints[i].y * height);
            }
            ctx.strokeStyle = COLORS.primary;
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]); // Пунктир
            ctx.stroke();
            ctx.setLineDash([]);

            // Рисуем точки вершин
            drawPoints.forEach(p => {
                ctx.fillStyle = '#fff';
                ctx.fillRect((p.x * width) - 4, (p.y * height) - 4, 8, 8);
            });
        }
        // Если есть активная зона (сохраненная)
        else if (activeZone.length > 0) {
            ctx.beginPath();
            const p0 = activeZone[0];
            ctx.moveTo(p0.x * width, p0.y * height);
            for(let i=1; i<activeZone.length; i++) {
                ctx.lineTo(activeZone[i].x * width, activeZone[i].y * height);
            }
            ctx.closePath();

            // Полупрозрачная заливка
            ctx.fillStyle = 'rgba(255, 61, 0, 0.2)';
            ctx.fill();

            // Обводка
            ctx.strokeStyle = COLORS.danger;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label
            const labelX = activeZone[0].x * width;
            const labelY = activeZone[0].y * height;
            ctx.fillStyle = COLORS.danger;
            ctx.fillRect(labelX, labelY - 20, 100, 20);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px "JetBrains Mono", monospace';
            ctx.fillText("RESTRICTED", labelX + 5, labelY - 5);
        }
    }

    // 2. HEATMAP
    if (heatmapMode) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = COLORS.danger;
      events.forEach((e) => {
        if (!e.bbox) return;
        const [x1, y1, x2, y2] = e.bbox;
        const cx = ((x1 + x2) / 2) * scaleX;
        const cy = ((y1 + y2) / 2) * scaleY;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, 2 * Math.PI);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      return; // В режиме heatmap HUD не рисуем
    }

    // 3. PROFESSIONAL HUD (TACTICAL BRACKETS)
    if (hudMode) {
      const activeEvents = events.filter(
        (e) => e.video_timestamp !== undefined && Math.abs(e.video_timestamp - currentTime) < 0.4
      );
      activeEvents.forEach((e) => {
        if (!e.bbox) return;
        const [x1, y1, x2, y2] = e.bbox;
        const rx = x1 * scaleX;
        const ry = y1 * scaleY;
        const rw = (x2 - x1) * scaleX;
        const rh = (y2 - y1) * scaleY;

        // Определение статуса
        const isDanger = e.type.includes('fall') || e.type.includes('zone');
        const isWarning = e.type.includes('helmet') || e.type.includes('glove') || e.type.includes('mask');

        const baseColor = isDanger ? COLORS.danger : (isWarning ? COLORS.primary : COLORS.safe);
        const labelBg = isDanger ? COLORS.danger : (isWarning ? COLORS.primary : 'rgba(255,255,255,0.9)');
        const labelText = isDanger ? '#FFF' : '#000';

        ctx.lineWidth = 2;
        ctx.strokeStyle = baseColor;

        // Рисуем "уголки" (Brackets)
        const cl = Math.min(rw, rh) * 0.25; // Длина уголка

        ctx.beginPath();
        // TL
        ctx.moveTo(rx, ry + cl); ctx.lineTo(rx, ry); ctx.lineTo(rx + cl, ry);
        // TR
        ctx.moveTo(rx + rw - cl, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cl);
        // BR
        ctx.moveTo(rx + rw, ry + rh - cl); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw - cl, ry + rh);
        // BL
        ctx.moveTo(rx + cl, ry + rh); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx, ry + rh - cl);
        ctx.stroke();

        // Лейбл сверху (ID + Action)
        const fontSize = 11;
        ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
        let act = (e.action || 'TRACKING').toUpperCase();
        const label = `ID:${e.track_id} | ${act}`;

        const tw = ctx.measureText(label).width;
        const th = 18;

        ctx.fillStyle = labelBg;
        ctx.fillRect(rx, ry - th - 2, tw + 8, th);
        ctx.fillStyle = labelText;
        ctx.fillText(label, rx + 4, ry - 8);

        // Лейбл снизу (Если есть нарушение)
        if (isDanger || isWarning) {
             const typeStr = e.type.toUpperCase().replace('_', ' ');
             const tw2 = ctx.measureText(typeStr).width;

             ctx.fillStyle = labelBg;
             ctx.fillRect(rx, ry + rh + 4, tw2 + 8, th);
             ctx.fillStyle = labelText;
             ctx.fillText(typeStr, rx + 4, ry + rh + 16);
        }
      });
    }

    // 4. HOVER DETAIL BOX
    if (hoverTrack != null && !drawMode) {
      const ev = lastBoxes[hoverTrack];
      if (ev && ev.bbox) {
        const [x1, y1, x2, y2] = ev.bbox;
        const rx = x1 * scaleX;
        const ry = y1 * scaleY;
        const rw = (x2 - x1) * scaleX;
        const rh = (y2 - y1) * scaleY;

        // Подсветка целиком
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);

        // Информационная панель справа
        const panelX = rx + rw + 10;
        const panelY = ry;

        ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 1;
        ctx.fillRect(panelX, panelY, 180, 90);
        ctx.strokeRect(panelX, panelY, 180, 90);

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.fillText(`PERSONNEL DATA`, panelX + 10, panelY + 20);

        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#AAA';
        ctx.fillText(`ID:`, panelX + 10, panelY + 40);
        ctx.fillStyle = COLORS.primary;
        ctx.fillText(`#${ev.track_id}`, panelX + 40, panelY + 40);

        ctx.fillStyle = '#AAA';
        ctx.fillText(`STATUS:`, panelX + 10, panelY + 55);
        ctx.fillStyle = '#FFF';
        ctx.fillText(`${ev.action || 'N/A'}`, panelX + 60, panelY + 55);

        ctx.fillStyle = '#AAA';
        ctx.fillText(`ZONE:`, panelX + 10, panelY + 70);
        const zColor = ev.zone?.includes('Danger') ? COLORS.danger : '#00e676';
        ctx.fillStyle = zColor;
        ctx.fillText(`${ev.zone || 'SAFE'}`, panelX + 60, panelY + 70);
      }
    }
  };

  return (
    <Paper
      ref={containerRef}
      elevation={0}
      sx={{
        position: 'relative',
        height: 500,
        bgcolor: '#000',
        border: '1px solid #333',
        borderRadius: 2,
        overflow: 'hidden',
        // Когда включен drawMode, курсор прицел, иначе дефолтный
        cursor: drawMode ? 'crosshair' : 'default',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
      }}
      // Убрали onClick отсюда, перенесли на canvas
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverTrack(null)}
    >
      <input type="file" accept="video/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

      {!activeUrl ? (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          <CloudUploadIcon sx={{ fontSize: 64, mb: 2, color: '#333' }} />
          <Typography variant="h6" sx={{ mb: 2, fontFamily: 'Orbitron', color: '#888' }}>NO SIGNAL INPUT</Typography>
          <Button
            variant="outlined"
            onClick={handleUploadClick}
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
            sx={{
                borderColor: COLORS.primary,
                color: COLORS.primary,
                '&:hover': { borderColor: '#FFF', color: '#FFF' }
            }}
          >
            {uploading ? 'UPLOADING...' : 'UPLOAD VIDEO FEED'}
          </Button>
        </Box>
      ) : (
          <>
          <video
            ref={videoRef}
            src={activeUrl || undefined}
            controls
            muted
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onTimeUpdate={handleTimeUpdate}
          />
            саnvas
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick} // Клик ловим здесь!
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: drawMode ? 'auto' : 'none', // ВАЖНО!
              zIndex: 10
            }}
          />

          {/* TOOLBAR */}
          <Box sx={{
              position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1,
              bgcolor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
              p: 0.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 20
          }}>
              {/* Кнопка Очистить (если в режиме рисования) */}
              {drawMode && (
                  <Tooltip title="Cancel Drawing">
                    <IconButton size="small" onClick={() => { setDrawMode(false); setDrawPoints([]); }} sx={{ color: '#FFF' }}>
                        <ClearIcon fontSize="small"/>
                    </IconButton>
                  </Tooltip>
              )}

              <Tooltip title="Reprocess Video">
              <IconButton
                size="small"
                onClick={async () => {
                  if (!currentVideoId) return;
                  if (confirm("Reprocess video analysis?")) {
                    try {
                      // @ts-ignore
                      await api.reprocessVideo(currentVideoId);
                      setEvents([]);
                    } catch (e) { console.error(e); }
                  }
                }}
                sx={{ color: '#FFF', '&:hover': { color: COLORS.primary } }}
              >
                <AutorenewIcon fontSize="small" />
              </IconButton>
            </Tooltip>

             <Tooltip title={drawMode ? "Click 4 points to set zone" : "Draw Danger Zone"}>
              <IconButton
                size="small"
                onClick={() => { setDrawMode(!drawMode); setDrawPoints([]); }}
                sx={{
                  bgcolor: drawMode ? COLORS.primary : 'transparent',
                  color: drawMode ? '#000' : '#FFF',
                  '&:hover': { color: COLORS.primary }
                }}
              >
                {drawMode ? <CheckIcon fontSize="small"/> : <CreateIcon fontSize="small"/>}
              </IconButton>
            </Tooltip>

            <Tooltip title="Toggle Zones">
              <IconButton size="small" onClick={() => setShowZones(!showZones)} sx={{ color: showZones ? COLORS.danger : '#555' }}>
                <WarningIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Toggle HUD">
              <IconButton size="small" onClick={() => { setHudMode(true); setHeatmapMode(false); }} sx={{ color: hudMode ? COLORS.primary : '#555' }}>
                <VideocamIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Toggle Heatmap">
              <IconButton size="small" onClick={() => { setHeatmapMode(true); setHudMode(false); }} sx={{ color: heatmapMode ? COLORS.danger : '#555' }}>
                <ViewInArIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {drawMode && (
             <Typography sx={{
                 position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
                 bgcolor: COLORS.primary, color: '#000', px: 3, py: 0.5,
                 borderRadius: 1, fontWeight: 700, fontSize: '0.8rem', letterSpacing: 1,
                 pointerEvents: 'none', boxShadow: `0 0 15px ${COLORS.primary}60`,
                 zIndex: 20
             }}>
                DEFINE RESTRICTED AREA ({drawPoints.length}/4)
             </Typography>
          )}
        </>
      )}
    </Paper>
  );
};
