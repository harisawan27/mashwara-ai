"""
Mashwara AI — Google Cloud Storage & Private Attachment Manager
================================================================
Handles V4 signed upload URL generation, object verification, byte streaming,
and safe idempotent deletion for private attachments in Firebase Storage (GCS).
Enforces file types, size limits, and non-predictable UUID storage keys.
"""

import os
import re
import datetime
import logging
from typing import Optional, Tuple, Dict, Any

from google.cloud import storage
import google.auth
from google.auth.credentials import Signing
from google.auth.transport.requests import Request as GoogleAuthRequest

logger = logging.getLogger("mashwara_ai.storage")

# Bucket Configuration
DEFAULT_BUCKET_NAME = "central-octane-473814-s0.firebasestorage.app"
BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", DEFAULT_BUCKET_NAME)

# File & Size Limits
MAX_FILES_PER_CONTEXT = 5
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024       # 20 MB
MAX_COMBINED_SIZE_BYTES = 50 * 1024 * 1024   # 50 MB
SIGNED_URL_EXPIRY_MINUTES = 5
DEFAULT_RUNTIME_SERVICE_ACCOUNT_EMAIL = "971578232755-compute@developer.gserviceaccount.com"


def _resolve_service_account_email(credentials: Any = None) -> str:
    """Resolve a real IAM signer email without accepting ADC's ``default`` sentinel."""
    env_email = (os.getenv("GCS_SERVICE_ACCOUNT_EMAIL") or "").strip()
    if env_email and env_email.lower() != "default":
        return env_email

    credential_email = (getattr(credentials, "service_account_email", None) or "").strip()
    if credential_email and credential_email.lower() != "default":
        return credential_email

    return DEFAULT_RUNTIME_SERVICE_ACCOUNT_EMAIL


def _signed_url_auth_kwargs() -> Dict[str, Any]:
    """Return signing arguments that work with both local and Cloud Run ADC.

    Service-account key credentials can sign locally. Cloud Run supplies
    compute credentials containing only an OAuth token, so the Storage client
    must use IAM ``signBlob`` via ``access_token`` and
    ``service_account_email`` instead.
    """
    credentials = None

    try:
        credentials, _ = google.auth.default()
    except Exception:
        # Local tests may use a mocked Storage client without ADC.
        pass

    service_account_email = _resolve_service_account_email(credentials)
    logger.info("Using IAM signer service account: %s", service_account_email)

    kwargs: Dict[str, Any] = {"service_account_email": service_account_email}
    if credentials is not None and not isinstance(credentials, Signing):
        auth_request = GoogleAuthRequest()
        credentials.refresh(auth_request)
        if not credentials.token:
            raise RuntimeError("Cloud runtime credentials did not provide an access token for IAM signing.")
        kwargs["access_token"] = credentials.token

    return kwargs

# Allowed Extensions and MIME Types
ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

# Permissible content types including common text/plain variations
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
    "image/webp",
}

# Disallowed extensions (explicit blacklist for safety)
BLOCKED_EXTENSIONS = {
    ".html", ".htm", ".svg", ".zip", ".rar", ".7z", ".tar", ".gz",
    ".exe", ".bat", ".sh", ".cmd", ".ps1", ".py", ".js", ".ts",
    ".php", ".bin", ".iso", ".dll"
}

# ---------------------------------------------------------------------------
# Voice Note Audio Storage Configuration (Phase 4)
# ---------------------------------------------------------------------------
MAX_VOICE_AUDIO_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_VOICE_DURATION_SECONDS = 900               # 15 minutes

ALLOWED_AUDIO_EXTENSIONS = {
    ".webm": "audio/webm",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".mp3": "audio/mpeg",
}

ALLOWED_AUDIO_MIMES = {
    "audio/webm",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/aac",
    "audio/mpeg",
}


def validate_audio_metadata(content_type: str, size_bytes: int) -> Tuple[bool, Optional[str]]:
    """
    Validates audio MIME type and size against Phase 4 limits.
    Returns (is_valid, error_message).
    """
    if size_bytes <= 0:
        return False, "Audio recording is empty."
    if size_bytes > MAX_VOICE_AUDIO_SIZE_BYTES:
        return False, f"Audio size ({round(size_bytes / (1024*1024), 2)} MB) exceeds 25 MB limit."

    mime_clean = (content_type or "").split(";")[0].strip().lower()
    if mime_clean not in ALLOWED_AUDIO_MIMES:
        return False, f"Unsupported audio format '{mime_clean}'. Allowed: WebM, MP4, M4A, OGG, WAV, AAC, MP3."

    return True, None


