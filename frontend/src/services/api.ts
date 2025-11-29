import axios from 'axios';
import { SafetyEvent, SystemStats, RiskProfile, VideoFile } from '../types';

const API_URL = 'http://localhost:8000/api/v1';

// Тип для данных о поездах
export type TrainSummaryItem = {
  train_id: string;            // "ЭП20-076"
  arrival: string;             // ISO
  departure: string | null;    // ISO | null
  duration_minutes: number | null;
};

export const api = {
  // Загрузка видео
  uploadVideo: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post(`${API_URL}/upload_video`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Получить список видео
  getVideos: async (): Promise<VideoFile[]> => {
    try {
      const response = await axios.get(`${API_URL}/videos`);
      return response.data;
    } catch (e) {
      return [];
    }
  },

  // Удалить видео
  deleteVideo: async (id: number) => {
    return axios.delete(`${API_URL}/videos/${id}`);
  },

  // События видео
  getVideoEvents: async (videoId: number): Promise<SafetyEvent[]> => {
    try {
      const response = await axios.get(`${API_URL}/videos/${videoId}/events`);
      return response.data;
    } catch (e) {
      return [];
    }
  },

  // Статистика
  getStats: async (videoId?: number): Promise<SystemStats> => {
    try {
      const url = videoId ? `${API_URL}/stats?video_id=${videoId}` : `${API_URL}/stats`;
      const response = await axios.get(url);
      return response.data;
    } catch (e) {
      console.error("Stats API Error:", e);
      return {
        total_incidents: 0,
        safety_score: 100,
        trir: 0,
        active_cameras: 0,
        workers_total: 0,
        incidents_trend: []
      };
    }
  },

  // Риск-рейтинг
  getRiskRanking: async (videoId: number): Promise<RiskProfile[]> => {
    try {
      const response = await axios.get(`${API_URL}/videos/${videoId}/risk_ranking`);
      return response.data;
    } catch (e) {
      return [];
    }
  },

  // Данные по поездам
  getTrainSummary: async (videoId: number): Promise<TrainSummaryItem[]> => {
    try {
      const response = await axios.get(`${API_URL}/trains/summary/${videoId}`);
      return response.data;
    } catch (e) {
      return [];
    }
  },

  // AI Чат
  askAI: async (message: string) => {
    // Используем query, как в backend модели AIQuery
    const response = await axios.post(`${API_URL}/ask_ai`, { query: message });
    return response.data;
  },

  // Сброс базы данных
  resetDb: async () => {
    return axios.post(`${API_URL}/reset_db`);
  },

  // --- РАБОТА С ЗОНАМИ ---

  // Сохранить зону для видео (принимает videoId и массив точек)
  setZone: async (videoId: number, points: number[][]) => {
    // Передаем points напрямую, т.к. бэкенд теперь умеет принимать List[List[float]]
    return axios.post(`${API_URL}/update_zone?video_id=${videoId}`, points);
  },

  // Получить зону для видео
  getZone: async (videoId: number): Promise<number[][]> => {
    try {
      const response = await axios.get(`${API_URL}/get_zone?video_id=${videoId}`);
      return response.data; // Ожидаем [[x,y], ...]
    } catch (e) {
      return [];
    }
  },

      reprocessVideo: async (videoId: number) => {
    return axios.post(`${API_URL}/videos/${videoId}/reprocess`);
  },

      generateReport: async (videoId: number) => {
    try {
        // Пробуем запросить у бэкенда готовый JSON отчета
        const res = await axios.get(`${API_URL}/videos/${videoId}/report`);
        return res.data;
    } catch (e) {
        // Если бэкенд не умеет генерировать отчет, возвращаем null.
        // Компонент ReportGenerator перехватит это и сгенерирует отчет сам из локальных данных.
        return null;
    }
  },
};

// Вспомогательные функции (fetch), если где-то используются напрямую
export async function fetchTrainSummary(videoId: number): Promise<TrainSummaryItem[]> {
  const r = await fetch(`${API_URL}/trains/summary/${videoId}`);
  if (!r.ok) throw new Error(`Train summary HTTP ${r.status}`);
  return r.json();
}

export async function fetchTrainChartPng(videoId: number): Promise<string> {
  const r = await fetch(`${API_URL}/trains/chart/${videoId}`);
  if (!r.ok) throw new Error(`Train chart HTTP ${r.status}`);
  const data = await r.json();
  return data.chart as string;
}
