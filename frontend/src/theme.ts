import { createTheme } from '@mui/material/styles';

// SIBINTEK-SOFT Palette
const PRIMARY_YELLOW = '#FFD700'; // Яркий корпоративный желтый
const SECONDARY_WHITE = '#FFFFFF';
const BACKGROUND_DARK = '#0A0A0A'; // Глубокий черный
const PAPER_DARK = 'rgba(20, 20, 20, 0.7)'; // Полупрозрачный черный для карточек
const ACCENT_RED = '#FF3D00'; // Для критических алертов
const TEXT_PRIMARY = '#EEEEEE';
const TEXT_SECONDARY = '#B0B0B0';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: PRIMARY_YELLOW,
      contrastText: '#000000',
    },
    secondary: {
      main: SECONDARY_WHITE,
    },
    error: {
      main: ACCENT_RED,
    },
    background: {
      default: BACKGROUND_DARK,
      paper: PAPER_DARK,
    },
    text: {
      primary: TEXT_PRIMARY,
      secondary: TEXT_SECONDARY,
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 500 },
    h6: { fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' },
    button: { fontWeight: 600, textTransform: 'none' },
    caption: { fontFamily: '"JetBrains Mono", monospace' }, // Технологичный шрифт для цифр/кода
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: PAPER_DARK,
          backdropFilter: 'blur(12px)', // Эффект матового стекла
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 4, // Строгие углы, но чуть сглаженные
          transition: 'box-shadow 0.3s ease-in-out, border-color 0.3s',
          '&:hover': {
            borderColor: 'rgba(255, 215, 0, 0.3)', // Подсветка желтым при наведении
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          padding: '8px 24px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 0 12px rgba(255, 215, 0, 0.4)', // Свечение кнопки
          },
        },
        containedPrimary: {
          background: `linear-gradient(45deg, ${PRIMARY_YELLOW} 30%, #FFEA00 90%)`,
          color: '#000',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontWeight: 600,
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#333 #0A0A0A',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#0A0A0A',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#333',
            borderRadius: '4px',
          },
        },
      },
    },
  },
});