def get_audio_extension_for_mime(content_type: str) -> str:
    """Returns safe file extension for audio MIME type."""
    clean = (content_type or "").split(";")[0].strip().lower()
    mapping = {
        "audio/webm": ".webm",
        "audio/mp4": ".mp4",
        "audio/m4a": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/ogg": ".ogg",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/wave": ".wav",
        "audio/aac": ".aac",
        "audio/mpeg": ".mp3",
    }
    return mapping.get(clean, ".webm")


def build_audio_storage_key(
    audio_id: str,
    content_type: str,
    user_id: Optional[str] = None,
    guest_scope_id: Optional[str] = None
) -> str:
    """
    Generates an ephemeral, secure GCS object path for temporary audio notes.
    Authenticated: audio-temp/users/{user_id}/{audio_id}/recording.{ext}
    Guest: audio-temp/guest/{guest_scope_id}/{audio_id}/recording.{ext}
    """
    ext = get_audio_extension_for_mime(content_type)
    if user_id:
        return f"audio-temp/users/{user_id}/{audio_id}/recording{ext}"
    guest_id = guest_scope_id or "unscoped"
    return f"audio-temp/guest/{guest_id}/{audio_id}/recording{ext}"


def build_tts_storage_key(
    meeting_id: str,
    cache_key: str,
    user_id: Optional[str] = None,
    guest_scope_id: Optional[str] = None,
) -> str:
    """
    Constructs isolated storage path for Phase 5 companion executive summary audio:
    Authenticated: tts-cache/users/{user_id}/{meeting_id}/{cache_key}.wav
    Guest:         tts-cache/guests/{guest_scope_id}/{meeting_id}/{cache_key}.wav
    """
    if user_id:
        return f"tts-cache/users/{user_id}/{meeting_id}/{cache_key}.wav"
    guest_id = guest_scope_id or "unscoped"
    return f"tts-cache/guests/{guest_id}/{meeting_id}/{cache_key}.wav"


def sanitize_filename(filename: str) -> str:
    """Sanitize user-provided display filename for storage keys."""
    clean = os.path.basename(filename).strip()
    clean = re.sub(r'[^a-zA-Z0-9._-]', '_', clean)
    return clean[:64] or "document"


def validate_file_metadata(filename: str, mime_type: str, size_bytes: int) -> Tuple[bool, Optional[str]]:
    """
    Validates file extension, declared MIME type, and size against allowlists.
    Returns (is_valid, error_message).
    """
    if size_bytes <= 0:
        return False, "File is empty."
    if size_bytes > MAX_FILE_SIZE_BYTES:
        return False, f"File size ({round(size_bytes / (1024*1024), 2)} MB) exceeds 20 MB limit."

    name_lower = filename.lower()
    ext = os.path.splitext(name_lower)[1]

    if ext in BLOCKED_EXTENSIONS:
        return False, f"File type '{ext}' is not permitted for security reasons."

    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file type '{ext}'. Allowed: PDF, DOCX, TXT, MD, CSV, XLSX, PNG, JPG, WEBP."

    # Normalize mime type
    mime_clean = (mime_type or "").split(";")[0].strip().lower()
    if mime_clean not in ALLOWED_MIME_TYPES and mime_clean != "application/octet-stream":
        # If mime is unknown/generic but extension is explicitly supported, check compatibility
        expected_mime = ALLOWED_EXTENSIONS[ext]
        if expected_mime != mime_clean:
            return False, f"MIME type '{mime_type}' does not match file extension '{ext}'."

    return True, None


def build_storage_key(
    attachment_id: str,
    context_id: str,
    filename: str,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    guest_scope_id: Optional[str] = None,
    is_dev_test: bool = False
) -> str:
    """
    Generates a secure, non-predictable GCS object key layout.
    """
    safe_name = sanitize_filename(filename)

    if is_dev_test:
        return f"dev-test/{guest_scope_id or 'test'}/{context_id}/{attachment_id}/{safe_name}"

    if user_id:
        sess = session_id or "global"
        return f"users/{user_id}/sessions/{sess}/{context_id}/{attachment_id}/{safe_name}"

    guest_id = guest_scope_id or "unscoped"
    return f"guest/{guest_id}/{context_id}/{attachment_id}/{safe_name}"


