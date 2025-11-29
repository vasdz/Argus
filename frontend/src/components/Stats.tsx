import React, { useEffect, useState, useMemo } from 'react';
import { Paper, Typography, Box, Grid } from '@mui/material';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { api } from '../services/api';
import { SystemStats, SafetyEvent } from '../types';
import SpeedIcon from '@mui/icons-material/Speed';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TimelineIcon from '@mui/icons-material/Timeline';
import WarningIcon from '@mui/icons-material/Warning';
import PanToolIcon from '@mui/icons-material/PanTool';
import SecurityIcon from '@mui/icons-material/Security';
import HealingIcon from '@mui/icons-material/Healing';

// --- ТИПЫ НАРУШЕНИЙ (ЖЕЛТАЯ ГАММА + АКЦЕНТЫ) ---
const INCIDENT_TYPES = [
  { id: 'no_helmet', label: 'NO HELMET', desc: 'Отсутствие каски', color: '#FFD700', icon: <SecurityIcon /> }, // Желтый
  { id: 'no_glove', label: 'NO GLOVE', desc: 'Отсутствие перчаток', color: '#FFA000', icon: <PanToolIcon /> }, // Темно-желтый
  { id: 'zone_intrusion', label: 'DANGER ZONE', desc: 'Опасная зона', color: '#FF3D00', icon: <WarningIcon /> }, // Красный (критично)
  { id: 'no_mask', label: 'NO MASK', desc: 'Отсутствие маски', color: '#FFFFFF', icon: <HealingIcon /> } // Белый
];

// Расширяем тип
interface ExtendedSafetyEvent extends SafetyEvent {
  real_time?: string;
  event_type?: string;
}

interface StatsProps {
  videoId?: number | null;
  videoEvents: SafetyEvent[];
}

