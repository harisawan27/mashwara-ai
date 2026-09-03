import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=api_key)

# List all Gemma models
models = client.models.list()
for m in models:
    if "gemma" in m.name.lower():
        print(m.name)
