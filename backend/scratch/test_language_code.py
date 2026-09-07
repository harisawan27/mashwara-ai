import os
import sys
import wave
import io
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

client = genai.Client()

test_roman_urdu = (
    "Council ka overall mashwara yeh hai ke aap filhal job na chhorain. "
    "Aapki freelancing income promising hai lekin emergency fund kam az kam 6 months ka hona chahiye."
)

director_prompt = (
    "SYNTHESIZE SPEECH.\n"
    "You are narrating the final executive summary from Mashwara AI.\n"
    "VOICE STYLE: Calm, warm, professional adult male advisor.\n"
    "LANGUAGE: The text is Pakistani Roman Urdu written in Latin script with English terms. "
    "Pronounce the Urdu words naturally as Pakistani Urdu while preserving English technical terms.\n"
    "DELIVERY: Moderate conversational pace. Do not add words.\n\n"
    f"<<<SUMMARY_START>>>\n{test_roman_urdu}\n<<<SUMMARY_END>>>"
)

# Test 1: Without language_code
try:
    print("Testing WITHOUT language_code...", flush=True)
    voice_cfg = types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon"))
    speech_cfg = types.SpeechConfig(voice_config=voice_cfg)
    config = types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=speech_cfg)
    resp = client.models.generate_content(
        model="gemini-3.1-flash-tts-preview",
        contents=director_prompt,
        config=config,
    )
    print("Test 1 success! Candidates:", len(resp.candidates), flush=True)
except Exception as e:
    print("Test 1 error:", e, flush=True)

# Test 2: With language_code="ur"
try:
    print("\nTesting WITH language_code='ur'...", flush=True)
    voice_cfg = types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon"))
    speech_cfg = types.SpeechConfig(voice_config=voice_cfg, language_code="ur")
    config = types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=speech_cfg)
    resp = client.models.generate_content(
        model="gemini-3.1-flash-tts-preview",
        contents=director_prompt,
        config=config,
    )
    print("Test 2 success! Candidates:", len(resp.candidates), flush=True)
except Exception as e:
    print("Test 2 error:", e, flush=True)
