"""
Boardroom AI — Hugging Face Space Gradio & FastAPI Application
=============================================================
Unified entrypoint providing:
- High-end Gradio executive deliberation web interface (mounted at /)
- Full FastAPI REST & SSE API endpoints (/meeting, /chat/stream, /health, /docs)
- Google Gemini multi-agent decision engine
"""

import os
import sys
import json
import uuid
import asyncio
import re
import logging
from pathlib import Path
from typing import Dict, Any, AsyncGenerator

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Add backend directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Import backend modules
from templates.board_templates import TemplateType, TEMPLATE_METADATA
from agents import run_meeting, AgentStreamParser
from agents.board_config import get_board_config
from main import app as fastapi_app

import gradio as gr
from google import genai
import google.genai.types as genai_types

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("boardroom_gradio")

# ---------------------------------------------------------------------------
# Custom CSS for Executive Theme
# ---------------------------------------------------------------------------
CUSTOM_CSS = """
/* Executive Boardroom Styling */
:root {
    --primary-color: #6366f1;
    --primary-hover: #4f46e5;
    --bg-dark: #0f172a;
    --card-bg: #1e293b;
    --border-color: #334155;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
}

body, .gradio-container {
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
}

.board-header {
    text-align: center;
    padding: 1.5rem 1rem 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border-color);
}

.board-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
    margin-bottom: 0.5rem;
}

.board-title {
    font-size: 2.2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0.25rem 0;
    background: linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 50%, #c084fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.board-subtitle {
    font-size: 1.05rem;
    color: #94a3b8;
    max-width: 650px;
    margin: 0.5rem auto 0;
    line-height: 1.5;
}

/* Agent Card Styling */
.agent-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease, border-color 0.2s ease;
}

.agent-card:hover {
    border-color: #6366f1;
}

.vote-approved {
    background-color: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    font-weight: 700;
}

.vote-rejected {
    background-color: rgba(244, 63, 94, 0.15);
    color: #fb7185;
    border: 1px solid rgba(244, 63, 94, 0.3);
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    font-weight: 700;
}

.vote-conditional {
    background-color: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    font-weight: 700;
}

details.thinking-box {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    margin: 0.75rem 0;
    font-size: 0.875rem;
    color: #cbd5e1;
}

details.thinking-box summary {
    cursor: pointer;
    font-weight: 600;
    color: #a5b4fc;
    outline: none;
}

.executive-verdict {
    padding: 1.5rem;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%);
    border: 1px solid rgba(99, 102, 241, 0.3);
    margin: 1.5rem 0;
}
"""

# Template options formatted for Gradio dropdown
TEMPLATE_CHOICES = [
    ("🚀 Startup Board — Founders & Company Decisions", "STARTUP_BOARD"),
    ("👥 Hiring Board — Key Hires & Org Scaling", "HIRING_BOARD"),
    ("💼 Freelancer Board — Solopreneurs, Pricing & Clients", "FREELANCER_BOARD"),
    ("🎓 Student Board — Academic & Career Decisions", "STUDENT_BOARD"),
    ("📦 Product Board — Feature Prioritization & Architecture", "PRODUCT_BOARD"),
]

EXAMPLE_DECISIONS = [
    [
        "STARTUP_BOARD",
        "Should we pivot our B2C SaaS to Enterprise B2B?",
        "We have 15,000 free B2C users with high churn and $4,200 MRR. However, 3 enterprise companies contacted us wanting a team package with SOC2 compliance and SSO. Transition requires rewriting parts of auth and hiring a dedicated enterprise sales rep.",
        "seed",
        "$25,000",
        "6",
        "SaaS / Productivity",
        "Within 30 days"
    ],
    [
        "HIRING_BOARD",
        "Should we hire a VP of Engineering or 2 Senior Engineers?",
        "Our engineering team has grown to 10 engineers and the founder CTO is overwhelmed with architecture and management. We have $180k budget. Should we bring in an experienced VP to manage or two senior engineers to ship faster?",
        "series-a",
        "$180,000",
        "10",
        "FinTech",
        "2 weeks"
    ],
    [
        "PRODUCT_BOARD",
        "Should we rebuild our web app with Next.js or keep optimizing React SPA?",
        "Our current React SPA has SEO limitations and slow initial load on mobile. Rebuilding in Next.js would take 6 weeks of dedicated dev time, delaying the new billing features requested by customers.",
        "growth",
        "$0 (internal dev)",
        "8",
        "E-Commerce",
        "End of Quarter"
    ]
]


