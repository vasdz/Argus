import cv2
import numpy as np
from typing import List, Dict


class ZoneManager:
    def __init__(self):
        # video_id -> List[List[float]]
        self.zones_map: Dict[int, List[List[float]]] = {}

    def set_zone(self, video_id: int, points: List[List[float]]):
        print(f"⚡ ZONE MANAGER: Setting zone for video {video_id}: {points}")
        self.zones_map[video_id] = points

    def get_zone(self, video_id: int):
        return self.zones_map.get(video_id, [])

    def check_point(self, video_id: int, x: int, y: int, frame_w: int, frame_h: int) -> str:
        """
        Проверяет точку (x, y) в пикселях
        """
        zone_norm = self.zones_map.get(video_id)

        if not zone_norm or len(zone_norm) < 3:
            return "Safe Zone"

        # 1. Конвертируем полигон в пиксели
        poly_pts = []
        for pt in zone_norm:
            px = int(pt[0] * frame_w)
            py = int(pt[1] * frame_h)
            poly_pts.append([px, py])

        # ВАЖНО: OpenCV любит формат (N, 1, 2) для контуров,
        # но pointPolygonTest ест и просто (N, 2) int32
        poly_np = np.array(poly_pts, dtype=np.int32)

        # Точка проверки (центр низа bbox)
        point = (float(x), float(y))

        # 2. Проверка
        # measureDist=False возвращает +1 (inside), -1 (outside), 0 (edge)
        result = cv2.pointPolygonTest(poly_np, point, False)

        # --- ОТЛАДКА (раскомментируй, если не заработает) ---
        # if result >= 0:
        #    print(f"[DEBUG] HIT! Point {point} is inside poly {poly_pts[:2]}...")

        if result >= 0:
            return "Danger Zone"

        return "Safe Zone"


# Глобальный инстанс
zone_service = ZoneManager()
