import asyncio
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types
import google.adk.models.registry as r
from google.adk.models.google_llm import Gemini
r.LLMRegistry._register(r'gemma-4.*', Gemini)


agent = LlmAgent(
    name="TestAgent",
    model="gemma-4-31b-it", # Or models/gemma-4-31b-it
    instruction="You are a helpful assistant.",
    generate_content_config=types.GenerateContentConfig(
        max_output_tokens=100,
        temperature=0.7,
    ),
)

async def main():
    runner = InMemoryRunner(agent=agent)
    runner.auto_create_session = True
    try:
        async for event in runner.run_async(
            user_id="user1",
            session_id="session1",
            new_message=types.Content(
                role="user",
                parts=[types.Part.from_text(text="Hello!")]
            )
        ):
            print("Event:", getattr(event, "author", None), event)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
