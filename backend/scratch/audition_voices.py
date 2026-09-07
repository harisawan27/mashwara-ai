import os
import sys
import wave
import io
import time
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

client = genai.Client()

CANDIDATE_VOICES = [
    "Charon",
    "Orus",
    "Iapetus",
    "Rasalgethi",
    "Alnilam",
    "Schedar",
    "Sadaltager"
]

PHRASES = {
    "en": "The council recommends keeping your current job for now while building a six-month emergency fund.",
    "ur": "کونسل کا متفقہ مشورہ یہ ہے کہ آپ فی الحال اپنی نوکری جاری رکھیں اور ساتھ ساتھ فری لانسنگ کریں۔",
    "roman_ur": (
        "Council ka overall mashwara yeh hai ke aap filhal job na chhorain. "
        "Freelancing income promising hai lekin 6 months ka emergency fund zaroori hai."
    )
}

output_dir = os.path.join(os.path.dirname(__file__), "audition_samples")
os.makedirs(output_dir, exist_ok=True)

def pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    with io.BytesIO() as wav_io:
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)
        return wav_io.getvalue()

print("Auditioning candidate voices...", flush=True)

results = {}

for voice in CANDIDATE_VOICES:
    print(f"\n================ Testing Voice: {voice} ================", flush=True)
    voice_results = {}
    
    for lang, phrase in PHRASES.items():
        start_t = time.time()
        try:
            # Build prompt with director instruction for roman_ur if applicable
            if lang == "roman_ur":
                content_text = (
                    "SYNTHESIZE SPEECH.\n"
                    "You are narrating the final executive summary from Mashwara AI.\n"
                    "VOICE STYLE: Calm, warm, professional adult male advisor.\n"
                    "LANGUAGE: The text is Pakistani Roman Urdu written in Latin script with English terms. "
                    "Pronounce the Urdu words naturally as Pakistani Urdu while preserving English technical terms.\n"
                    "DELIVERY: Moderate conversational pace. Do not add words.\n\n"
                    f"<<<SUMMARY_START>>>\n{phrase}\n<<<SUMMARY_END>>>"
                )
            else:
                content_text = phrase

            voice_cfg = types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
            )
            speech_cfg = types.SpeechConfig(voice_config=voice_cfg)
            config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=speech_cfg,
            )
            
            resp = client.models.generate_content(
                model="gemini-3.1-flash-tts-preview",
                contents=content_text,
                config=config,
            )
            
            latency = round(time.time() - start_t, 2)
            
            # Extract audio bytes
            audio_bytes = b""
            mime = ""
            for cand in resp.candidates:
                for part in cand.content.parts:
                    if hasattr(part, "inline_data") and part.inline_data:
                        audio_bytes = part.inline_data.data or b""
                        mime = part.inline_data.mime_type
                        break
            
            if audio_bytes:
                # Save wav
                wav_bytes = pcm_to_wav(audio_bytes)
                filename = f"{voice}_{lang}.wav"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(wav_bytes)
                voice_results[lang] = {
                    "status": "success",
                    "latency_sec": latency,
                    "pcm_bytes": len(audio_bytes),
                    "wav_bytes": len(wav_bytes),
                    "duration_sec": round(len(audio_bytes) / (24000 * 2), 2),
                    "file": filepath
                }
                print(f"  [{lang}] Success ({latency}s, duration: {voice_results[lang]['duration_sec']}s, file: {filename})", flush=True)
            else:
                voice_results[lang] = {"status": "no_audio", "latency_sec": latency}
                print(f"  [{lang}] No audio returned", flush=True)
                
        except Exception as e:
            voice_results[lang] = {"status": "error", "error": str(e)}
            print(f"  [{lang}] Error: {e}", flush=True)
            
    results[voice] = voice_results

print("\n\nAll candidate auditions complete! Summary:", flush=True)
for v, r in results.items():
    print(f"\nVoice: {v}")
    for lang, data in r.items():
        print(f"  {lang}: {data.get('status')} (latency: {data.get('latency_sec')}s, duration: {data.get('duration_sec')}s)")
