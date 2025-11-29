import React, { useRef, useState } from 'react';
import { Button, Dialog, DialogContent, Typography, Box, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Paper, IconButton, Chip } from '@mui/material';
import SummarizeIcon from '@mui/icons-material/Summarize';
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { api } from '../services/api';
import { SafetyEvent, RiskProfile } from '../types';

interface ReportGeneratorProps {
  videoId: number | null;
  events: SafetyEvent[];
  risks: RiskProfile[];
}

export const ReportGenerator: React.FC<ReportGeneratorProps> = ({ videoId, events, risks }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    if (!videoId) return;
    setOpen(true);
    setLoading(true);

    try {
      const serverData = await api.generateReport(videoId);
      if (serverData) {
        setReport(serverData);
      } else {
        generateLocalReport();
      }
    } catch (e) {
      generateLocalReport();
    } finally {
      setLoading(false);
    }
  };

  const generateLocalReport = () => {
    const localReport = {
      risks: risks,
      events: events.map(e => ({
        time: new Date(e.video_timestamp! * 1000).toISOString().substr(11, 8),
        worker_id: e.track_id,
        action: e.action || 'Unknown',
        violation: e.type
      })).slice(0, 100)
    };
    setReport(localReport);
  };

  const handlePrint = () => window.print();

  // --- ИСПРАВЛЕННАЯ ФУНКЦИЯ С ДИНАМИЧЕСКИМ ИМПОРТОМ ---
    const handleDownloadPDF = async () => {
    if (!reportRef.current) return;

    // Динамический импорт для html2pdf.js
    // @ts-ignore
    const html2pdf = (await import('html2pdf.js')).default;

    const element = reportRef.current;

    // Исправление: добавляем явное приведение типа для image.type
    const opt = {
      margin: 10,
      filename: `ARGUS_AUDIT_REPORT_#${videoId?.toString().padStart(6, '0')}_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 }, // <--- 'jpeg' as const
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { orientation: 'portrait' as const, unit: 'mm' as const, format: 'a4' as const } // <--- тоже добавил as const для надежности
    };

    html2pdf().set(opt).from(element).save();
  };


  const hasData = report && ((report.risks && report.risks.length > 0) || (report.events && report.events.length > 0));

  const activeStyle = {
    bgcolor: '#050505',
    color: '#eee',
    border: '1px solid #333',
    p: 4,
    fontFamily: '"Inter", sans-serif',
  };

  return (
    <>
      <Button
        variant="contained"
        startIcon={<SummarizeIcon />}
        onClick={handleGenerate}
        disabled={!videoId}
        sx={{ bgcolor: '#FFD700', color: '#000', fontWeight: 'bold', '&:hover': { bgcolor: '#FFEA00' } }}
      >
        AUDIT REPORT
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <Box sx={{ bgcolor: '#111', borderBottom: '1px solid #333', p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box display="flex" gap={1} alignItems="center">
                <SummarizeIcon sx={{ color: '#FFD700' }} />
                <Typography variant="h6" color="#FFF" sx={{ fontFamily: 'Orbitron', letterSpacing: 1 }}>
                    SAFETY AUDIT LOG
                </Typography>
            </Box>
            <Box>
                <IconButton onClick={handleDownloadPDF} disabled={!hasData} sx={{ color: hasData ? '#FFD700' : '#666', mr: 1 }} title="Download as PDF">
                    <FileDownloadIcon />
                </IconButton>
                <IconButton onClick={handlePrint} disabled={!hasData} sx={{ color: '#888', mr: 1 }}>
                    <PrintIcon />
                </IconButton>
                <IconButton onClick={() => setOpen(false)} sx={{ color: '#888' }}>
                    <CloseIcon />
                </IconButton>
            </Box>
        </Box>

        <DialogContent sx={{ bgcolor: '#000', p: 3 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" height="300px" flexDirection="column" gap={2}>
              <CircularProgress sx={{ color: '#FFD700' }} />
              <Typography color="#666" variant="caption">GENERATING ANALYTICS...</Typography>
            </Box>
          ) : hasData ? (
            <Paper elevation={0} sx={activeStyle} ref={reportRef}>

              {/* HEADER */}
              <Box display="flex" justifyContent="space-between" mb={4} borderBottom="2px solid #FFD700" pb={2}>
                  <Box>
                      <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: -1, color: '#FFD700' }}>ARGUS.AI</Typography>
                      <Typography variant="caption" color="#666" sx={{ letterSpacing: 2 }}>SIBINTEK-SOFT INTELLIGENCE</Typography>
                  </Box>
                  <Box textAlign="right">
                      <Typography variant="h6" fontWeight="bold">SHIFT SAFETY AUDIT</Typography>
                      <Typography variant="caption" display="block" color="#888">
                          REF: #{videoId?.toString().padStart(6, '0')} | {new Date().toLocaleDateString()}
                      </Typography>
                  </Box>
              </Box>

              {/* RISK ANALYSIS */}
              <Box mb={4}>
                  <Typography variant="h6" sx={{ color: '#FFF', mb: 2, borderBottom: '1px solid #333', pb: 1 }}>
                      BEHAVIORAL RISK ANALYSIS
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={2}>
                      {report.risks && report.risks.map((r: any, idx: number) => (
                          <Paper key={idx} sx={{ p: 2, bgcolor: '#111', border: '1px solid #333', minWidth: 200, flex: 1 }}>
                              <Box display="flex" justifyContent="space-between" mb={1}>
                                  <Typography variant="subtitle2" fontWeight="bold" color="#FFF">Worker #{r.id || r.track_id}</Typography>
                                  <Chip label={`RISK: ${r.score}`} size="small" sx={{ bgcolor: r.score > 50 ? '#FF3D00' : '#FFD700', color: '#000', fontWeight: 'bold', height: 20 }} />
                              </Box>
                              <Typography variant="caption" color="#AAA">
                                  {r.violations && typeof r.violations === 'object' && !Array.isArray(r.violations)
                                    ? Object.entries(r.violations).map(([k, v]) => `${k} (${v})`).join(', ')
                                    : JSON.stringify(r.violations || {}).replace(/[{}"']/g, '')
                                  }
                              </Typography>
                          </Paper>
                      ))}
                  </Box>
              </Box>

              {/* DETAILED LOG TABLE */}
              <Typography variant="h6" sx={{ color: '#FFF', mb: 2, borderBottom: '1px solid #333', pb: 1 }}>
                  DETAILED EVENT LOG
              </Typography>
              <Table size="small">
                  <TableHead>
                      <TableRow sx={{ bgcolor: '#111' }}>
                          <TableCell sx={{ color: '#FFD700', fontWeight: 'bold' }}>TIME</TableCell>
                          <TableCell sx={{ color: '#FFD700', fontWeight: 'bold' }}>ID</TableCell>
                          <TableCell sx={{ color: '#FFD700', fontWeight: 'bold' }}>ACTION</TableCell>
                          <TableCell sx={{ color: '#FFD700', fontWeight: 'bold' }}>VIOLATION</TableCell>
                      </TableRow>
                  </TableHead>
                  <TableBody>
                      {report.events && report.events.map((ev: any, i: number) => (
                          <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <TableCell sx={{ color: '#DDD', fontFamily: 'monospace', fontSize: '0.85rem' }}>{ev.time}</TableCell>
                              <TableCell sx={{ color: '#FFD700', fontWeight: 'bold' }}>#{ev.worker_id}</TableCell>
                              <TableCell sx={{ color: '#AAA', fontSize: '0.85rem' }}>{ev.action}</TableCell>
                              <TableCell>
                                  <Chip
                                    label={ev.violation}
                                    size="small"
                                    sx={{
                                        bgcolor: ev.violation?.includes('fall') ? '#FF3D00' : 'rgba(255,255,255,0.1)',
                                        color: '#CCC', height: 20, fontSize: '0.65rem'
                                    }}
                                  />
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>

              <Box mt={4} pt={2} borderTop="1px dashed #444" textAlign="center">
                  <Typography variant="caption" color="#444">
                      CONFIDENTIAL DOCUMENT. PROPERTY OF SIBINTEK-SOFT.
                  </Typography>
              </Box>

            </Paper>
          ) : (
            <Box textAlign="center" py={5}>
                <WarningAmberIcon sx={{ fontSize: 60, color: '#333', mb: 2 }} />
                <Typography color="error" variant="h6">NO DATA AVAILABLE</Typography>
                <Typography color="#666">
                    The system detected 0 events locally and API returned 404.
                </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