# ---------------------------------------------------------------------------
# Helper: Format Deliberation Markdown
# ---------------------------------------------------------------------------
def _format_deliberation_md(roles_info: list, agent_state: dict) -> str:
    """Renders all specialists' analyses, thinking accordions, and votes."""
    md_parts = []
    
    for role in roles_info:
        key = role["key"]
        data = agent_state.get(key, {})
        title = role["title"]
        name = role["name"]
        icon = role.get("icon", "👔")
        
        status = data.get("status", "waiting")
        text = data.get("text", "").strip()
        thinking = data.get("thinking", "").strip()
        vote = data.get("vote")
        conf = data.get("confidence")
        
        # Status icon
        if status == "thinking":
            badge = "🔄 *Deliberating...*"
        elif status == "done":
            badge = "✅ *Analysis Complete*"
        else:
            badge = "⏳ *In Queue*"
            
        md = f"### {icon} {title} (`{name}`) &nbsp; {badge}\n\n"
        
        # Thinking Process Collapsible
        if thinking:
            md += f"<details class='thinking-box'><summary>🧠 View Internal Chain of Thought ({len(thinking.split())} words)</summary>\n\n```\n{thinking}\n```\n</details>\n\n"
        
        # Main text
        if text:
            md += f"{text}\n\n"
        elif status == "waiting":
            md += "*Awaiting previous analyses to review and build upon...*\n\n"
        elif status == "thinking":
            md += "*Formulating expert analysis and calculating risk-adjusted vote...*\n\n"
            
        # Vote & Confidence pill if available
        if vote:
            vote_class = "vote-approved" if "APPROV" in str(vote).upper() else ("vote-rejected" if "REJECT" in str(vote).upper() else "vote-conditional")
            md += f"<span class='{vote_class}'>VOTE: {vote}</span> &nbsp; **Confidence:** `{conf or 50}%`\n\n"
            
        md += "---\n"
        md_parts.append(md)
        
    return "\n".join(md_parts)


def _format_report_md(report: dict) -> str:
    """Formats the synthesized executive report into beautiful markdown."""
    if not report:
        return ""
        
    final_decision = report.get("final_decision", "DEFER")
    conf = report.get("confidence_score", 50)
    summary = report.get("debate_summary", "")
    risks = report.get("key_risks", [])
    actions = report.get("recommended_actions", [])
    votes = report.get("board_votes", {})
    
    # Decision badge
    is_positive = "APPROV" in str(final_decision).upper()
    is_negative = "REJECT" in str(final_decision).upper()
    color = "🟢" if is_positive else ("🔴" if is_negative else "🟡")
    
    md = f"""
## 🏛️ Executive Boardroom Decision Report

<div class="executive-verdict">
    <h2 style="margin: 0 0 0.5rem 0; font-size: 1.6rem;">{color} Final Verdict: <strong>{final_decision}</strong></h2>
    <p style="margin: 0; font-size: 1.1rem;"><strong>Consensus Confidence Score:</strong> <code>{conf}%</code></p>
</div>

### 📋 Executive Summary
{summary}

### 🛡️ Critical Risks & Blind Spots Identified
"""
    for r in risks:
        md += f"- ⚠️ **Risk**: {r}\n"
        
    md += "\n### 🚀 Actionable Strategic Next Steps\n"
    for a in actions:
        md += f"- 🎯 {a}\n"
        
    if votes:
        md += "\n### 🗳️ Individual Board Member Voting Breakdown\n\n"
        md += "| Board Member | Vote | Confidence |\n| :--- | :---: | :---: |\n"
        for member, vdata in votes.items():
            if isinstance(vdata, dict):
                v_str = vdata.get("vote", "N/A")
                c_str = f"{vdata.get('confidence', 50)}%"
            else:
                v_str = str(vdata)
                c_str = "-"
            md += f"| **{member}** | `{v_str}` | {c_str} |\n"
            
    return md


