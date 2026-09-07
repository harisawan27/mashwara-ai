"""
Mashwara AI — Phase 4 Voice Note STT Test Suite
=================================================
Automated verification for Phase 4:
- Audio metadata validation & 25MB / 15-min limits
- Ephemeral GCS storage key tenancy & prefix isolation
- Smart dictation prompt generation & 30-term domain vocabulary
- Urdu script detection & Roman Urdu transliteration fallback
- FastAPI /audio/presign, /audio/{audio_id}/transcribe, and DELETE /audio handlers
- Triple-point privacy cleanup (Gemini Files, local temp, GCS blob)
"""

import os
import sys
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import HTTPException, Request

from tools.storage import (
    GCSStorageClient,
    validate_audio_metadata,
    get_audio_extension_for_mime,
    build_audio_storage_key,
    MAX_VOICE_AUDIO_SIZE_BYTES,
    MAX_VOICE_DURATION_SECONDS,
    ALLOWED_AUDIO_MIMES,
)
from agents.transcription import (
    NoSpeechDetectedError,
    build_transcription_prompt,
    has_significant_urdu_script,
    transliterate_urdu_to_roman_urdu,
    CUSTOM_DOMAIN_VOCABULARY,
    transcribe_voice_note,
)
from main import (
    presign_audio,
    upload_audio_endpoint,
    transcribe_audio_endpoint,
    delete_audio_endpoint,
    AudioPresignRequest,
    AudioTranscribeRequest,
)


