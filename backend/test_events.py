import asyncio
from google.genai import types
from google.adk.runners import InMemoryRunner
import os
from dotenv import load_dotenv

load_dotenv()

from agents import create_board_pipeline

async def test():
    pipeline = create_board_pipeline()
    runner = InMemoryRunner(agent=pipeline)
    runner.auto_create_session = True
    
    async for event in runner.run_async(
        user_id="test",
        session_id="test",
        new_message=types.Content(role="user", parts=[types.Part.from_text(text="hello")]),
    ):
        print("Type:", type(event))
        print("Dir:", dir(event))
        if hasattr(event, "author"):
            print("author:", event.author)
        else:
            print("NO author!")
        break

if __name__ == "__main__":
    asyncio.run(test())
