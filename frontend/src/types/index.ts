// frontend/src/types/index.ts

export interface SafetyEvent {
    id: number;
    type: string;            // Тип нарушения (no_helmet, fall...)
    timestamp: string;       // Время регистрации (ISO string)
    video_timestamp: number; // Время на таймлайне видео (сек)
    track_id: number;        // ID человека
    bbox?: number[];         // Координаты рамки [x1, y1, x2, y2]
    confidence?: number;
    action?: string; // <--- Добавить
    zone?: string;
}

export interface VideoFile {
    id: number;
    filename: string;
    processed: boolean;
    url: string;
}

export interface RiskProfile {
    id: number;
    score: number;
    violations: Record<string, number>;
}

export interface SystemStats {
  total_incidents: number;
  safety_score: number;
  active_cameras: number;
  trir: number;            // <--- ДОБАВИТЬ ЕСЛИ НЕТ
  workers_total: number;   // <--- ДОБАВИТЬ
  incidents_trend: { time: string; count: number }[];
}

export interface TrainSummaryItem {
  train_id: string;
  arrival: string;              // ISO-строка
  departure: string | null;     // ISO или null, если поезд ещё в депо
  duration_minutes: number | null;
}
