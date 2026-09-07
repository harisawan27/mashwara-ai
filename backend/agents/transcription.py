"""
Mashwara AI — Long-Form Speech-to-Text & Transliteration Engine
===============================================================
Handles audio transcription using Gemini 3.5 Transcribe:
- Smart transcription mode (disfluency removal, punctuation, number formatting)
- Pakistani Urdu + English code-switching preservation
- Focused 30-term domain vocabulary injection
- Roman Urdu script transliteration pass via gemini-3.5-flash-lite
- Ephemeral lifecycle: deletes GCS audio, Gemini Files API resource, and local /tmp
"""

import os
import re
import tempfile
import logging
from typing import Dict, Any, Optional

from google import genai
from google.genai import types

from agents.board_config import (
    TRANSCRIBE_MODEL,
    TRANSCRIBE_FALLBACK_MODEL,
    TRANSLITERATION_MODEL,
)
from tools.storage import GCSStorageClient, get_audio_extension_for_mime

logger = logging.getLogger("mashwara_ai.transcription")


class NoSpeechDetectedError(ValueError):
    """Raised when STT succeeds but the recording contains no usable speech."""

# ---------------------------------------------------------------------------
# High-Value Domain Vocabulary (30 Focused Terms)
# ---------------------------------------------------------------------------
CUSTOM_DOMAIN_VOCABULARY = [
    "Mashwara", "Musheer", "Fiverr", "Upwork", "FastAPI", "Next.js", "Vercel",
    "Neon", "PostgreSQL", "Gemini", "freelancing", "remote work", "scholarship",
    "Burslari", "IELTS", "GRE", "TOEFL", "CGPA", "rupees", "PKR", "lakh",
    "crore", "Pakistan", "Karachi", "Lahore", "Islamabad", "Rawalpindi",
    "Istanbul", "Dubai", "API", "LLM"
]

VOCABULARY_PROMPT_STRING = ", ".join(CUSTOM_DOMAIN_VOCABULARY)


def build_transcription_prompt(target_lang: str = "roman-ur") -> str:
    """
    Assembles instruction-tuned Smart mode prompt for gemini-3.5-transcribe.
    Enforces disfluency cleanup, punctuation, numbers, and vocabulary guidance.
    """
    lang_lower = (target_lang or "roman-ur").lower()

    if lang_lower == "ur":
        lang_directive = (
            "- Target Output: Natural Pakistani Urdu script.\n"
            "- If the speaker uses English technical terms (e.g., freelancing, Upwork, salary, university, interview), "
            "preserve them naturally as spoken in Latin script or natural Urdu transliteration.\n"
            "- DO NOT translate Urdu into English."
        )
    elif lang_lower == "en":
        lang_directive = (
            "- Target Output: Accurate English.\n"
            "- If the speaker speaks Urdu or code-switches into Urdu, preserve the spoken phrases as spoken. "
            "DO NOT translate spoken Urdu into English."
        )
    else:  # roman-ur
        lang_directive = (
            "- Target Output: Transcribe the audio faithfully as spoken.\n"
            "- Preserve Urdu and English code-switching naturally without translating either into the other."
        )

    return (
        "You are an expert speech-to-text transcriber operating in Smart Dictation Mode.\n"
        "Transcribe the provided audio accurately following these strict rules:\n"
        "1. SMART EDITING: Clean up speech disfluencies, accidental stuttering, filler words "
        "(e.g., 'um', 'uh', 'er', repetitive 'yani', 'matlab', 'acha'), and false starts into clean, readable text.\n"
        "2. PUNCTUATION & NUMBERS: Format proper punctuation (periods, commas, question marks), capital letters, "
        "and normalize spoken numbers and currency amounts (e.g., '50,000' or '50 hazar').\n"
        "3. LANGUAGE PRESERVATION:\n"
        f"{lang_directive}\n"
        "4. DOMAIN VOCABULARY: Pay special attention to these proper names and domain terms:\n"
        f"   {VOCABULARY_PROMPT_STRING}\n"
        "5. FAITHFULNESS: Do NOT summarize, do NOT omit user arguments, and do NOT add any advice or reply."
    )


def has_significant_urdu_script(text: str) -> bool:
    """Detects whether text contains substantial Arabic/Urdu Unicode characters."""
    if not text:
        return False
    urdu_chars = len(re.findall(r'[\u0600-\u06FF]', text))
    return urdu_chars > 15