class GCSStorageClient:
    """Singleton Google Cloud Storage manager."""

    def __init__(self, bucket_name: str = BUCKET_NAME):
        self.bucket_name = bucket_name
        self._client: Optional[storage.Client] = None

    @property
    def client(self) -> storage.Client:
        if self._client is None:
            try:
                self._client = storage.Client()
            except Exception as e:
                logger.warning(f"Failed to initialize default storage.Client: {e}")
                self._client = None
        return self._client

    def generate_signed_upload_url(
        self,
        storage_key: str,
        content_type: str,
        expires_minutes: int = SIGNED_URL_EXPIRY_MINUTES,
    ) -> str:
        """
        Generates a V4 signed PUT URL with expiry bound to content_type.
        Uses Cloud Run runtime service account via ADC or service-account email.
        """
        client = self.client
        if not client:
            raise RuntimeError("Google Cloud Storage client is not initialized.")

        bucket = client.bucket(self.bucket_name)
        blob = bucket.blob(storage_key)

        try:
            # Generate V4 signed URL
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=expires_minutes),
                method="PUT",
                content_type=content_type,
                **_signed_url_auth_kwargs(),
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate signed URL for {storage_key}: {e}", exc_info=True)
            raise RuntimeError(f"Could not generate secure upload URL: {e}")

    def verify_uploaded_object(self, storage_key: str, max_size_bytes: int = MAX_FILE_SIZE_BYTES) -> Tuple[bool, int, Optional[str]]:
        """
        Verifies that an object exists in GCS and does not exceed max size.
        Returns (exists_and_valid, size_bytes, error_message).
        """
        client = self.client
        if not client:
            return False, 0, "Storage client unavailable"

        try:
            bucket = client.bucket(self.bucket_name)
            blob = bucket.get_blob(storage_key)
            if not blob:
                return False, 0, "Object not found in storage bucket."

            blob.reload()
            size = blob.size or 0
            if size <= 0:
                self.delete_object(storage_key)
                return False, 0, "Uploaded object is 0 bytes."

            if size > max_size_bytes:
                self.delete_object(storage_key)
                return False, size, f"Uploaded file ({size} bytes) exceeds limit ({max_size_bytes} bytes)."

            return True, size, None
        except Exception as e:
            logger.error(f"Error verifying uploaded object {storage_key}: {e}")
            return False, 0, str(e)

    def download_bytes(self, storage_key: str) -> bytes:
        """Downloads object bytes from GCS bucket."""
        client = self.client
        if not client:
            raise RuntimeError("Storage client unavailable")

        bucket = client.bucket(self.bucket_name)
        blob = bucket.blob(storage_key)
        return blob.download_as_bytes()

    def delete_object(self, storage_key: str) -> bool:
        """Safely deletes an object from GCS (idempotent, ignores 404)."""
        client = self.client
        if not client:
            return False

        try:
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(storage_key)
            blob.delete()
            logger.info(f"Deleted GCS object: {storage_key}")
            return True
        except Exception as e:
            err_msg = str(e).lower()
            if "404" in err_msg or "not found" in err_msg:
                return True
            logger.warning(f"Could not delete GCS object {storage_key}: {e}")
            return False

    def delete_prefix(self, prefix: str) -> int:
        """Deletes all objects matching prefix (for context or session deletion)."""
        client = self.client
        if not client:
            return 0

        try:
            bucket = client.bucket(self.bucket_name)
            blobs = list(bucket.list_blobs(prefix=prefix))
            count = 0
            for blob in blobs:
                try:
                    blob.delete()
                    count += 1
                except Exception:
                    pass
            logger.info(f"Deleted {count} GCS objects under prefix: {prefix}")
            return count
        except Exception as e:
            logger.warning(f"Error deleting prefix {prefix}: {e}")
            return 0

    def save_bytes(self, storage_key: str, data: bytes, content_type: str = "audio/wav") -> bool:
        """Uploads raw bytes to GCS bucket at storage_key."""
        client = self.client
        if not client:
            raise RuntimeError("Storage client unavailable")
        bucket = client.bucket(self.bucket_name)
        blob = bucket.blob(storage_key)
        blob.upload_from_string(data, content_type=content_type)
        logger.info(f"Saved {len(data)} bytes to GCS object: {storage_key} ({content_type})")
        return True

    def object_exists(self, storage_key: str) -> bool:
        """Checks if an object exists in GCS bucket."""
        client = self.client
        if not client:
            return False
        try:
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(storage_key)
            return blob.exists()
        except Exception as e:
            logger.warning(f"Error checking blob existence {storage_key}: {e}")
            return False

    def generate_signed_download_url(self, storage_key: str, expires_minutes: int = 10) -> str:
        """
        Generates a V4 signed GET URL with given expiry (default 10 minutes / 600s).
        Uses Cloud Run runtime service account via ADC or fallback service account email.
        """
        client = self.client
        if not client:
            raise RuntimeError("Google Cloud Storage client is not initialized.")

        bucket = client.bucket(self.bucket_name)
        blob = bucket.blob(storage_key)

        try:
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=expires_minutes),
                method="GET",
                **_signed_url_auth_kwargs(),
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate download signed URL for {storage_key}: {e}", exc_info=True)
            raise RuntimeError(f"Could not generate secure download URL: {e}")

    def delete_tts_cache_for_user(self, user_id: str, meeting_id: Optional[str] = None) -> int:
        """Idempotently cleans up TTS audio cache objects for a user or specific meeting."""
        prefix = f"tts-cache/users/{user_id}/{meeting_id}/" if meeting_id else f"tts-cache/users/{user_id}/"
        try:
            return self.delete_prefix(prefix)
        except Exception as e:
            logger.warning(f"Failed to clean up TTS cache for user {user_id}: {e}")
            return 0

    def delete_tts_cache_for_guest(self, guest_scope_id: str, meeting_id: Optional[str] = None) -> int:
        """Idempotently cleans up TTS audio cache objects for a guest scope or specific meeting."""
        prefix = f"tts-cache/guests/{guest_scope_id}/{meeting_id}/" if meeting_id else f"tts-cache/guests/{guest_scope_id}/"
        try:
            return self.delete_prefix(prefix)
        except Exception as e:
            logger.warning(f"Failed to clean up TTS cache for guest {guest_scope_id}: {e}")
            return 0


