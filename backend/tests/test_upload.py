import pytest
import io
import uuid
from unittest.mock import patch, MagicMock

from upload.validator import validate_file, DocumentValidationError
from upload.hasher import compute_sha256, verify_hash
from upload.storage import S3WORMStorage
from upload.scanner import ClamAVScanner, ScanResult


def test_valid_pdf_upload():
    # Valid PDF magic bytes
    pdf_content = b"%PDF-1.4\nSome content"
    stream = io.BytesIO(pdf_content)
    validated = validate_file(stream, "test.pdf")
    assert validated.mime_type == "application/pdf"
    assert validated.size == len(pdf_content)

def test_executable_rejected():
    # MZ header (Windows PE)
    exe_content = b"MZ\x90\x00\x03\x00\x00\x00"
    stream = io.BytesIO(exe_content)
    with pytest.raises(DocumentValidationError, match="Executables are not allowed."):
         validate_file(stream, "test.exe")

def test_oversized_file_rejected():
    stream = io.BytesIO(b"A" * 10) # Using small file but overriding limit
    with pytest.raises(DocumentValidationError, match="exceeds maximum allowed size"):
        validate_file(stream, "test.pdf", max_size_bytes=5)

def test_magic_byte_mismatch_rejected():
    exe_content = b"MZ\x90\x00\x03\x00\x00\x00"
    stream = io.BytesIO(exe_content)
    with pytest.raises(DocumentValidationError):
        validate_file(stream, "fake.pdf")

def test_pdf_with_javascript_rejected():
    pdf_content = b"%PDF-1.4\n/JavaScript some malicious code"
    stream = io.BytesIO(pdf_content)
    with pytest.raises(DocumentValidationError, match="potentially malicious content"):
        validate_file(stream, "malicious.pdf")

def test_docx_with_macros_rejected():
    # Mocking this requires a valid zip file structure containing vbaProject.bin
    import zipfile
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as zf:
        zf.writestr('vbaProject.bin', 'malicious macro')
    
    # We must patch magic because this won't be detected as valid docx by python-magic due to missing headers
    # Here we just want to test _validate_docx directly
    from upload.validator import _validate_docx
    stream.seek(0)
    with pytest.raises(DocumentValidationError, match="macros which are not allowed"):
        _validate_docx(stream)

def test_sha256_computed_correctly():
    content = b"Hello World"
    stream = io.BytesIO(content)
    hash_val = compute_sha256(stream)
    # echo -n "Hello World" | sha256sum
    assert hash_val == "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e"

def test_hash_mismatch_blocks_download():
    # This tests the verify logic
    content = b"Original Content"
    stream = io.BytesIO(content)
    hash_val = compute_sha256(stream)
    
    altered_content = b"Altered Content"
    altered_stream = io.BytesIO(altered_content)
    assert verify_hash(altered_stream, hash_val) == False

@patch("boto3.client")
def test_partial_upload_cleanup(mock_boto_client):
    storage = S3WORMStorage("test-bucket", "http://localhost", "access", "secret", "us-east-1")
    
    storage.delete_file("test-key")
    mock_boto_client.return_value.delete_object.assert_called_with(Bucket="test-bucket", Key="test-key")

def test_corrupt_image_rejected():
    content = b"\xff\xd8\xff Not a real image"
    stream = io.BytesIO(content)
    from upload.validator import _validate_image
    with pytest.raises(DocumentValidationError, match="Invalid or corrupted image file"):
        _validate_image(stream)