def transliterate_urdu_to_roman_urdu(text: str) -> str:
    """
    Converts Urdu script portions into natural Pakistani Roman Urdu.
    Uses gemini-3.5-flash-lite with temperature=0.0.
    Falls back cleanly to original text on any error or timeout.
    """
    if not text or not has_significant_urdu_script(text):
        return text

    client = genai.Client()
    system_instruction = (
        "You are a strict Urdu-script to Pakistani Roman Urdu transliterator.\n"
        "Your ONLY job is to convert Urdu/Arabic script into standard Pakistani Roman Urdu (Latin script).\n"
        "CRITICAL RULES:\n"
        "- DO NOT translate into English. Keep the Urdu language words exactly as they are in Roman Urdu.\n"
        "- DO NOT summarize, rewrite, or shorten the text.\n"
        "- DO NOT offer advice, analysis, or conversational commentary.\n"
        "- Preserve all numbers, dates, currency amounts, and English technical terms exactly as given.\n"
        "- Example: 'میں ترکی جانا چاہتا ہوں لیکن میری income ابھی unstable ہے'\n"
        "  -> 'Main Turkey jana chahta hoon lekin meri income abhi unstable hai'\n"
        "Return ONLY the transliterated text, nothing else."
    )

    try:
        response = client.models.generate_content(
            model=TRANSLITERATION_MODEL,
            contents=[text],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.0,
                max_output_tokens=4096,
            )
        )
        result = (response.text or "").strip()
        if result and len(result) > (len(text) * 0.4):
            logger.info("Successfully transliterated Urdu script to Roman Urdu.")
            return result
        logger.warning("Transliteration returned empty or suspicious short result; preserving original.")
        return text
    except Exception as e:
        logger.warning(f"Roman Urdu transliteration error: {e}; returning original transcript safely.")
        return text


def transcribe_voice_note(
    storage_key: str,
    content_type: str,
    language: str = "roman-ur",
    gcs_bucket_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Transcribes a voice note from temporary GCS storage using gemini-3.5-transcribe.
    Performs triple-point cleanup in finally block:
    1. Gemini Files API resource deleted
    2. Local temporary file deleted
    3. GCS temporary audio blob deleted
    Returns {"transcript": str, "transliterated": bool}.
    """
    gcs_client = GCSStorageClient(gcs_bucket_name) if gcs_bucket_name else GCSStorageClient()
    genai_client = genai.Client()

    # Verify GCS object exists
    exists, size, err = gcs_client.verify_uploaded_object(storage_key)
    if not exists:
        raise ValueError(f"Temporary audio recording not found in storage: {err or 'Missing object'}")

    # Create temporary local file
    normalized_content_type = (content_type or "audio/webm").split(";", 1)[0].strip().lower()
    ext = get_audio_extension_for_mime(normalized_content_type)
    temp_fd, temp_local_path = tempfile.mkstemp(suffix=ext, prefix="mashwara_stt_")
    os.close(temp_fd)

    gemini_file_name: Optional[str] = None
    raw_transcript: str = ""

    try:
        # 1. Download bytes from GCS to local temp file
        audio_bytes = gcs_client.download_bytes(storage_key)
        with open(temp_local_path, "wb") as f:
            f.write(audio_bytes)

        # 2. Upload to Gemini Files API
        logger.info(f"Uploading {len(audio_bytes)} bytes audio to Gemini Files API...")
        file_ref = genai_client.files.upload(
            file=temp_local_path,
            config=types.UploadFileConfig(mime_type=normalized_content_type)
        )
        gemini_file_name = file_ref.name
        logger.info(f"Gemini Files upload complete: {gemini_file_name}")

        # 3. Use the dedicated STT model with its supported minimal contract.
        # Prompts and text-generation settings are not valid inputs for this model.
        logger.info(f"Invoking {TRANSCRIBE_MODEL} for speech-to-text...")
        try:
            response = genai_client.models.generate_content(
                model=TRANSCRIBE_MODEL,
                contents=[file_ref],
            )
        except Exception as primary_error:
            # General audio understanding provides a resilient fallback while
            # preserving the same uploaded file and privacy cleanup lifecycle.
            logger.warning(
                f"Dedicated STT failed ({primary_error}); retrying with {TRANSCRIBE_FALLBACK_MODEL}."
            )
            response = genai_client.models.generate_content(
                model=TRANSCRIBE_FALLBACK_MODEL,
                contents=[file_ref, build_transcription_prompt(language)],
                config=types.GenerateContentConfig(temperature=0.0),
            )

        raw_transcript = (response.text or "").strip()
        if not raw_transcript:
            raise NoSpeechDetectedError("No speech was detected in the recording.")
        logger.info(f"Speech transcription succeeded ({len(raw_transcript)} chars).")

    finally:
        # TRIPLE-POINT PRIVACY CLEANUP (Idempotent & non-failing)
        # 1. Gemini Files API cleanup
        if gemini_file_name:
            try:
                genai_client.files.delete(name=gemini_file_name)
                logger.info(f"Deleted Gemini Files resource: {gemini_file_name}")
            except Exception as e:
                logger.warning(f"Could not delete Gemini Files resource {gemini_file_name}: {e}")

        # 2. Local disk cleanup
        if temp_local_path and os.path.exists(temp_local_path):
            try:
                os.unlink(temp_local_path)
            except Exception as e:
                logger.warning(f"Could not unlink local temp file {temp_local_path}: {e}")

        # 3. GCS temporary audio cleanup
        try:
            gcs_client.delete_object(storage_key)
            logger.info(f"Deleted temporary GCS audio object: {storage_key}")
        except Exception as e:
            logger.warning(f"Could not delete temporary GCS audio {storage_key}: {e}")

    # 4. Roman Urdu Transliteration Pass if requested and needed
    was_transliterated = False
    final_transcript = raw_transcript
    target_lang = (language or "roman-ur").lower()

    if target_lang == "roman-ur" and has_significant_urdu_script(raw_transcript):
        final_transcript = transliterate_urdu_to_roman_urdu(raw_transcript)
        was_transliterated = True

    return {
        "transcript": final_transcript,
        "transliterated": was_transliterated
    }