# ---------------------------------------------------------------------------
# Gradio Handler: Convene Board Meeting
# ---------------------------------------------------------------------------
async def convene_board_meeting(
    template_key: str,
    decision_title: str,
    context_prompt: str,
    stage: str,
    budget: str,
    team_size: str,
    industry: str,
    deadline: str,
    api_key: str,
) -> AsyncGenerator[tuple[str, str, str], None]:
    """
    Executes the multi-agent board meeting and yields streaming markdown updates.
    """
    # 1. Handle API Key
    if api_key and api_key.strip():
        os.environ["GOOGLE_API_KEY"] = api_key.strip()
        os.environ["GEMINI_API_KEY"] = api_key.strip()
        
    active_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not active_key:
        err_msg = (
            "### ❌ Missing Gemini API Key\n\n"
            "Please provide a Google Gemini API Key in the **API Key** input box on the left, "
            "or set `GOOGLE_API_KEY` in your Hugging Face Space Secrets.\n\n"
            "You can obtain a free API key at [Google AI Studio](https://aistudio.google.com/apikey)."
        )
        yield "⚠️ Configuration required", err_msg, ""
        return

    if not decision_title.strip() or not context_prompt.strip():
        yield "⚠️ Missing input", "### ❌ Please provide both a Decision Title and Decision Context.", ""
        return

    # 2. Prepare meeting payload
    template_type = TemplateType(template_key)
    meeting_id = str(uuid.uuid4())
    
    # Construct full prompt incorporating parameters
    details = []
    if stage: details.append(f"Stage/Status: {stage}")
    if budget: details.append(f"Budget/Runway/Revenue: {budget}")
    if team_size: details.append(f"Team Size: {team_size}")
    if industry: details.append(f"Industry: {industry}")
    if deadline: details.append(f"Decision Deadline: {deadline}")
    
    details_block = ("\n".join([f"- {d}" for d in details])) if details else "None specified"
    
    full_prompt = f"""**Decision Title**: {decision_title}

**Context & Background**:
{context_prompt}

**Key Constraints & Parameters**:
{details_block}
"""
    
    status_banner = "⏳ **Convening Board Meeting... Initializing specialized agents.**"
    deliberation_md = "### 🏛️ Initializing Virtual Boardroom..."
    report_md = ""
    yield status_banner, deliberation_md, report_md
    
    # Initialize accumulator state
    roles_info = []
    agent_state = {}
    cancel_event = asyncio.Event()
    final_report = None
    
    try:
        async for chunk in run_meeting(
            meeting_id=meeting_id,
            template_type=template_type,
            fields={"prompt": full_prompt, "decision_title": decision_title},
            cancel_event=cancel_event,
        ):
            try:
                data = json.loads(chunk)
            except Exception:
                continue
                
            msg_type = data.get("type")
            
            if msg_type == "roles":
                roles_info = data.get("data", [])
                for r in roles_info:
                    agent_state[r["key"]] = {
                        "status": "waiting",
                        "text": "",
                        "thinking": "",
                        "vote": None,
                        "confidence": None
                    }
                deliberation_md = _format_deliberation_md(roles_info, agent_state)
                yield "👔 **Board members assembled.** Commencing multi-agent deliberation...", deliberation_md, ""
                
            elif msg_type == "status":
                agent = data.get("agent")
                if agent in agent_state:
                    agent_state[agent]["status"] = data.get("status", "thinking")
                deliberation_md = _format_deliberation_md(roles_info, agent_state)
                yield f"🔄 **{agent or 'Agent'} is reviewing proposal & synthesizing position...**", deliberation_md, ""
                
            elif msg_type == "chunk":
                agent = data.get("agent")
                if agent and agent in agent_state:
                    agent_state[agent]["text"] += data.get("text", "")
                    agent_state[agent]["status"] = "thinking"
                deliberation_md = _format_deliberation_md(roles_info, agent_state)
                yield f"⚡ **{agent or 'Agent'} speaking in boardroom...**", deliberation_md, ""
                
            elif msg_type == "thinking":
                agent = data.get("agent")
                if agent and agent in agent_state:
                    agent_state[agent]["thinking"] += data.get("text", "")
                deliberation_md = _format_deliberation_md(roles_info, agent_state)
                yield f"🧠 **{agent or 'Agent'} evaluating risks & probabilities...**", deliberation_md, ""
                
            elif msg_type == "final":
                agent = data.get("agent")
                if agent and agent in agent_state:
                    agent_state[agent]["text"] = data.get("text", "")
                    agent_state[agent]["thinking"] = data.get("thinking", "")
                    agent_state[agent]["status"] = "done"
                    
                    # Try to extract Vote & Confidence from final text
                    text = data.get("text", "")
                    vote_m = re.search(r"VOTE:\s*([A-Z\s]+)", text, re.IGNORECASE)
                    conf_m = re.search(r"CONFIDENCE:\s*(\d+)", text, re.IGNORECASE)
                    if vote_m:
                        agent_state[agent]["vote"] = vote_m.group(1).strip()
                    if conf_m:
                        agent_state[agent]["confidence"] = conf_m.group(1).strip()
                        
                deliberation_md = _format_deliberation_md(roles_info, agent_state)
                yield f"✅ **{agent} concluded their assessment.**", deliberation_md, ""
                
            elif msg_type == "report":
                final_report = data.get("data")
                report_md = _format_report_md(final_report)
                status_banner = "🎉 **Board Meeting Adjourned. Executive Report synthesized.**"
                yield status_banner, deliberation_md, report_md
                break
                
    except Exception as e:
        logger.error(f"Error during board meeting: {e}", exc_info=True)
        yield f"❌ **Meeting interrupted:** {str(e)}", deliberation_md, f"```\n{str(e)}\n```"
        return
        
    yield status_banner, deliberation_md, report_md


