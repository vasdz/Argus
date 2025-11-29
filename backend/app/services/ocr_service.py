# backend/app/services/ocr_service.py
import easyocr
import cv2
import re
from typing import Optional, Tuple


class OCRService:
    def __init__(self):
        print("⚡ INITIALIZING OCR SERVICE (EasyOCR)...")
        # Добавляем русский, убираем лишние ограничения
        self.reader = easyocr.Reader(['ru', 'en'], gpu=True)

    def extract_timestamp(self, frame) -> Optional[str]:
        """
        Читает время из левого верхнего угла.
        Пытается собрать формат:
        - 'YYYY-MM-DD HH:MM:SS' (как на твоём видео)
        - или просто 'HH:MM:SS'.
        Возвращает строку (без пробела между датой и временем) либо None.
        """
        h, w, _ = frame.shape
        roi = frame[0:int(h * 0.15), 0:int(w * 0.6)]

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

        texts = self.reader.readtext(gray, detail=0, allowlist='0123456789:- ')

        date_part = None
        time_part = None

        for text in texts:
            t = text.replace('.', ':').strip()

            # Ищем дату YYYY-MM-DD
            m_date = re.search(r'\d{4}-\d{2}-\d{2}', t)
            if m_date:
                date_part = m_date.group(0)

            # Ищем время HH:MM:SS
            m_time = re.search(r'\d{2}:\d{2}:\d{2}', t)
            if m_time:
                time_part = m_time.group(0)

        if date_part and time_part:
            # Вернём без пробела, дальше парсим как "%Y-%m-%d%H:%M:%S"
            return f"{date_part}{time_part}"
        if time_part:
            return time_part

        return None


    def extract_train_number(self, frame, bbox):
        """
        Пытается вытащить номер поезда вида 'ЭП20 076' / 'ЭП20-076' / 'EP20 076'
        внутри указанного bbox.
        Возвращает (model, number, conf) или None.
        """
        x1, y1, x2, y2 = map(int, bbox)

        # Чуть расширяем область вокруг бокса
        pad = 10
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(frame.shape[1], x2 + pad)
        y2 = min(frame.shape[0], y2 + pad)

        roi = frame[y1:y2, x1:x2]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        # Усиливаем контраст
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

        # Увеличиваем мелкий текст
        if gray.shape[0] < 120:
            scale = 120 / gray.shape[0]
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        # detail=1 -> [bbox, text, conf]
        results = self.reader.readtext(gray, detail=1)

        best_num = None
        best_num_conf = 0.0
        best_model = None
        best_model_conf = 0.0

        for (_bbox_e, text, conf) in results:
            # Оставляем только буквы и цифры (рус/латиница)
            clean = re.sub(r"[^0-9A-Za-zА-Яа-яЁё]", "", text)
            if not clean:
                continue

            # Кандидат на номер: только цифры, длина 3–4
            if re.fullmatch(r"\d{3,4}", clean):
                if conf > best_num_conf:
                    best_num = clean
                    best_num_conf = conf
                continue

            # Кандидат на модель: есть и буквы, и цифры
            has_digit = any(ch.isdigit() for ch in clean)
            has_alpha = any(ch.isalpha() for ch in clean)
            if has_digit and has_alpha and 2 <= len(clean) <= 5:
                if conf > best_model_conf:
                    best_model = clean
                    best_model_conf = conf

        if best_model is None or best_num is None:
            return None

        # Нормализация
        model = best_model.upper()
        number = best_num.zfill(3)

        if re.search(r"[А-ЯЁ]", model):
            # 1) 3/9 в начале -> Э
            if model.startswith(("3", "9")):
                model = "Э" + model[1:]

            # 2) если начинается с 'П' и второй символ цифра → добавляем ведущую 'Э'
            if model.startswith("П") and len(model) >= 2 and model[1].isdigit():
                model = "Э" + model

            # 3) О/O после цифры -> 0 (П2О -> П20, ЭП2О -> ЭП20)
            chars = list(model)
            for i in range(1, len(chars)):
                if chars[i] in ("О", "O") and chars[i - 1].isdigit():
                    chars[i] = "0"
            model = "".join(chars)

            # 4) если получилось ЭП2 или ЭП02 → доводим до ЭП20
            if model.startswith("ЭП2"):
                model = "ЭП20"

        conf = min(best_model_conf, best_num_conf)
        return model, number, conf

    def extract_train_from_full_frame(self, frame) -> Optional[Tuple[str, str, float]]:
        """
        Ищет номер поезда в центральной части кадра.
        Включает мощную автокоррекцию для серии ЭП20.
        """
        h, w, _ = frame.shape
        # Центральный ROI (локомотив обычно в центре)
        roi = frame[int(h * 0.25):int(h * 0.8), int(w * 0.45):int(w * 0.98)]

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

        # Увеличиваем, чтобы символы стали четче
        target_h = 260
        if gray.shape[0] < target_h:
            scale = target_h / gray.shape[0]
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        # Добавляем whitelist, чтобы EasyOCR не выдумывал лишних символов
        results = self.reader.readtext(gray, detail=1,
                                       allowlist='0123456789ЭПЛЗOАБВГДЕЖЗИКМНОРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ')
        print("RAW OCR TRAIN:", results)

        best_num = None
        best_num_conf = 0.0
        best_model = None
        best_model_conf = 0.0

        for (_bbox, text, conf) in results:
            text = text.upper().replace(" ", "")

            # 1. Поиск номера (3 цифры, иногда 4 с ведущим нулем)
            # Очищаем от всего, кроме цифр
            digits = re.sub(r"\D", "", text)
            if len(digits) == 3 or (len(digits) == 4 and digits.startswith("0")):
                if conf > best_num_conf:
                    best_num = digits[-3:]  # берем последние 3 (0776 -> 776, 076 -> 076)
                    best_num_conf = float(conf)
                continue

            # 2. Поиск модели (буквы + цифры)
            # Ищем что-то похожее на ЭП20, 3П20, ЭЛ2, П20 и т.д.
            # Минимум 2 символа
            if len(text) >= 2:
                # Проверяем, есть ли цифры (обычно 2 или 20)
                has_digit = any(ch.isdigit() for ch in text)
                if has_digit:
                    if conf > best_model_conf:
                        best_model = text
                        best_model_conf = float(conf)

        if best_num is None:
            return None

        # Если модель не нашли, но нашли номер - пробуем поискать модель в "мусоре"
        if best_model is None:
            # Можно вернуть None, но лучше попробовать дефолт, если уверенности нет
            pass

        if best_model:
            # --- УМНАЯ КОРРЕКЦИЯ МОДЕЛИ ---
            # Таблица замен похожих символов
            replacements = {
                '3': 'Э', '9': 'Э', 'E': 'Э', '[': 'Э', '{': 'Э',  # Э
                'Л': 'П', 'N': 'П', 'II': 'П',  # П
                'Z': '2',  # 2
                'O': '0', 'О': '0', 'D': '0', 'Q': '0'  # 0
            }

            clean_model = list(best_model)
            for i, char in enumerate(clean_model):
                if char in replacements:
                    clean_model[i] = replacements[char]

            model_str = "".join(clean_model)

            # Чистим всё, что не Э, П, 2, 0
            model_str = re.sub(r"[^ЭП20]", "", model_str)

            # Если получилось что-то похожее на правду, восстанавливаем
            # Сценарии: П20 -> ЭП20, ЭП2 -> ЭП20, ЭЛ2 -> ЭП2 -> ЭП20

            if "П" in model_str and "2" in model_str:
                # Скорее всего это ЭП20
                final_model = "ЭП20"
            elif model_str == "Э20":  # Потерялась П
                final_model = "ЭП20"
            else:
                # Если совсем мусор, оставляем как есть или возвращаем исходный (но очищенный)
                # Но для твоего случая лучше вернуть то, что получилось после замен
                final_model = model_str if len(model_str) > 2 else best_model

            # Финальная страховка: если начинается не на Э, добавляем
            if final_model.startswith("П") or final_model.startswith("2"):
                final_model = "Э" + final_model

            # Если после всего этого получилось ЭП2, добиваем до 20
            if final_model == "ЭП2":
                final_model = "ЭП20"

            best_model = final_model
        else:
            # Если модель вообще не нашлась (только номер)
            # Можно вернуть None, но раз мы в депо, можно предположить ЭП20?
            # Но давай честно вернем None, чтобы не галлюцинировать, если не просили.
            # Или вернем "ЭП20" если ты хочешь aggressive mode.
            pass

        # Если после всех попыток модели нет, или она пустая
        if not best_model:
            return None

        conf = min(best_model_conf, best_num_conf)
        return best_model, best_num, conf


ocr_instance = OCRService()
