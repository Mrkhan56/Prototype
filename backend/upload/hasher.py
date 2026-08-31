import hashlib
import io

def compute_sha256(file_stream: io.BytesIO) -> str:
    file_stream.seek(0)
    hash_obj = hashlib.sha256(file_stream.read())
    file_stream.seek(0)
    return hash_obj.hexdigest()

def compute_sha256_streaming(file_stream: io.BytesIO, chunk_size: int = 65536) -> str:
    file_stream.seek(0)
    hash_obj = hashlib.sha256()
    for chunk in iter(lambda: file_stream.read(chunk_size), b""):
        hash_obj.update(chunk)
    file_stream.seek(0)
    return hash_obj.hexdigest()

def verify_hash(file_stream: io.BytesIO, expected_hash: str) -> bool:
    computed_hash = compute_sha256_streaming(file_stream)
    return computed_hash == expected_hash
