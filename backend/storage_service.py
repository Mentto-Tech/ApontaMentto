import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _safe_filename(filename: str | None) -> str:
    if not filename:
        return "arquivo"
    name = Path(filename).name
    name = re.sub(r"\s+", "-", name.strip())
    name = re.sub(r"[^a-zA-Z0-9._-]", "", name)
    return name or "arquivo"


@dataclass
class S3Config:
    enabled: bool
    bucket: Optional[str]
    region: Optional[str]
    endpoint_url: Optional[str]


class S3Storage:
    def __init__(self) -> None:
        self.config = S3Config(
            enabled=_as_bool(os.getenv("S3_ENABLED"), default=False),
            bucket=os.getenv("S3_BUCKET"),
            region=os.getenv("AWS_REGION"),
            endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        )
        self._client = None

    @property
    def enabled(self) -> bool:
        return self.config.enabled and bool(self.config.bucket)

    @property
    def bucket(self) -> str:
        if not self.config.bucket:
            raise RuntimeError("S3_BUCKET não configurado")
        return self.config.bucket

    def _get_client(self):
        if self._client is None:
            self._client = boto3.client(
                "s3",
                region_name=self.config.region,
                endpoint_url=self.config.endpoint_url,
            )
        return self._client

    def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
    ) -> None:
        client = self._get_client()
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type
        client.put_object(Bucket=self.bucket, Key=key, Body=data, **extra_args)

    def download_bytes(self, key: str) -> tuple[bytes, Optional[str]]:
        client = self._get_client()
        obj = client.get_object(Bucket=self.bucket, Key=key)
        body = obj["Body"].read()
        return body, obj.get("ContentType")

    def delete_object(self, key: str) -> None:
        client = self._get_client()
        client.delete_object(Bucket=self.bucket, Key=key)


def build_justification_s3_key(
    *,
    user_id: str,
    justification_id: str,
    date: str,
    original_filename: str | None,
) -> str:
    safe_name = _safe_filename(original_filename)
    return f"justifications/{user_id}/{date}/{justification_id}-{safe_name}"


def build_timesheet_pdf_s3_key(*, user_id: str, month: str, pdf_id: str) -> str:
    return f"timesheets/signed/{user_id}/{month}/{pdf_id}.pdf"


def is_s3_not_found(exc: Exception) -> bool:
    if isinstance(exc, ClientError):
        code = (exc.response.get("Error") or {}).get("Code")
        return code in {"NoSuchKey", "404", "NotFound"}
    return False


def is_s3_error(exc: Exception) -> bool:
    return isinstance(exc, (ClientError, BotoCoreError, NoCredentialsError, RuntimeError))