# ---------------------------------------------------------------------------
# Gradio Handler: Chief of Staff Chatbot
# ---------------------------------------------------------------------------
async def chief_of_staff_chat(
    message: str,
    history: list,
    api_key: str,
) -> AsyncGenerator[list, None]:
    """
    Streaming chat with the Chief of Staff agent.
    """
    if not message or not message.strip():
        yield history or []
        return

    if api_key and api_key.strip():
        os.environ["GOOGLE_API_KEY"] = api_key.strip()
        os.environ["GEMINI_API_KEY"] = api_key.strip()
        
    active_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not active_key:
        yield (history or []) + [[message, "❌ Please enter your Google Gemini API Key to chat with the Chief of Staff."]]
        return

    # Format history for Gemini
    system_prompt = (
        "You are the Chief of Staff to an ambitious founder or executive. "
        "Your role is to help them prepare proposals, identify blind spots, challenge assumptions, "
        "and brainstorm strategic decisions before convening the board. "
        "Be concise, highly analytical, constructive, and strategic."
    )
    
    contents = []
    if history:
        for turn in history:
            if isinstance(turn, (list, tuple)) and len(turn) >= 2:
                u, a = turn[0], turn[1]
                if u:
                    contents.append(genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=str(u))]))
                if a:
                    contents.append(genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=str(a))]))
            elif isinstance(turn, dict):
                r = "user" if turn.get("role") == "user" else "model"
                contents.append(genai_types.Content(role=r, parts=[genai_types.Part.from_text(text=str(turn.get("content", "")))]))
        
    contents.append(genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=message)]))
    
    client = genai.Client()
    new_history = list(history or []) + [[message, ""]]
    
    try:
        response_stream = await client.aio.models.generate_content_stream(
            model='gemini-2.5-flash',
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.7
            )
        )
        
        async for chunk in response_stream:
            if chunk.text:
                new_history[-1][1] += chunk.text
                yield new_history
                
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        new_history[-1][1] += f"\n\n*[Error: {e}]*"
        yield new_history


