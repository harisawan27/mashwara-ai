"""
Boardroom AI — MCP Web Search Tool
====================================
Implements a local MCP (Model Context Protocol) server that exposes a
web_search tool. This allows board agents to pull live market data,
industry trends, salary benchmarks, and other real-time information
during their analysis.

The server uses FastMCP and is connected to agents via StdioServerParameters.
Search is powered by httpx requests to a public search endpoint.
"""

import os
import json
import httpx
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Initialize the MCP server
# ---------------------------------------------------------------------------
mcp = FastMCP(
    name="boardroom_web_search",
    instructions="Provides web search capabilities for board meeting agents to research market data, trends, and benchmarks.",
)


# ---------------------------------------------------------------------------
# Web Search Tool
# ---------------------------------------------------------------------------
@mcp.tool()
async def web_search(query: str) -> str:
    """
    Search the web for real-time information relevant to a business decision.

    Use this tool to find:
    - Current market conditions and trends
    - Industry benchmarks and statistics
    - Salary data and compensation benchmarks
    - Competitor information
    - Financial data and projections
    - Technology trends and adoption rates

    Args:
        query: The search query string. Be specific and include relevant
               context (e.g., "average SaaS startup runway 2026" rather
               than just "startup runway").

    Returns:
        A summary of search results with relevant information.
    """
    try:
        # Use Google's Generative AI grounding via google-genai if available,
        # otherwise fall back to a basic web request approach
        results = await _perform_search(query)
        return results
    except Exception as e:
        return f"Web search encountered an error: {str(e)}. Proceeding with analysis based on existing knowledge."


async def _perform_search(query: str) -> str:
    """
    Perform a web search using httpx. This is a lightweight implementation
    that queries a public search API endpoint.

    In production, this can be swapped for Google Custom Search API,
    Serper, Tavily, or any other search provider.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Use Google's search grounding via the Gemini API
            # This leverages the google-genai SDK for grounded search
            api_key = os.getenv("GOOGLE_API_KEY", "")

            if api_key:
                # Use Gemini's grounding with Google Search
                response = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
                    params={"key": api_key},
                    json={
                        "contents": [
                            {
                                "parts": [
                                    {
                                        "text": f"Search for and summarize the latest information about: {query}. "
                                        f"Provide specific data points, statistics, and facts. "
                                        f"Focus on information that would be useful for business decision-making."
                                    }
                                ]
                            }
                        ],
                        "tools": [{"google_search": {}}],
                    },
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code == 200:
                    data = response.json()
                    # Extract text from the response
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        texts = [p.get("text", "") for p in parts if "text" in p]
                        if texts:
                            return f"Web Search Results for '{query}':\n\n" + "\n".join(texts)

            # Fallback: return a message indicating search was attempted
            return (
                f"Web search for '{query}' was attempted but no results were retrieved. "
                f"Please proceed with your analysis using your existing knowledge and training data."
            )

    except httpx.TimeoutException:
        return f"Web search for '{query}' timed out. Proceeding with existing knowledge."
    except Exception as e:
        return f"Web search error: {str(e)}. Proceeding with existing knowledge."


# ---------------------------------------------------------------------------
# Run the MCP server (invoked as a subprocess via StdioServerParameters)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    mcp.run(transport="stdio")
