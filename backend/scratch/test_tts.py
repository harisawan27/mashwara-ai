import os
import sys
import wave
import io
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

print("Python version:", sys.version, flush=True)

# 1. Inspect types
speech_types = [x for x in dir(types) if any(k in x.lower() for k in ['speech', 'voice', 'audio'])]
print("Speech types in google.genai.types:", speech_types, flush=True)

client = genai.Client()

# 2. Check models matching tts
try:
    models = [m.name for m in client.models.list() if 'tts' in m.name.lower()]
    print("TTS models found:", models, flush=True)
except Exception as e:
    print("Error listing models:", e, flush=True)

# 3. Test generate_content with gemini-3.1-flash-tts-preview
test_text = "Hello, this is a test of Gemini TTS."

try:
    # Try different config structures
    print("\n--- Testing generate_content on gemini-3.1-flash-tts-preview ---", flush=True)
    # Check if speech_config exists
    speech_config = None
    if hasattr(types, "SpeechConfig"):
        print("types.SpeechConfig exists!", flush=True)
        if hasattr(types, "VoiceConfig"):
            print("types.VoiceConfig exists!", flush=True)
            voice_config = types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")
            )
            speech_config = types.SpeechConfig(voice_config=voice_config)
            print("Constructed speech_config:", speech_config, flush=True)

    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=speech_config,
    )
    
    response = client.models.generate_content(
        model="gemini-3.1-flash-tts-preview",
        contents=test_text,
        config=config,
    )
    print("Response received!", flush=True)
    for i, cand in enumerate(response.candidates):
        print(f"Candidate {i}:", flush=True)
        for j, part in enumerate(cand.content.parts):
            print(f"  Part {j}:", type(part), flush=True)
            if hasattr(part, "inline_data") and part.inline_data:
                print(f"    inline_data mime_type: {part.inline_data.mime_type}, data size: {len(part.inline_data.data or b'')} bytes", flush=True)
            if hasattr(part, "text") and part.text:
                print(f"    text: {part.text[:100]}", flush=True)

except Exception as e:
    print("Error calling gemini-3.1-flash-tts-preview:", e, flush=True)