# ---------------------------------------------------------------------------
# Build Gradio Interface
# ---------------------------------------------------------------------------
def create_gradio_app() -> gr.Blocks:
    with gr.Blocks(title="Boardroom AI — Executive Decision Engine") as demo:
        # Injected Custom CSS
        gr.HTML(f"<style>{CUSTOM_CSS}</style>")
        # Header
        gr.HTML("""
        <div class="board-header">
            <span class="board-badge">Multi-Agent AI Executive Board</span>
            <h1 class="board-title">🏛️ Boardroom AI</h1>
            <p class="board-subtitle">
                The virtual executive team every founder deserves. Six specialized AI board members analyze, debate, 
                and vote on your high-stakes decisions with rigorous risk modeling.
            </p>
        </div>
        """)
        
        with gr.Tabs():
            # ---------------------------------------------------------------
            # Tab 1: Boardroom Deliberation
            # ---------------------------------------------------------------
            with gr.TabItem("🏛️ Virtual Boardroom", id="tab_boardroom"):
                with gr.Row():
                    # Left Column: Inputs
                    with gr.Column(scale=4):
                        gr.Markdown("### ⚙️ Executive Decision Brief")
                        
                        api_key_input = gr.Textbox(
                            label="Google Gemini API Key (Optional)",
                            placeholder="Defaults to Space Secret GOOGLE_API_KEY",
                            type="password",
                            info="Obtain free key from aistudio.google.com/apikey"
                        )
                        
                        template_dropdown = gr.Dropdown(
                            choices=TEMPLATE_CHOICES,
                            value="STARTUP_BOARD",
                            label="Select Board Template",
                            info="Tailors the specialist roster and analytical criteria to your context"
                        )
                        
                        decision_title_input = gr.Textbox(
                            label="Decision Title",
                            placeholder="e.g. Should we pivot our B2C SaaS to Enterprise B2B?",
                            lines=1,
                        )
                        
                        context_prompt_input = gr.Textbox(
                            label="Decision Context & Problem Statement",
                            placeholder="Describe your current situation, options considered, trade-offs, metrics, and goals...",
                            lines=5,
                        )
                        
                        with gr.Accordion("📊 Additional Parameters & Constraints", open=False):
                            with gr.Row():
                                stage_input = gr.Textbox(label="Company Stage", placeholder="e.g. seed, series-a, bootstrapped")
                                budget_input = gr.Textbox(label="Budget / Runway", placeholder="e.g. $50,000 / 12 months")
                            with gr.Row():
                                team_size_input = gr.Textbox(label="Team Size", placeholder="e.g. 8 engineers")
                                industry_input = gr.Textbox(label="Industry", placeholder="e.g. FinTech, B2B SaaS")
                            deadline_input = gr.Textbox(label="Decision Deadline", placeholder="e.g. End of Month")
                        
                        with gr.Row():
                            convene_btn = gr.Button("🚀 Convene Board Meeting", variant="primary", scale=2)
                            clear_btn = gr.Button("🔄 Clear Form", scale=1)
                            
                        gr.Markdown("#### 💡 Quick Example Scenarios")
                        gr.Examples(
                            examples=EXAMPLE_DECISIONS,
                            inputs=[
                                template_dropdown,
                                decision_title_input,
                                context_prompt_input,
                                stage_input,
                                budget_input,
                                team_size_input,
                                industry_input,
                                deadline_input,
                            ],
                            label="Click any example to load"
                        )

                    # Right Column: Live Boardroom & Report
                    with gr.Column(scale=6):
                        gr.Markdown("### 🎙️ Live Deliberation & Executive Verdict")
                        status_output = gr.Markdown("🟢 **Boardroom ready.** Enter your proposal and click *Convene Board Meeting*.")
                        
                        with gr.Tabs():
                            with gr.TabItem("📋 Executive Report & Verdict"):
                                report_output = gr.Markdown("*The final synthesized executive verdict, consensus vote, risks, and next steps will appear here upon completion.*")
                                
                            with gr.TabItem("👥 Specialists Deliberation"):
                                deliberation_output = gr.Markdown("*Specialist agents (CEO, CFO, CTO, CMO, Risk Officer, Devil's Advocate) will stream their analyses and internal reasoning here.*")

                # Connect convene button
                convene_btn.click(
                    fn=convene_board_meeting,
                    inputs=[
                        template_dropdown,
                        decision_title_input,
                        context_prompt_input,
                        stage_input,
                        budget_input,
                        team_size_input,
                        industry_input,
                        deadline_input,
                        api_key_input,
                    ],
                    outputs=[
                        status_output,
                        deliberation_output,
                        report_output,
                    ]
                )
                
                def clear_form():
                    return "", "", "", "", "", "", "", "🟢 **Boardroom ready.** Enter your proposal and click *Convene Board Meeting*.", "*Specialist analyses will appear here.*", "*Executive report will appear here.*"
                    
                clear_btn.click(
                    fn=clear_form,
                    outputs=[
                        decision_title_input,
                        context_prompt_input,
                        stage_input,
                        budget_input,
                        team_size_input,
                        industry_input,
                        deadline_input,
                        status_output,
                        deliberation_output,
                        report_output,
                    ]
                )

            # ---------------------------------------------------------------
            # Tab 2: Chief of Staff Chatbot
            # ---------------------------------------------------------------
            with gr.TabItem("💬 Chief of Staff Consultation", id="tab_cos"):
                gr.Markdown("""
                ### 🧑‍💼 Strategic Consultation with your Chief of Staff
                Brainstorm, test counter-arguments, and refine your pitch before calling a formal vote of the board.
                """)
                
                chatbot = gr.Chatbot(height=520)
                with gr.Row():
                    chat_msg = gr.Textbox(placeholder="Ask your Chief of Staff a question or paste an early idea...", scale=4, show_label=False)
                    chat_send = gr.Button("Send", variant="primary", scale=1)
                    
                chat_send.click(
                    fn=chief_of_staff_chat,
                    inputs=[chat_msg, chatbot, api_key_input],
                    outputs=[chatbot]
                ).then(lambda: "", outputs=[chat_msg])
                
                chat_msg.submit(
                    fn=chief_of_staff_chat,
                    inputs=[chat_msg, chatbot, api_key_input],
                    outputs=[chatbot]
                ).then(lambda: "", outputs=[chat_msg])

            # ---------------------------------------------------------------
            # Tab 3: API & Developer Documentation
            # ---------------------------------------------------------------
            with gr.TabItem("🔌 API & Integrations", id="tab_api"):
                gr.Markdown(f"""
                ### ⚡ Unified FastAPI Backend Inside Hugging Face Space
                This Hugging Face Space runs both the **Gradio Interactive UI** and the **FastAPI REST/SSE Backend** simultaneously on port `7860`.
                
                #### 🔗 Live Endpoints:
                - **Interactive Swagger Docs**: [`/docs`](file:///docs) or `https://<your-space-name>.hf.space/docs`
                - **System Health Check**: [`/health`](file:///health)
                - **Streaming Meeting Deliberation (SSE)**: `POST /chat/stream` or `POST /meeting`
                - **Chief of Staff Chat Stream**: `POST /chat/stream_message`
                
                #### 💻 cURL Example (Streaming Meeting):
                ```bash
                curl -N -X POST "https://harisawan07-mashwara-ai.hf.space/chat/stream" \\
                     -H "Content-Type: application/json" \\
                     -d '{{
                           "template": "STARTUP_BOARD",
                           "prompt": "Should we pivot our B2C app to B2B enterprise SaaS?"
                         }}'
                ```
                
                #### 🏗️ Architecture:
                - **Orchestration**: Sequential & Parallel agent pipelines built with Google ADK
                - **Intelligence**: Google Gemini 2.5/3.1 with multi-turn reasoning and chain-of-thought `<think>` tags
                - **Storage**: SQLAlchemy with graceful SQLite / PostgreSQL fallback
                """)

    return demo


# ---------------------------------------------------------------------------
# App Initialization & Mounting
# ---------------------------------------------------------------------------
demo_app = create_gradio_app()

# Mount Gradio onto the FastAPI application at root /
# This ensures that:
# 1. Visiting the Hugging Face Space in a browser renders the Gradio UI
# 2. API clients can call /meeting, /chat/stream, /health, /docs on the same host
app = gr.mount_gradio_app(fastapi_app, demo_app, path="/")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    logger.info(f"🏛️ Starting Boardroom AI Unified Gradio + FastAPI Server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
