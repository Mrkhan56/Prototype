import io
import clamd
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

class MalwareScanException(Exception):
    pass

@dataclass
class ScanResult:
    is_clean: bool
    signature_or_status: str

class ClamAVScanner:
    def __init__(self, host: str = "127.0.0.1", port: int = 3310, strict_mode: bool = True):
        self.host = host
        self.port = port
        self.strict_mode = strict_mode
        self.cd = clamd.ClamdNetworkSocket(self.host, self.port)

    def ping(self) -> bool:
        try:
            return self.cd.ping() == "PONG"
        except Exception as e:
            logger.warning(f"ClamAV ping failed: {e}")
            return False

    def scan_stream(self, file_stream: io.BytesIO, max_size_bytes: int = 104857600) -> ScanResult:
        file_stream.seek(0)
        try:
            result = self.cd.instream(file_stream)
            file_stream.seek(0)
            
            if result is not None and "stream" in result:
                status, signature = result["stream"]
                if status == "OK":
                    return ScanResult(is_clean=True, signature_or_status="OK")
                else:
                    return ScanResult(is_clean=False, signature_or_status=signature)
            else:
                return ScanResult(is_clean=False, signature_or_status="UNKNOWN_RESPONSE")

                
        except Exception as e:
            file_stream.seek(0)
            logger.error(f"Malware scan error: {e}")
            if self.strict_mode:
                raise MalwareScanException(f"Failed to scan document and strict mode is enabled. Error: {e}")
            else:
                logger.warning("ClamAV unavailable, bypassing scan (strict_mode=False)")
                return ScanResult(is_clean=True, signature_or_status="BYPASSED_SCANNER_UNAVAILABLE")