export const Stats: React.FC<StatsProps> = ({ videoId, videoEvents }) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) { setStats(null); setError('NO_VIDEO'); return; }
    const fetchStats = async () => {
      try {
        setError(null);
        const data = await api.getStats(videoId);
        setStats(data);
      } catch (e) {
        console.error(e);
        setError('API_ERROR');
        setStats(null);
      }
    };
    fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => clearInterval(id);
  }, [videoId]);

  // --- Подготовка данных ---
  const { chartData, timeRangeLabel, typeStats } = useMemo(() => {
    const safeEvents = (videoEvents || []) as ExtendedSafetyEvent[];
    const statsMap: Record<string, number> = {};

    safeEvents.forEach(e => {
        const k = (e.event_type || e.type || 'unknown').toLowerCase();
        statsMap[k] = (statsMap[k] || 0) + 1;
    });

    if (safeEvents.length === 0) return { chartData: [], timeRangeLabel: 'DATA SYNC...', typeStats: statsMap };

    const sorted = [...safeEvents].sort((a, b) => (a.video_timestamp || 0) - (b.video_timestamp || 0));
    const groups: Record<string, number> = {};
    let hasRealTime = false;

    sorted.forEach(e => {
      let label = "";
      if (e.real_time && e.real_time.length > 5) {
         try {
             let t = e.real_time;
             const c = t.indexOf(':');
             if (c > 2) { t = t.substring(c - 2, c + 3); hasRealTime = true; label = t; }
         } catch {}
      }
      if (!label) {
         const sec = Math.floor(e.video_timestamp || 0);
         const m = Math.floor(sec / 60);
         const s = sec % 60;
         label = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      groups[label] = (groups[label] || 0) + 1;
    });

    const data = Object.keys(groups).map(t => ({ time: t, count: groups[t] })).sort((a, b) => a.time.localeCompare(b.time));
    const range = data.length > 0 ? `${data[0].time} — ${data[data.length - 1].time}` : '--:--';

    return {
        chartData: data,
        timeRangeLabel: hasRealTime ? `LIVE: ${range}` : `TIMECODE: ${range}`,
        typeStats: statsMap
    };
  }, [videoEvents]);

  if (error === 'API_ERROR') return (
      <Paper sx={{ p: 3, border: '1px solid #ff1744', bgcolor: 'rgba(255, 23, 68, 0.1)' }}>
          <Typography color="#ff1744" align="center" fontWeight="bold">SYSTEM CONNECTION ERROR</Typography>
      </Paper>
  );

  if (!videoId) return <Paper sx={{ p: 3, borderStyle: 'dashed' }}><Typography color="textSecondary" align="center">SELECT DATA SOURCE</Typography></Paper>;
  if (!stats) return <Paper sx={{ p: 3, borderStyle: 'dashed' }}><Typography color="textSecondary" align="center">INITIALIZING ANALYTICS...</Typography></Paper>;

  // --- Стилизация "Жидкое стекло" ---
  const glassCard = {
    p: 3, height: '100%', display: 'flex', flexDirection: 'column' as const,
    bgcolor: 'rgba(20, 20, 20, 0.6)', // Темная база
    backdropFilter: 'blur(12px)', // Блюр
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    position: 'relative' as const, overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    transition: 'all 0.3s ease',
    '&:hover': {
        borderColor: 'rgba(255, 215, 0, 0.2)', // Желтая обводка при ховере
        boxShadow: '0 8px 32px rgba(255, 215, 0, 0.05)', // Легкое золотое свечение
    }
  };

  const scoreColor = stats.safety_score > 80 ? '#FFD700' : '#FF3D00'; // Золото или Красный
  const chartPrimary = '#FFD700'; // Золотой график

  return (
    <Box sx={{ mt: 2, mb: 4 }}>
      <Grid container spacing={3} sx={{ mb: 3 }}>

        {/* SAFETY SCORE */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={glassCard}>
            <Typography variant="overline" sx={{ color: '#888', letterSpacing: 2, fontWeight: 700 }}>SAFETY INDEX</Typography>
            <Box flex={1} display="flex" alignItems="center" justifyContent="center" flexDirection="column">
              <Typography variant="h2" sx={{ fontWeight: 800, color: scoreColor, textShadow: `0 0 20px ${scoreColor}30` }}>
                {Math.round(stats.safety_score)}%
              </Typography>
              <Typography variant="caption" sx={{ color: '#666', bgcolor: 'rgba(255,255,255,0.05)', px: 1, py: 0.5, borderRadius: 1, mt: 1 }}>
                 STATUS: {stats.safety_score > 80 ? 'OPTIMAL' : 'CRITICAL'}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* TRIR */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={glassCard}>
             <Box display="flex" justifyContent="space-between">
                 <Typography variant="overline" sx={{ color: '#888', letterSpacing: 2, fontWeight: 700 }}>TRIR RATE</Typography>
                 <SpeedIcon sx={{ color: '#FFF', opacity: 0.5 }} />
             </Box>
             <Box flex={1} display="flex" alignItems="center">
                 <Typography variant="h3" fontWeight="700" color="#FFF">{stats.trir}</Typography>
             </Box>
             <Typography variant="caption" sx={{ color: '#888' }}>Incidents / 200k hrs</Typography>
          </Paper>
        </Grid>

        {/* TOTAL VIOLATIONS */}
         <Grid item xs={12} sm={6} md={2}>
          <Paper sx={glassCard}>
             <Box display="flex" justifyContent="space-between">
                 <Typography variant="overline" sx={{ color: '#888', letterSpacing: 1, fontWeight: 700 }}>EVENTS</Typography>
                 <TrendingUpIcon sx={{ color: chartPrimary, opacity: 0.8 }} />
             </Box>
             <Box flex={1} display="flex" alignItems="center">
                 <Typography variant="h3" fontWeight="700" color="#FFF">{stats.total_incidents}</Typography>
             </Box>
             <Typography variant="caption" sx={{ color: chartPrimary, opacity: 0.8 }}>Detected</Typography>
          </Paper>
        </Grid>

        {/* MINI SPARKLINE */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ ...glassCard, p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1} pl={1}>
                <TimelineIcon sx={{ color: chartPrimary, fontSize: 18 }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#EEE' }}>ACTIVITY TREND</Typography>
            </Box>
            <Box sx={{ width: '100%', height: 90 }}>
              <ResponsiveContainer>
                <AreaChart data={stats.incidents_trend || []}>
                  <defs><linearGradient id="miniGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chartPrimary} stopOpacity={0.3} /><stop offset="95%" stopColor={chartPrimary} stopOpacity={0} /></linearGradient></defs>
                  <Tooltip contentStyle={{ backgroundColor: '#111', border: `1px solid ${chartPrimary}`, fontSize: '12px' }} itemStyle={{ color: chartPrimary }} labelStyle={{ display: 'none' }} />
                  <Area type="monotone" dataKey="count" stroke={chartPrimary} strokeWidth={2} fill="url(#miniGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* MAIN GRAPHIC (CHRONOLOGY) */}
      <Paper sx={{ ...glassCard, mb: 3, p: 0 }}>
        <Box sx={{ p: 3, pb: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box display="flex" alignItems="center" gap={2}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 700 }}>INCIDENT CHRONOLOGY</Typography>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: chartPrimary, boxShadow: `0 0 10px ${chartPrimary}` }} />
          </Box>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#888', border: '1px solid #333', px: 1, borderRadius: 1 }}>
            {timeRangeLabel}
          </Typography>
        </Box>

        <Box sx={{ height: 250, width: '100%', mt: 2 }}>
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                  <linearGradient id="mainGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartPrimary} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={chartPrimary} stopOpacity={0}/>
                  </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="time" stroke="#444" fontSize={11} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#444" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} dx={-10} />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(10,10,10,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '8px 12px' }}
                itemStyle={{ color: chartPrimary, fontWeight: 600 }}
                labelStyle={{ color: '#888', marginBottom: 4, fontSize: 12 }}
                cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="count" stroke={chartPrimary} strokeWidth={3} fillOpacity={1} fill="url(#mainGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </Box>

        {/* LEGEND (FOOTER) */}
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', p: 3, bgcolor: 'rgba(0,0,0,0.2)' }}>
            <Grid container spacing={2}>
                {INCIDENT_TYPES.map((type) => {
                const count = typeStats[type.id] || 0;
                const active = count > 0;
                return (
                    <Grid item xs={6} md={3} key={type.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, opacity: active ? 1 : 0.4 }}>
                            <Box sx={{
                                width: 40, height: 40, borderRadius: 2,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                bgcolor: active ? `${type.color}20` : 'rgba(255,255,255,0.05)',
                                color: active ? type.color : '#666'
                            }}>
                                {React.cloneElement(type.icon as React.ReactElement, { fontSize: 'small' })}
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: active ? '#FFF' : '#666' }}>
                                    {type.label}
                                </Typography>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <Typography variant="h6" sx={{ lineHeight: 1, color: active ? '#FFF' : '#444' }}>
                                        {count}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontSize: 10, color: '#555', lineHeight: 1 }}>
                                        events
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Grid>
                );
                })}
            </Grid>
        </Box>
      </Paper>
    </Box>
  );
};
