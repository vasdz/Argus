import React, { useState } from 'react';
import {
  Container, Typography, Box, Switch,
  Button, Paper, Slider, Grid
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import TuneIcon from '@mui/icons-material/Tune';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import SaveIcon from '@mui/icons-material/Save';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Header } from '../components/Header';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [confidence, setConfidence] = useState<number>(10);
  const [loading, setLoading] = useState(false);

  const [toggles, setToggles] = useState({
    helmets: true,
    vests: true,
    masks: true,
    gloves: true
  });

  const handleResetDb = async () => {
    if (window.confirm('CRITICAL ACTION: This will wipe all system data. Continue?')) {
      await api.resetDb();
      alert('System reset complete.');
      navigate('/');
    }
  };

  const handleSave = () => {
      setLoading(true);
      setTimeout(() => {
          setLoading(false);
          alert('System configuration updated.');
      }, 800);
  };

  // --- STYLES ---
  const glassPanel = {
    p: 4,
    bgcolor: 'rgba(20, 20, 20, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
  };

  const sectionTitle = {
      color: '#FFD700',
      fontFamily: 'Orbitron',
      letterSpacing: 1,
      fontWeight: 700,
      mb: 3,
      display: 'flex',
      alignItems: 'center',
      gap: 2
  };

  return (
    <Box sx={{ bgcolor: '#050505', minHeight: '100vh', pb: 4 }}>
      <Header />

      <Container maxWidth="md" sx={{ mt: 6 }}>

        <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            sx={{ color: '#666', mb: 3, '&:hover': { color: '#FFF' } }}
        >
            BACK TO DASHBOARD
        </Button>

        <Paper sx={glassPanel}>

            {/* HEADER */}
            <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2, mb: 4 }}>
                <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 800, letterSpacing: 1 }}>
                    SYSTEM CONFIGURATION
                </Typography>
                <Typography variant="caption" sx={{ color: '#666', letterSpacing: 2 }}>
                    SIBINTEK-SOFT CONTROL PANEL
                </Typography>
            </Box>

            <Grid container spacing={6}>

                {/* LEFT COLUMN: AI SETTINGS */}
                <Grid item xs={12} md={7}>
                    <Box>
                        <Typography variant="h6" sx={sectionTitle}>
                            <SettingsSuggestIcon /> AI DETECTION MODULES
                        </Typography>

                        <Box display="flex" flexDirection="column" gap={2}>
                            {Object.entries(toggles).map(([key, val]) => (
                                <Paper key={key} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body1" sx={{ color: '#EEE', fontWeight: 600, textTransform: 'uppercase' }}>
                                            {key} DETECTION
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#666' }}>
                                            Neural network layer #2
                                        </Typography>
                                    </Box>
                                    <Switch
                                        checked={val}
                                        onChange={(e) => setToggles({...toggles, [key]: e.target.checked})}
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#FFD700' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#FFD700' },
                                        }}
                                    />
                                </Paper>
                            ))}
                        </Box>
                    </Box>

                    <Box sx={{ mt: 5 }}>
                        <Typography variant="h6" sx={sectionTitle}>
                            <TuneIcon /> SENSITIVITY THRESHOLD
                        </Typography>
                        <Box sx={{ px: 2 }}>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography color="#AAA">Confidence Level</Typography>
                                <Typography color="#FFD700" fontWeight="bold">{confidence}%</Typography>
                            </Box>
                            <Slider
                                value={confidence}
                                onChange={(_, v) => setConfidence(v as number)}
                                min={0} max={100}
                                sx={{ color: '#FFD700' }}
                            />
                            <Typography variant="caption" color="#555">
                                Higher values reduce false positives but may miss edge cases.
                            </Typography>
                        </Box>
                    </Box>
                </Grid>

                {/* RIGHT COLUMN: DANGER ZONE */}
                <Grid item xs={12} md={5}>
                    <Box sx={{
                        height: '100%',
                        bgcolor: 'rgba(255, 61, 0, 0.05)',
                        border: '1px dashed rgba(255, 61, 0, 0.3)',
                        borderRadius: 2,
                        p: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                        <Box>
                            <Typography variant="h6" sx={{ color: '#FF3D00', fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <DeleteForeverIcon /> DANGER ZONE
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#AAA', mb: 3 }}>
                                Resetting the database will permanently delete all video records, event logs, and generated reports. This action cannot be undone.
                            </Typography>
                        </Box>

                        <Button
                            variant="outlined"
                            color="error"
                            fullWidth
                            onClick={handleResetDb}
                            sx={{
                                border: '1px solid #FF3D00',
                                color: '#FF3D00',
                                py: 1.5,
                                fontWeight: 800,
                                '&:hover': { bgcolor: '#FF3D00', color: '#000' }
                            }}
                        >
                            WIPE SYSTEM DATA
                        </Button>
                    </Box>
                </Grid>
            </Grid>

            {/* FOOTER ACTIONS */}
            <Box sx={{ mt: 6, pt: 3, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={loading}
                    sx={{
                        bgcolor: '#FFD700',
                        color: '#000',
                        fontWeight: 800,
                        px: 4,
                        '&:hover': { bgcolor: '#FFEA00', boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)' }
                    }}
                >
                    {loading ? 'APPLYING...' : 'SAVE CONFIGURATION'}
                </Button>
            </Box>

        </Paper>
      </Container>
    </Box>
  );
};
