import io
import logging
from typing import Optional, Tuple
from PIL import Image
from pdf2image import convert_from_bytes

logger = logging.getLogger(__name__)

def generate_thumbnail(file_bytes: bytes, mime_type: str, max_size: Tuple[int, int] = (300, 400)) -> Optional[bytes]:
    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return None

    try:
        img = None
        if mime_type == "application/pdf":
            images = convert_from_bytes(file_bytes, dpi=72, first_page=1, last_page=1)
            if images:
                img = images[0]
        elif mime_type.startswith("image/"):
            img = Image.open(io.BytesIO(file_bytes))
            
        if img:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            thumb_io = io.BytesIO()
            # Convert to RGB if needed to save as PNG (e.g. RGBA)
            if img.mode != 'RGB' and img.mode != 'RGBA':
                img = img.convert('RGBA')
            img.save(thumb_io, format='PNG')
            return thumb_io.getvalue()
    except Exception as e:
        logger.error(f"Failed to generate thumbnail: {e}")
        
    return None
