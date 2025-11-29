import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Container, Grid, Paper, Typography, Select, MenuItem, FormControl,
  List, ListItem, ListItemText, Chip, ListItemButton, IconButton, useTheme
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningIcon from '@mui/icons-material/Warning'; // Импорт иконки Warning
import { Header } from '../components/Header';
import { VideoGrid } from '../components/VideoGrid';
import { Stats } from '../components/Stats';
import { ReportGenerator } from '../components/ReportGenerator';
import { SafetyEvent, VideoFile, RiskProfile } from '../types';
import { api } from '../services/api';
import TrainTimeline from "../components/TrainTimeline";

export const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  const [riskData, setRiskData] = useState<RiskProfile[]>([]);
  const [videoList, setVideoList] = useState<VideoFile[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<number | null>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => { loadVideoList(); }, []);

  const formatVideoTime = (seconds?: number) => {
    if (seconds === undefined || isNaN(seconds)) return '--:--';
    const sec = Math.floor(seconds);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const loadVideoList = async () => {
    try {
      const videos = await api.getVideos();
      setVideoList(videos);
      if (currentVideoId && !videos.find((v) => v.id === currentVideoId)) {
        setCurrentVideoId(null);
        setCurrentVideoUrl(null);
      }
      if (videos.length > 0 && !currentVideoId) {
        handleVideoSelect(videos[0].id, (videos[0] as any).url);
      }
    } catch (e) { console.error('Failed to load videos', e); }
  };

  const handleVideoSelect = (id: number, url?: string) => {
    setCurrentVideoId(id);
    if (!url) {
      const vid = videoList.find((v) => v.id === id);
      if (vid) setCurrentVideoUrl((vid as any).url);
    } else { setCurrentVideoUrl(url); }
  };

  const handleDeleteVideo = async () => {
    if (!currentVideoId) return;
    if (window.confirm('Вы уверены, что хотите удалить этот отчет и видео?')) {
      try {
        await api.deleteVideo(currentVideoId);
        setCurrentVideoId(null);
        setCurrentVideoUrl(null);
        setEvents([]);
        setRiskData([]);
        await loadVideoList();
      } catch (e) { alert('Ошибка удаления'); }
    }
  };

  useEffect(() => {
    if (!currentVideoId) return;
    const fetchData = async () => {
      try {
        const eventData = await api.getVideoEvents(currentVideoId);
        setEvents(eventData);
        const risks = await api.getRiskRanking(currentVideoId);
        setRiskData(risks);
      } catch (e) { console.error(e); }
    };
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [currentVideoId]);

  const handleUploadSuccess = (newVideoId: number) => {
    loadVideoList().then(() => {
      api.getVideos().then((vids) => {
        const newVid: any = vids.find((v: any) => v.id === newVideoId);
        if (newVid) handleVideoSelect(newVid.id, newVid.url);
      });
    });
  };

  const handleEventClick = (event: SafetyEvent) => {
    if (event.video_timestamp !== undefined && playerRef.current) {
      playerRef.current.seekTo(event.video_timestamp);
    }
  };

  const panelStyle = {
    p: 2,
    bgcolor: 'rgba(20, 20, 20, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
  };

  return (
    <Box sx={{ bgcolor: '#050505', minHeight: '100vh', pb: 4 }}>
      <Header />
      <Container maxWidth="xl" sx={{ mt: 4 }}>

        {/* TOOLBAR */}
        <Paper sx={{ ...panelStyle, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="button" sx={{ color: theme.palette.primary.main, fontWeight: 800, mr: 2, letterSpacing: 1 }}>
            PROJECT STREAM:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 300 }}>
            <Select
              value={currentVideoId || ''}
              onChange={(e) => handleVideoSelect(Number(e.target.value))}
              sx={{
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                '& .MuiSvgIcon-root': { color: theme.palette.primary.main },
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                bgcolor: 'rgba(0,0,0,0.3)'
              }}
            >
              {videoList.map((v: any) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.processed ? '✅' : '⏳'} {v.filename} (ID: {v.id})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton onClick={handleDeleteVideo} disabled={!currentVideoId} sx={{ color: theme.palette.error.main, border: '1px solid rgba(255, 61, 0, 0.3)' }}>
            <DeleteIcon />
          </IconButton>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
            <ReportGenerator
    videoId={currentVideoId}
    events={events}
    risks={riskData}
/>
          </Box>
        </Paper>

        <Grid container spacing={3}>
          {/* LEFT: VIDEO + CHAT */}
          <Grid item xs={12} lg={8}>
            <VideoGrid
              key={currentVideoId || 'empty'}
              currentVideoId={currentVideoId}
              playbackUrl={currentVideoUrl}
              onPlayerReady={(p) => (playerRef.current = p)}
              onUploadComplete={handleUploadSuccess}
            />
            <Box sx={{ mt: 3 }}>
            </Box>
          </Grid>

          {/* RIGHT: RISKS + LOG */}
          <Grid item xs={12} lg={4}>
            {/* Risk Ranking */}
            <Paper sx={{ ...panelStyle, mb: 3, border: '1px solid rgba(255, 61, 0, 0.3)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderBottom: '1px solid rgba(255, 61, 0, 0.2)', pb: 1 }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <WarningIcon sx={{ color: '#FF3D00' }} fontSize="small" />
                    <Typography variant="overline" sx={{ color: '#FF3D00', fontWeight: 800, letterSpacing: 1 }}>AT-RISK PERSONNEL</Typography>
                </Box>
                <Chip label={riskData.length} sx={{ bgcolor: '#FF3D00', color: '#FFF', fontWeight: 800, height: 20 }} size="small" />
              </Box>

              <List dense sx={{ py: 0 }}>
                {riskData.map((risk) => (
                  <ListItem key={risk.id} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', px: 0 }}>
                    <Box sx={{ width: '100%' }}>
                        <Box display="flex" justifyContent="space-between" mb={0.5}>
                            <Typography sx={{ color: '#FFF', fontWeight: 'bold', fontFamily: 'monospace' }}>ID #{risk.id}</Typography>
                            <Typography sx={{ color: risk.score > 50 ? '#FF3D00' : '#FFD700', fontWeight: 'bold' }}>SCORE: {risk.score}</Typography>
                        </Box>
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                            {Object.entries(risk.violations).map(([k, v]) => (
                                <Chip key={k} label={`${k.replace('no_', '').toUpperCase()} (${v})`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#AAA', height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
                            ))}
                        </Box>
                    </Box>
                  </ListItem>
                ))}
                {riskData.length === 0 && <Typography color="textSecondary" align="center" py={3} variant="caption" display="block">NO CRITICAL RISKS DETECTED</Typography>}
              </List>
            </Paper>

            {/* Live Event Log */}
            <Paper sx={{ ...panelStyle, height: '400px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, borderBottom: '1px solid rgba(255, 215, 0, 0.2)', pb: 1 }}>
                  <Typography variant="overline" sx={{ color: theme.palette.primary.main, fontWeight: 800, letterSpacing: 1 }}>LIVE EVENT LOG</Typography>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: theme.palette.primary.main, boxShadow: '0 0 8px #FFD700' }} />
              </Box>

              <List sx={{ overflowY: 'auto', flex: 1, px: 0, '&::-webkit-scrollbar': { width: '4px' } }}>
                {events.map((event) => (
                  <ListItem key={event.id} disablePadding>
                    <ListItemButton
                      onClick={() => handleEventClick(event)}
                      sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', py: 1, '&:hover': { bgcolor: 'rgba(255, 215, 0, 0.05)', borderLeft: '2px solid #FFD700' } }}
                    >
                      <ListItemText
                        primary={
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography sx={{ color: event.type.includes('helmet') || event.type.includes('fall') ? '#FF3D00' : '#FFF', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                              {event.type.replace('_', ' ')}
                            </Typography>
                            <Typography color="#666" variant="caption" sx={{ fontFamily: 'monospace' }}>{formatVideoTime(event.video_timestamp)}</Typography>
                          </Box>
                        }
                        secondary={
                          <Box display="flex" gap={1} mt={0.5}>
                              <Typography variant="caption" sx={{ color: '#888', fontSize: '0.7rem' }}>#{event.track_id}</Typography>
                              <Typography variant="caption" sx={{ color: '#555', fontSize: '0.7rem' }}>|</Typography>
                              <Typography variant="caption" sx={{ color: '#AAA', fontSize: '0.7rem' }}>{event.action?.toUpperCase() || 'UNK'}</Typography>
                              <Typography variant="caption" sx={{ color: '#555', fontSize: '0.7rem' }}>|</Typography>
                              <Typography variant="caption" sx={{ color: event.zone?.includes('Danger') ? '#FF3D00' : '#00E676', fontSize: '0.7rem', fontWeight: 'bold' }}>{event.zone?.toUpperCase() || 'SAFE'}</Typography>
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
                {events.length === 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 8, opacity: 0.3 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'Orbitron' }}>SYSTEM IDLE</Typography>
                      <Typography variant="caption" sx={{ fontSize: 10 }}>WAITING FOR DATA STREAM...</Typography>
                  </Box>
                )}
              </List>
            </Paper>
          </Grid>
        </Grid>

        {/* STATS & TIMELINE */}
        {currentVideoId && (
          <Box sx={{ mt: 3 }}>
            <Stats videoId={currentVideoId} videoEvents={events} />
          </Box>
        )}
        {currentVideoId && (
          <Box sx={{ mt: 3 }}>
            <TrainTimeline videoId={currentVideoId} />
          </Box>
        )}
      </Container>
    </Box>
  );
};
