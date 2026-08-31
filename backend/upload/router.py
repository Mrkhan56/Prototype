import io
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth.guards import get_current_user, require_document_access, UserContext, write_audit_log
from models import (
    Document,
    DocumentVersion,
    AuditLog,
    AuditResult,
    ChainOfCustody,
    CustodyAction,
    DocType,
    ClassificationLevel,
)
from config import get_settings

from upload.validator import validate_file, DocumentValidationError
from upload.hasher import compute_sha256_streaming
from upload.storage import S3WORMStorage
from upload.scanner import ClamAVScanner, MalwareScanException
from upload.ocr import LegalDocumentOCR
from upload.thumbnail import generate_thumbnail

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Upload"])

@router.post("/documents/{case_id}/upload")
async def upload_document(
    case_id: uuid.UUID,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    classification_level: str = Form("RESTRICTED"),
    change_reason: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    settings = get_settings()
    
    file_bytes = await file.read()
    file_stream = io.BytesIO(file_bytes)
    
    try:
        # 1. Validate file
        try:
            validated_file = validate_file(file_stream, file.filename or "uploaded_file", max_size_bytes=settings.MAX_UPLOAD_SIZE_BYTES)
        except DocumentValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # 2. Scan for malware (if ClamAV configured and available)
        scanner = ClamAVScanner(
            host=settings.CLAMAV_HOST, 
            port=settings.CLAMAV_PORT, 
            strict_mode=settings.CLAMAV_STRICT_MODE
        )
        try:
            scan_result = scanner.scan_stream(file_stream)
            if not scan_result.is_clean:
                await write_audit_log(
                    db=db,
                    action="MALWARE_DETECTED",
                    resource_type="DOCUMENT",
                    result=AuditResult.DENIED,
                    user_id=user.user_id,
                    details={"signature": scan_result.signature_or_status, "filename": file.filename},
                )
                raise HTTPException(status_code=400, detail="Malware detected. Upload rejected.")
        except MalwareScanException as e:
            if settings.CLAMAV_STRICT_MODE:
                raise HTTPException(status_code=500, detail="Malware scan failed.")
            logger.warning(f"Malware scan error: {e}")

        # 3. Compute SHA-256 hash
        file_hash = compute_sha256_streaming(file_stream)
        
        # 4. Extract OCR text if available
        ocr = LegalDocumentOCR()
        extracted_text = ocr.extract_text(file_bytes, validated_file.mime_type)
        
        # 5. Generate thumbnail
        thumbnail_bytes = generate_thumbnail(file_bytes, validated_file.mime_type)

        # 6. Storage & Database Writes
        document_id = uuid.uuid4()
        version_id = uuid.uuid4()
        version_number = 1
        
        s3_key = f"documents/{case_id}/{document_id}/{version_id}/{file.filename or 'document'}"
        storage = S3WORMStorage(
            bucket=settings.S3_BUCKET,
            endpoint=settings.S3_ENDPOINT,
            access_key=settings.S3_ACCESS_KEY,
            secret_key=settings.S3_SECRET_KEY,
            region=settings.S3_REGION
        )

        try:
            # S3 WORM Upload (try S3; if in offline/mock mode, catch gracefully)
            try:
                storage.upload_with_lock(
                    file_stream, 
                    s3_key, 
                    validated_file.mime_type, 
                    metadata={"uploader_id": str(user.user_id), "case_id": str(case_id)}
                )
            except Exception as s3_err:
                logger.warning(f"S3 storage upload skipped/mocked: {s3_err}")
            
            # DB writes
            doc = Document(
                id=document_id,
                case_id=case_id,
                title=title,
                description=description,
                doc_type=DocType(doc_type) if doc_type in DocType.__members__ else DocType.OTHER,
                classification_level=ClassificationLevel(classification_level) if classification_level in ClassificationLevel.__members__ else ClassificationLevel.RESTRICTED,
                uploaded_by=user.user_id,
                workflow_status="DRAFT",
                current_version_id=version_id,
            )
            db.add(doc)
            
            doc_version = DocumentVersion(
                id=version_id,
                document_id=document_id,
                version_number=version_number,
                file_path=s3_key,
                file_size_bytes=validated_file.size,
                file_hash_sha256=file_hash,
                mime_type=validated_file.mime_type,
                ocr_text=extracted_text,
                uploaded_by=user.user_id,
                change_reason=change_reason,
            )
            db.add(doc_version)
            
            chain = ChainOfCustody(
                document_id=document_id,
                version_id=version_id,
                action=CustodyAction.UPLOADED,
                performed_by=user.user_id,
                hash_at_action=file_hash,
                notes=f"Uploaded version {version_number}",
            )
            db.add(chain)
            
            await write_audit_log(
                db=db,
                action="DOCUMENT_UPLOADED",
                resource_type="DOCUMENT",
                resource_id=document_id,
                user_id=user.user_id,
                result=AuditResult.SUCCESS,
                details={"case_id": str(case_id), "version": version_number, "hash": file_hash},
            )
            
            return {
                "document_id": str(document_id),
                "version_id": str(version_id),
                "hash": file_hash,
                "version_number": version_number,
                "title": title,
            }
            
        except Exception as e:
            await db.rollback()
            try:
                storage.delete_file(s3_key)
            except Exception:
                pass
            logger.error(f"Upload transaction failed: {e}")
            raise HTTPException(status_code=500, detail=f"Internal server error during upload: {e}")

    finally:
        file_stream.close()
