"""
Boardroom AI — Agent Factory
==============================
Dynamic agent creation from board_config.py templates.
One function creates any agent. No hardcoded agent files needed.
"""

import logging
from typing import List, Tuple

from google.adk.agents import LlmAgent
from google.adk.agents.parallel_agent import ParallelAgent
from google.adk.agents.sequential_agent import SequentialAgent
from google.genai import types

from agents.board_config import get_board_config

logger = logging.getLogger("boardroom_ai.factory")


def create_agent(role_config: dict) -> LlmAgent:
    """
    Create a single LlmAgent from a role configuration dict.
    This is the core factory function — one function to build any agent.
    """
    return LlmAgent(
        name=role_config["name"],
        model=role_config["model"],
        instruction=role_config["prompt"],
        description=f'{role_config["title"]} — {role_config["key"]}',
        output_key=f'{role_config["key"].lower()}_analysis',
        generate_content_config=types.GenerateContentConfig(
            max_output_tokens=role_config.get("tokens", 300),
            temperature=role_config.get("temperature", 0.7),
        ),
    )


def build_board(template_key: str) -> SequentialAgent:
    """
    Build the full board meeting pipeline for a given template.

    Architecture:
      SequentialAgent(
        1. ParallelAgent(6 specialists)  — all run concurrently
        2. ModeratorAgent                — synthesizes + final verdict
      )

    No planner — the user's raw prompt goes directly to the specialists.
    """
    config = get_board_config(template_key)

    # Create all 6 specialist agents from config
    specialists = [create_agent(role) for role in config["roles"]]

    # Create the moderator agent
    moderator = create_agent(config["moderator"])

    # Assemble the parallel specialist panel
    specialist_panel = ParallelAgent(
        name="SpecialistPanel",
        sub_agents=specialists,
        description=f'All 6 {config["name"]} specialists analyze concurrently',
    )

    # Assemble the full pipeline: Parallel Specialists → Moderator
    pipeline = SequentialAgent(
        name="BoardroomPipeline",
        sub_agents=[specialist_panel, moderator],
        description=f'{config["name"]}: Analyze (parallel) → Moderate',
    )

    logger.info(f"Board pipeline built: {config['name']} ({len(specialists)} specialists + moderator)")
    return pipeline
