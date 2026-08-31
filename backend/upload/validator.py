import io
import re
import zipfile
from PIL import Image, UnidentifiedImageError
from typing import Dict
from dataclasses import dataclass

try:
    import magic
    _magic_detector = magic.Magic(mime=True)
except Exception:
    _magic_detector = None

try:
    import puremagic
except ImportError:
    puremagic = None

@dataclass
class ValidatedFile:
    mime_type: str
    size: int

class DocumentValidationError(Exception):
    pass

ALLOWED_MIME_TYPES: Dict[str, bytes] = {
    "application/pdf": b"%PDF-",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/tiff": b"II*\x00",
}

def detect_mime_type(header: bytes, filename: str = "") -> str:
    """Detect MIME type using python-magic if available, falling back to puremagic / header byte checks."""
    if _magic_detector is not None:
        try:
            return _magic_detector.from_buffer(header)
        except Exception:
            pass

    # Fallback to signature checks
    if header.startswith(b"MZ"):
        return "application/x-dosexec"
    if header.startswith(b"\x7fELF"):
        return "application/x-executable"
    if header.startswith(b"%PDF-"):
        return "application/pdf"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"II*\x00") or header.startswith(b"MM\x00*"):
        return "image/tiff"
    if header.startswith(b"PK\x03\x04"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    if puremagic is not None:
        try:
            return puremagic.from_string(header, mime=True)
        except Exception:
            pass

    return "application/octet-stream"

def validate_file(file_stream: io.BytesIO, filename: str, max_size_bytes: int = 104857600) -> ValidatedFile:
    file_stream.seek(0, io.SEEK_END)
    size = file_stream.tell()
    if size > max_size_bytes:
        raise DocumentValidationError(f"File size {size} exceeds maximum allowed size of {max_size_bytes} bytes.")
    
    file_stream.seek(0)
    header = file_stream.read(2048)
    file_stream.seek(0)
    
    detected_mime = detect_mime_type(header, filename)
    
    if detected_mime not in ALLOWED_MIME_TYPES:
        if detected_mime.startswith("application/x-dosexec") or detected_mime.startswith("application/x-executable"):
            raise DocumentValidationError("Executables are not allowed.")
        if (filename.lower().endswith('.tiff') or filename.lower().endswith('.tif')) and detected_mime == "image/tiff":
            pass
        else:
            raise DocumentValidationError(f"MIME type {detected_mime} is not allowed.")
    
    # Check magic bytes
    if detected_mime == "image/tiff":
        if not (header.startswith(b"II*\x00") or header.startswith(b"MM\x00*")):
             raise DocumentValidationError("File does not match expected magic bytes for its MIME type.")
    else:
        if not header.startswith(ALLOWED_MIME_TYPES[detected_mime]):
            raise DocumentValidationError("File does not match expected magic bytes for its MIME type.")
            
    # Advanced checks
    if detected_mime == "application/pdf":
        _validate_pdf(file_stream)
    elif detected_mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        _validate_docx(file_stream)
    elif detected_mime.startswith("image/"):
        _validate_image(file_stream)
        
    return ValidatedFile(mime_type=detected_mime, size=size)

def _validate_pdf(file_stream: io.BytesIO) -> None:
    file_stream.seek(0)
    content = file_stream.read()
    file_stream.seek(0)
    
    suspicious_keywords = [b"/Launch", b"/JavaScript", b"/JS", b"/EmbeddedFiles", b"/OpenAction"]
    for keyword in suspicious_keywords:
        if keyword in content:
            raise DocumentValidationError(f"PDF contains potentially malicious content: {keyword.decode()}")

def _validate_docx(file_stream: io.BytesIO) -> None:
    try:
        with zipfile.ZipFile(file_stream) as z:
            namelist = z.namelist()
            for name in namelist:
                if name.endswith("vbaProject.bin"):
                    raise DocumentValidationError("DOCX contains macros which are not allowed.")
    except zipfile.BadZipFile:
        raise DocumentValidationError("Invalid DOCX/ZIP file structure.")
    finally:
        file_stream.seek(0)

def _validate_image(file_stream: io.BytesIO) -> None:
    try:
        with Image.open(file_stream) as img:
            img.verify()
    except UnidentifiedImageError:
        raise DocumentValidationError("Invalid or corrupted image file.")
    except Exception as e:
        raise DocumentValidationError(f"Image verification failed: {str(e)}")
    finally:
        file_stream.seek(0)