# Global singleton instance
storage_client = GCSStorageClient()


def generate_signed_upload_url(
    storage_key: str,
    content_type: str,
    expires_minutes: int = SIGNED_URL_EXPIRY_MINUTES,
) -> str:
    """Convenience wrapper for storage_client.generate_signed_upload_url."""
    return storage_client.generate_signed_upload_url(
        storage_key=storage_key,
        content_type=content_type,
        expires_minutes=expires_minutes,
    )


def generate_v4_upload_signed_url(
    object_name: str,
    content_type: str,
    expires_minutes: int = SIGNED_URL_EXPIRY_MINUTES,
) -> str:
    """Explicit V4 signed upload URL generator accepting (object_name, content_type, expires_minutes)."""
    return storage_client.generate_signed_upload_url(
        storage_key=object_name,
        content_type=content_type,
        expires_minutes=expires_minutes,
    )


def verify_uploaded_blob(storage_key: str, max_size_bytes: int = MAX_FILE_SIZE_BYTES) -> Tuple[bool, int, Optional[str]]:
    """Convenience wrapper for storage_client.verify_uploaded_object."""
    return storage_client.verify_uploaded_object(storage_key, max_size_bytes)


verify_uploaded_object = verify_uploaded_blob


def delete_blob(storage_key: str) -> bool:
    """Convenience wrapper for storage_client.delete_object."""
    return storage_client.delete_object(storage_key)


def delete_prefix(prefix: str) -> int:
    """Convenience wrapper for storage_client.delete_prefix."""
    return storage_client.delete_prefix(prefix)


def download_gcs_blob_bytes(storage_key: str) -> bytes:
    """Convenience wrapper for storage_client.download_bytes."""
    return storage_client.download_bytes(storage_key)


def save_blob_bytes(storage_key: str, data: bytes, content_type: str = "audio/wav") -> bool:
    """Convenience wrapper for storage_client.save_bytes."""
    return storage_client.save_bytes(storage_key, data, content_type=content_type)


def blob_exists(storage_key: str) -> bool:
    """Convenience wrapper for storage_client.object_exists."""
    return storage_client.object_exists(storage_key)


def generate_signed_download_url(storage_key: str, expires_minutes: int = 10) -> str:
    """Convenience wrapper for storage_client.generate_signed_download_url (default 10 minutes / 600s)."""
    return storage_client.generate_signed_download_url(storage_key, expires_minutes=expires_minutes)


def delete_tts_cache_for_user(user_id: str, meeting_id: Optional[str] = None) -> int:
    """Convenience wrapper for storage_client.delete_tts_cache_for_user."""
    return storage_client.delete_tts_cache_for_user(user_id, meeting_id)


def delete_tts_cache_for_guest(guest_scope_id: str, meeting_id: Optional[str] = None) -> int:
    """Convenience wrapper for storage_client.delete_tts_cache_for_guest."""
    return storage_client.delete_tts_cache_for_guest(guest_scope_id, meeting_id)
