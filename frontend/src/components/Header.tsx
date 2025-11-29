import React from 'react';
import { AppBar, Toolbar, Typography, Box, Button, useTheme, keyframes } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import BoltIcon from '@mui/icons-material/Bolt';
import { useNavigate } from 'react-router-dom';

// Анимация пульсации для индикатора
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(0, 230, 118, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(0, 230, 118, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 230, 118, 0); }
`;

export const Header: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  // Имитация данных мониторинга
  const metrics = [
    { label: 'CPU', value: '12%' },
    { label: 'MEM', value: '4.2GB' },
    { label: 'PING', value: '24ms' },
  ];

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: '#050505',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)'
      }}
    >
      <Toolbar sx={{ height: 70, display: 'flex', justifyContent: 'space-between' }}>

        {/* ЛОГОТИП */}
        <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
            onClick={() => navigate('/')}
        >
          <Box sx={{
            width: 40, height: 40, bgcolor: theme.palette.primary.main,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 1, boxShadow: `0 0 20px ${theme.palette.primary.main}40`
          }}>
            <BoltIcon sx={{ color: '#000', fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1, letterSpacing: 1.5, fontWeight: 800, color: '#FFF' }}>
              ARGUS<span style={{ color: theme.palette.primary.main }}>.AI</span>
            </Typography>
            <Typography variant="caption" sx={{ color: '#666', fontSize: 10, letterSpacing: 2, display: 'block', fontWeight: 600 }}>
              SIBINTEK-SOFT SAFETY SYSTEM
            </Typography>
          </Box>
        </Box>

        {/* ПРАВАЯ ЧАСТЬ: МОНИТОРИНГ + ADMIN */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>

            {/* ПАНЕЛЬ МОНИТОРИНГА */}
            <Box sx={{
                display: { xs: 'none', md: 'flex' },
                alignItems: 'center',
                bgcolor: 'rgba(20, 20, 20, 0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                px: 2, py: 0.8, borderRadius: 2, gap: 3
            }}>
                {metrics.map((m) => (
                    <Box key={m.label} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                        <Typography variant="caption" sx={{ color: '#666', fontWeight: 700, fontSize: 11 }}>
                            {m.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#EEE', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                            {m.value}
                        </Typography>
                    </Box>
                ))}

                {/* Divider */}
                <Box sx={{ width: 1, height: 16, bgcolor: 'rgba(255,255,255,0.1)' }} />

                {/* STATUS INDICATOR */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{
                        width: 8, height: 8, borderRadius: '50%',
                        bgcolor: '#00e676',
                        animation: `${pulse} 2s infinite`
                    }} />
                    <Typography variant="caption" sx={{ color: '#00e676', fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>
                        SYSTEM ACTIVE
                    </Typography>
                </Box>
            </Box>

            {/* КНОПКА ADMIN (БЕЗ КОЛОКОЛЬЧИКА) */}
            <Button
                variant="contained"
                size="small"
                startIcon={<SettingsIcon />}
                onClick={() => navigate('/settings')}
                sx={{
                    bgcolor: theme.palette.primary.main,
                    color: '#000',
                    fontWeight: 800,
                    borderRadius: 1,
                    ml: 1,
                    minWidth: 100,
                    '&:hover': { bgcolor: '#FFEA00', boxShadow: `0 0 15px ${theme.palette.primary.main}60` }
                }}
            >
                ADMIN
            </Button>
        </Box>

      </Toolbar>
    </AppBar>
  );
};