class TestPhase4VoiceSTT(unittest.TestCase):

    def make_mock_request(self, headers=None):
        req = MagicMock(spec=Request)
        req.headers = headers or {}
        return req

    @patch("tools.storage.GoogleAuthRequest")
    @patch("tools.storage.google.auth.default")
    def test_cloud_run_credentials_use_iam_signing(self, mock_auth_default, mock_auth_request):
        """Cloud Run token-only credentials must use IAM signBlob."""
        runtime_credentials = MagicMock()
        runtime_credentials.service_account_email = (
            "971578232755-compute@developer.gserviceaccount.com"
        )
        runtime_credentials.token = "runtime-access-token"
        mock_auth_default.return_value = (runtime_credentials, "central-octane-473814-s0")

        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://storage.googleapis.com/signed-put-url"
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        storage_manager = GCSStorageClient("test-bucket")
        storage_manager._client = mock_client
        result = storage_manager.generate_signed_upload_url(
            "audio-temp/test/recording.webm",
            "audio/webm;codecs=opus",
        )

        self.assertEqual(result, "https://storage.googleapis.com/signed-put-url")
        runtime_credentials.refresh.assert_called_once_with(mock_auth_request.return_value)
        _, kwargs = mock_blob.generate_signed_url.call_args
        self.assertEqual(kwargs["access_token"], "runtime-access-token")
        self.assertEqual(
            kwargs["service_account_email"],
            "971578232755-compute@developer.gserviceaccount.com",
        )

    # ---------------------------------------------------------------------------
    # 1. Storage & Audio Metadata Validation Tests
    # ---------------------------------------------------------------------------
    def test_audio_metadata_validation(self):
        # Valid webm
        valid, err = validate_audio_metadata("audio/webm;codecs=opus", 1024 * 500)
        self.assertTrue(valid)
        self.assertIsNone(err)

        # Valid mp4 / m4a
        valid, err = validate_audio_metadata("audio/mp4", 1024 * 1024 * 5)
        self.assertTrue(valid)
        self.assertIsNone(err)

        # Valid wav
        valid, err = validate_audio_metadata("audio/wav", 1024 * 1024 * 10)
        self.assertTrue(valid)
        self.assertIsNone(err)

        # Empty audio rejected
        valid, err = validate_audio_metadata("audio/webm", 0)
        self.assertFalse(valid)
        self.assertIn("empty", err.lower())

        # Audio exceeding 25MB rejected
        valid, err = validate_audio_metadata("audio/webm", MAX_VOICE_AUDIO_SIZE_BYTES + 1024)
        self.assertFalse(valid)
        self.assertIn("exceeds 25 mb limit", err.lower())

        # Disallowed mime rejected
        valid, err = validate_audio_metadata("application/pdf", 1024)
        self.assertFalse(valid)
        self.assertIn("unsupported audio format", err.lower())

    def test_audio_extension_mapping(self):
        self.assertEqual(get_audio_extension_for_mime("audio/webm;codecs=opus"), ".webm")
        self.assertEqual(get_audio_extension_for_mime("audio/mp4"), ".mp4")
        self.assertEqual(get_audio_extension_for_mime("audio/m4a"), ".m4a")
        self.assertEqual(get_audio_extension_for_mime("audio/wav"), ".wav")
        self.assertEqual(get_audio_extension_for_mime("audio/ogg"), ".ogg")
        self.assertEqual(get_audio_extension_for_mime("audio/mpeg"), ".mp3")

    def test_storage_key_isolation(self):
        # Authenticated user
        user_key = build_audio_storage_key(
            audio_id="test-audio-123",
            content_type="audio/webm",
            user_id="user_abc_456"
        )
        self.assertEqual(user_key, "audio-temp/users/user_abc_456/test-audio-123/recording.webm")

        # Guest user
        guest_key = build_audio_storage_key(
            audio_id="test-audio-789",
            content_type="audio/mp4",
            guest_scope_id="guest_xyz_999"
        )
        self.assertEqual(guest_key, "audio-temp/guest/guest_xyz_999/test-audio-789/recording.mp4")

    # ---------------------------------------------------------------------------
    # 2. Smart Mode Prompt & Domain Vocabulary Tests
    # ---------------------------------------------------------------------------
    def test_smart_mode_prompt_assembly(self):
        prompt_ur = build_transcription_prompt("ur")
        self.assertIn("Pakistani Urdu script", prompt_ur)
        self.assertIn("DO NOT translate Urdu into English", prompt_ur)
        self.assertIn("SMART EDITING", prompt_ur)

        prompt_roman = build_transcription_prompt("roman-ur")
        self.assertIn("Preserve Urdu and English code-switching", prompt_roman)

        # Verify all 30 custom domain terms exist in the prompt
        for term in CUSTOM_DOMAIN_VOCABULARY:
            self.assertIn(term, prompt_roman, f"Missing domain term: {term}")

    # ---------------------------------------------------------------------------
    # 3. Urdu Script Detection & Transliteration
    # ---------------------------------------------------------------------------
    def test_urdu_script_detection(self):
        # Heavy Urdu text
        urdu_text = "میں ترکی کی اسکالرشپ کے لیے اپلائی کرنا چاہتا ہوں لیکن میرے فنانسز کمزور ہیں۔"
        self.assertTrue(has_significant_urdu_script(urdu_text))

        # Roman Urdu text
        roman_urdu_text = "Main Turkey ki scholarship ke liye apply karna chahta hoon lekin mere finances kamzor hain."
        self.assertFalse(has_significant_urdu_script(roman_urdu_text))

        # English text
        english_text = "I want to apply for a scholarship in Turkey but my finances are constrained."
        self.assertFalse(has_significant_urdu_script(english_text))

    @patch("agents.transcription.genai.Client")
    def test_roman_urdu_transliteration(self, mock_genai_client_class):
        mock_client = MagicMock()
        mock_genai_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = "Main Turkey jana chahta hoon."
        mock_client.models.generate_content.return_value = mock_response

        urdu_input = "میں ترکی جانا چاہتا ہوں۔ میں کیا کروں؟"
        result = transliterate_urdu_to_roman_urdu(urdu_input)
        self.assertEqual(result, "Main Turkey jana chahta hoon.")

    # ---------------------------------------------------------------------------
    # 4. Triple-Point Privacy Cleanup in transcribe_voice_note
    # ---------------------------------------------------------------------------
    @patch("agents.transcription.GCSStorageClient")
    @patch("agents.transcription.genai.Client")
    def test_triple_point_cleanup(self, mock_genai_client_class, mock_gcs_client_class):
        mock_gcs = MagicMock()
        mock_gcs_client_class.return_value = mock_gcs
        mock_gcs.verify_uploaded_object.return_value = (True, 5000, None)
        mock_gcs.download_bytes.return_value = b"fake-audio-bytes"

        mock_genai = MagicMock()
        mock_genai_client_class.return_value = mock_genai
        mock_file_ref = MagicMock()
        mock_file_ref.name = "files/temp-audio-resource-123"
        mock_genai.files.upload.return_value = mock_file_ref

        mock_gen_response = MagicMock()
        mock_gen_response.text = "Main software engineering mein admission lena chahta hoon."
        mock_genai.models.generate_content.return_value = mock_gen_response

        res = transcribe_voice_note(
            storage_key="audio-temp/guest/g1/a1/recording.webm",
            content_type="audio/webm;codecs=opus",
            language="roman-ur"
        )

        self.assertEqual(res["transcript"], "Main software engineering mein admission lena chahta hoon.")
        self.assertFalse(res["transliterated"])

        # 1. Gemini Files API cleanup verified
        mock_genai.files.delete.assert_called_once_with(name="files/temp-audio-resource-123")
        # 2. GCS temporary audio deletion verified
        mock_gcs.delete_object.assert_called_once_with("audio-temp/guest/g1/a1/recording.webm")
        _, upload_kwargs = mock_genai.files.upload.call_args
        self.assertEqual(upload_kwargs["config"].mime_type, "audio/webm")
        mock_genai.models.generate_content.assert_called_once_with(
            model="gemini-3.5-transcribe",
            contents=[mock_file_ref],
        )

    @patch("agents.transcription.GCSStorageClient")
    @patch("agents.transcription.genai.Client")
    def test_transcription_falls_back_to_general_audio_model(
        self, mock_genai_client_class, mock_gcs_client_class
    ):
        mock_gcs = MagicMock()
        mock_gcs_client_class.return_value = mock_gcs
        mock_gcs.verify_uploaded_object.return_value = (True, 5000, None)
        mock_gcs.download_bytes.return_value = b"fake-audio-bytes"

        mock_genai = MagicMock()
        mock_genai_client_class.return_value = mock_genai
        mock_file_ref = MagicMock()
        mock_file_ref.name = "files/fallback-audio"
        mock_genai.files.upload.return_value = mock_file_ref
        fallback_response = MagicMock(text="Fallback transcript works.")
        mock_genai.models.generate_content.side_effect = [
            RuntimeError("dedicated model rejected request"),
            fallback_response,
        ]

        result = transcribe_voice_note(
            storage_key="audio-temp/guest/g1/a2/recording.webm",
            content_type="audio/webm;codecs=opus",
            language="en",
        )

        self.assertEqual(result["transcript"], "Fallback transcript works.")
        self.assertEqual(mock_genai.models.generate_content.call_count, 2)
        _, fallback_kwargs = mock_genai.models.generate_content.call_args_list[1]
        self.assertEqual(fallback_kwargs["model"], "gemini-3.5-flash-lite")

    @patch("agents.transcription.GCSStorageClient")
    @patch("agents.transcription.genai.Client")
    def test_empty_transcript_is_reported_as_no_speech(
        self, mock_genai_client_class, mock_gcs_client_class
    ):
        mock_gcs = MagicMock()
        mock_gcs_client_class.return_value = mock_gcs
        mock_gcs.verify_uploaded_object.return_value = (True, 5000, None)
        mock_gcs.download_bytes.return_value = b"silent-audio"

        mock_genai = MagicMock()
        mock_genai_client_class.return_value = mock_genai
        mock_file_ref = MagicMock(name="files/silent-audio")
        mock_file_ref.name = "files/silent-audio"
        mock_genai.files.upload.return_value = mock_file_ref
        mock_genai.models.generate_content.return_value = MagicMock(text="")

        with self.assertRaises(NoSpeechDetectedError):
            transcribe_voice_note(
                storage_key="audio-temp/guest/g1/a3/recording.webm",
                content_type="audio/webm",
                language="en",
            )

        mock_gcs.delete_object.assert_called_once_with(
            "audio-temp/guest/g1/a3/recording.webm"
        )

    # ---------------------------------------------------------------------------
    # 5. FastAPI Endpoint Handlers (/audio/presign, /audio/{audio_id}/transcribe, DELETE)
    # ---------------------------------------------------------------------------
    def test_presign_audio_endpoint_guest(self):
        req = self.make_mock_request({
            "x-guest-scope-id": "guest_test_scope",
            "x-guest-scope-secret": "secret_123"
        })
        body = AudioPresignRequest(
            content_type="audio/webm",
            size_bytes=1024 * 200,
            duration_seconds=45.0,
            language_hint="roman-ur"
        )

        res = asyncio.run(presign_audio(request=req, body=body, current_user=None))
        self.assertEqual(res.upload_url, f"/audio/{res.audio_id}/upload")
        self.assertTrue(res.audio_id)
        self.assertTrue(res.gcs_key.startswith("audio-temp/guest/guest_test_scope/"))
        self.assertEqual(res.expires_in_seconds, 300)

    def test_presign_audio_endpoint_authenticated(self):
        req = self.make_mock_request()
        mock_user = MagicMock()
        mock_user.id = "user_456"

        body = AudioPresignRequest(
            content_type="audio/mp4",
            size_bytes=1024 * 500,
            duration_seconds=60.0,
            language_hint="ur"
        )

        res = asyncio.run(presign_audio(request=req, body=body, current_user=mock_user))
        self.assertTrue(res.gcs_key.startswith("audio-temp/users/user_456/"))

    def test_presign_audio_endpoint_rejects_oversized(self):
        req = self.make_mock_request()
        body = AudioPresignRequest(
            content_type="audio/webm",
            size_bytes=30 * 1024 * 1024,  # 30MB exceeds 25MB
            duration_seconds=30.0
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(presign_audio(request=req, body=body, current_user=None))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("exceeds 25 mb limit", ctx.exception.detail.lower())

    def test_presign_audio_endpoint_rejects_overlength(self):
        req = self.make_mock_request()
        body = AudioPresignRequest(
            content_type="audio/webm",
            size_bytes=1024 * 100,
            duration_seconds=950.0  # > 900s (15 min)
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(presign_audio(request=req, body=body, current_user=None))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("15-minute", ctx.exception.detail)

    def test_presign_audio_endpoint_rejects_unsupported_mime(self):
        req = self.make_mock_request()
        body = AudioPresignRequest(
            content_type="audio/flac",
            size_bytes=1024 * 100,
            duration_seconds=30.0
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(presign_audio(request=req, body=body, current_user=None))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("unsupported audio format", ctx.exception.detail.lower())

    @patch("tools.storage.storage_client.generate_signed_upload_url")
    def test_generate_v4_upload_signed_url_signature_and_kwargs(self, mock_client_signed_url):
        from tools.storage import generate_v4_upload_signed_url, generate_signed_upload_url
        mock_client_signed_url.return_value = "https://storage.googleapis.com/v4-signed-test"

        # Explicit kwargs as called by main.py
        url = generate_v4_upload_signed_url(
            object_name="audio-temp/test/recording.webm",
            content_type="audio/webm",
            expires_minutes=5,
        )
        self.assertEqual(url, "https://storage.googleapis.com/v4-signed-test")
        mock_client_signed_url.assert_called_with(
            storage_key="audio-temp/test/recording.webm",
            content_type="audio/webm",
            expires_minutes=5,
        )

        # Module-level generate_signed_upload_url also accepts expires_minutes
        url2 = generate_signed_upload_url(
            storage_key="users/123/file.pdf",
            content_type="application/pdf",
            expires_minutes=10,
        )
        self.assertEqual(url2, "https://storage.googleapis.com/v4-signed-test")
        mock_client_signed_url.assert_called_with(
            storage_key="users/123/file.pdf",
            content_type="application/pdf",
            expires_minutes=10,
        )

    def test_presign_audio_endpoint_uses_api_upload_route(self):
        req = self.make_mock_request({"x-guest-scope-id": "guest_err_test"})
        body = AudioPresignRequest(
            content_type="audio/webm",
            size_bytes=1024 * 100,
            duration_seconds=10.0
        )
        result = asyncio.run(presign_audio(request=req, body=body, current_user=None))
        self.assertEqual(result.upload_url, f"/audio/{result.audio_id}/upload")
        self.assertTrue(result.gcs_key.startswith("audio-temp/guest/guest_err_test/"))

    @patch("main.save_blob_bytes")
    def test_api_audio_upload_fallback(self, mock_save_blob):
        audio_id = "b6288ad8-c193-4d4b-b970-032f3cb4a693"
        audio_bytes = b"small-webm-recording"
        req = self.make_mock_request({
            "content-type": "audio/webm;codecs=opus",
            "content-length": str(len(audio_bytes)),
            "x-guest-scope-id": "guest_upload_scope",
            "x-guest-scope-secret": "secret_123",
        })
        req.body = AsyncMock(return_value=audio_bytes)

        result = asyncio.run(
            upload_audio_endpoint(request=req, audio_id=audio_id, current_user=None)
        )

        self.assertEqual(result["status"], "uploaded")
        mock_save_blob.assert_called_once_with(
            f"audio-temp/guest/guest_upload_scope/{audio_id}/recording.webm",
            audio_bytes,
            content_type="audio/webm;codecs=opus",
        )

    @patch("main.verify_uploaded_object")
    @patch("main.transcribe_voice_note")
    def test_transcribe_audio_endpoint_success(self, mock_transcribe, mock_verify):
        mock_verify.return_value = (True, 5000, None)
        mock_transcribe.return_value = {
            "transcript": "Mujhe freelancing shuru karni chahiye ya job karni chahiye?",
            "transliterated": False
        }

        req = self.make_mock_request({"x-guest-scope-id": "guest_111"})
        body = AudioTranscribeRequest(
            gcs_key="audio-temp/guest/guest_111/audio-777/recording.webm",
            content_type="audio/webm",
            language_hint="roman-ur"
        )

        res = asyncio.run(transcribe_audio_endpoint(
            request=req,
            audio_id="audio-777",
            body=body,
            current_user=None
        ))
        self.assertEqual(res.transcript, "Mujhe freelancing shuru karni chahiye ya job karni chahiye?")
        self.assertFalse(res.transliterated)

    @patch("main.delete_prefix")
    def test_delete_audio_endpoint(self, mock_delete_prefix):
        mock_delete_prefix.return_value = 1
        req = self.make_mock_request({"x-guest-scope-id": "guest_delete_test"})
        res = asyncio.run(delete_audio_endpoint(
            request=req,
            audio_id="audio-id-xyz",
            current_user=None
        ))
        self.assertEqual(res["status"], "deleted")
        self.assertEqual(res["audio_id"], "audio-id-xyz")
        mock_delete_prefix.assert_called_once_with("audio-temp/guest/guest_delete_test/audio-id-xyz/")


if __name__ == "__main__":
    unittest.main()
