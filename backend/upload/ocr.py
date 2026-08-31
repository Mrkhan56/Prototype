import io
import logging
from typing import Any, Optional
from PIL import Image, ImageOps, ImageFilter
import pytesseract
from pdf2image import convert_from_bytes
import pypdf

logger = logging.getLogger(__name__)

class LegalDocumentOCR:
    def __init__(self, tesseract_cmd: Optional[str] = None):
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    def _preprocess_image(self, img: Image.Image) -> Image.Image:
        try:
            import cv2  # type: ignore[import-untyped]
            import numpy as np  # type: ignore[import-untyped]

            open_cv_image: Any = np.array(img.convert('RGB')) 
            open_cv_image = open_cv_image[:, :, ::-1].copy() 
            
            gray: Any = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
            blur: Any = cv2.GaussianBlur(gray, (5, 5), 0)
            _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            return Image.fromarray(thresh)
        except Exception:
            # Pure PIL fallback
            gray_img = ImageOps.grayscale(img)
            blurred = gray_img.filter(ImageFilter.GaussianBlur(radius=0.8))
            lut = [255 if i > 140 else 0 for i in range(256)]
            return blurred.point(lut)

    def _pdf_has_selectable_text(self, file_bytes: bytes) -> bool:
        try:
            pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            for page in pdf_reader.pages[:3]:
                if page.extract_text() and page.extract_text().strip():
                    return True
            return False
        except Exception as e:
            logger.warning(f"Failed to check PDF for text: {e}")
            return False

    def extract_text(self, file_bytes: bytes, mime_type: str) -> Optional[str]:
        if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return None
            
        try:
            pytesseract.get_tesseract_version()
        except Exception:
            logger.info("Tesseract is not installed or not in PATH. Skipping OCR.")
            return None
            
        if mime_type == "application/pdf":
            if self._pdf_has_selectable_text(file_bytes):
                return None  # Has text, no OCR needed
                
            try:
                images = convert_from_bytes(file_bytes, dpi=300)
                full_text = []
                for img in images:
                    processed_img = self._preprocess_image(img)
                    text = pytesseract.image_to_string(processed_img)
                    full_text.append(text)
                return "\n".join(full_text)
            except Exception as e:
                logger.error(f"PDF OCR failed: {e}")
                return None
                
        elif mime_type.startswith("image/"):
            try:
                img = Image.open(io.BytesIO(file_bytes))
                processed_img = self._preprocess_image(img)
                return pytesseract.image_to_string(processed_img)
            except Exception as e:
                logger.error(f"Image OCR failed: {e}")
                return None
                
        return None
