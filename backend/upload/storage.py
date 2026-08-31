import boto3
from botocore.exceptions import ClientError
from datetime import datetime, timedelta
from typing import Optional
import io
import uuid
import logging


logger = logging.getLogger(__name__)

class S3WORMStorage:
    def __init__(self, bucket: str, endpoint: str, access_key: str, secret_key: str, region: str):
        self.bucket = bucket
        self.s3_client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )

    def upload_with_lock(self, file_obj: io.BytesIO, object_key: str, content_type: str, metadata: dict, retention_days: int = 2555) -> dict:
        retain_until_date = datetime.utcnow() + timedelta(days=retention_days)
        file_obj.seek(0)
        
        try:
            response = self.s3_client.put_object(
                Bucket=self.bucket,
                Key=object_key,
                Body=file_obj,
                ContentType=content_type,
                Metadata={str(k): str(v) for k, v in metadata.items()},
                ObjectLockMode='COMPLIANCE',
                ObjectLockRetainUntilDate=retain_until_date,
                ServerSideEncryption='AES256'
            )
            return {
                "version_id": response.get("VersionId", str(uuid.uuid4())),
                "etag": response.get("ETag", "").strip('"')
            }
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise Exception(f"Failed to upload file to storage: {e}")

    def download_file(self, object_key: str, version_id: Optional[str] = None) -> bytes:

        try:
            kwargs = {'Bucket': self.bucket, 'Key': object_key}
            if version_id:
                kwargs['VersionId'] = version_id
            
            response = self.s3_client.get_object(**kwargs)
            return response['Body'].read()
        except ClientError as e:
            logger.error(f"S3 download failed: {e}")
            raise Exception(f"Failed to download file from storage: {e}")

    def delete_file(self, object_key: str) -> None:
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=object_key)
        except ClientError as e:
            logger.error(f"S3 delete failed: {e}")

    def generate_presigned_url(self, object_key: str, expires_in: int = 3600) -> str:
        try:
            url = self.s3_client.generate_presigned_url(
                ClientMethod='get_object',
                Params={'Bucket': self.bucket, 'Key': object_key},
                ExpiresIn=expires_in
            )
            return url
        except ClientError as e:
            logger.error(f"S3 presigned URL generation failed: {e}")
            raise Exception(f"Failed to generate presigned URL: {e}")
