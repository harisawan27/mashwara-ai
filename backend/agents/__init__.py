"""
Mashwara AI — Consultation Deliberation Pipeline Runner
======================================================
Native trilingual multi-agent orchestration for Urdu, Roman Urdu, and English:
- Full concurrency for Round 1 (all 6 specialists launch at T+0)
- Independent real-time streaming via SSE as tokens arrive
- Authoritative in-memory result collection
- Selective Round 2 (2-3 specialists with material disagreements; skipped if consensus)
- Lead Advisor final synthesis with immutable specialist votes
- Lightweight timing observability
"""

import json
import re
import time
import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple, AsyncGenerator

from google import genai
import google.genai.types as genai_types

from agents.board_config import (
    CONSULTATION_MODEL,
    SPECIALIST_MODEL,
    DELIBERATION_MODEL,
    LEAD_ADVISOR_MODEL,
    CHAT_MODEL,
    SEARCH_MODEL,
    FAST_SPECIALIST_MODEL,
    SPECIALIST_FALLBACK_MODEL,
    SPECIALIST_TOKENS,
    REBUTTAL_TOKENS,
    LEAD_ADVISOR_TOKENS,
    ROLE_METADATA,
    LEGACY_ROLE_MAP,
    get_council_roles,
    get_specialist_prompt,
    get_rebuttal_prompt,
    get_lead_advisor_prompt,
)
from agents.language_intelligence import (
    ConsultationContext,
    resolve_consultation_language,
    detect_consultation_domain,
)
from templates.board_templates import TemplateType

logger = logging.getLogger("mashwara_ai.agents")


# ---------------------------------------------------------------------------
# Thinking tag parser (preserved for backward compatibility with external callers)
# ---------------------------------------------------------------------------
class AgentStreamParser:
    def __init__(self):
        self.is_thinking = False
        self.buffer = ""

    def process_chunk(self, chunk: str):
        self.buffer += chunk
        start_markers = ["<think>", "<THINKING>", "**Reasoning:**", "Reasoning:", "**Thinking Process:**"]
        end_markers = ["</think>", "</THINKING>", "**Final Analysis:**", "Final Analysis:", "**Analysis:**"]

        while self.buffer:
            if not self.is_thinking:
                best_idx = -1
                best_len = 0
                for m in start_markers:
                    idx = self.buffer.find(m)
                    if idx != -1 and (best_idx == -1 or idx < best_idx):
                        best_idx = idx
                        best_len = len(m)

                if best_idx != -1:
                    before = self.buffer[:best_idx]
                    if before:
                        yield (False, before)
                    self.is_thinking = True
                    self.buffer = self.buffer[best_idx + best_len:]
                else:
                    yield (False, self.buffer)
                    self.buffer = ""
            else:
                best_idx = -1
                best_len = 0
                for m in end_markers:
                    idx = self.buffer.find(m)
                    if idx != -1 and (best_idx == -1 or idx < best_idx):
                        best_idx = idx
                        best_len = len(m)

                if best_idx != -1:
                    before = self.buffer[:best_idx]
                    if before:
                        yield (True, before)
                    self.is_thinking = False
                    self.buffer = self.buffer[best_idx + best_len:]
                else:
                    yield (True, self.buffer)
                    self.buffer = ""


# ---------------------------------------------------------------------------
# Output Extraction Helpers
# ---------------------------------------------------------------------------
def _normalize_position(raw_pos: Any) -> str:
    s = str(raw_pos or "").lower().strip()
    if any(w in s for w in ["support", "yes", "approve", "ha", "haan", "favor", "agree"]):
        return "support"
    if any(w in s for w in ["oppose", "no", "reject", "nahi", "nahin", "against", "disagree"]):
        return "oppose"
    return "uncertain"


def _extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    """Extracts a JSON object from markdown code blocks or text."""
    if not text:
        return None
    # 1. Try markdown fenced block
    matches = re.findall(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text, re.IGNORECASE)
    for m in reversed(matches):
        try:
            return json.loads(m)
        except Exception:
            continue

    # 2. Try outermost braces
    brace_match = re.search(r'\{[\s\S]*\}', text)
    if brace_match:
        try:
            return json.loads(brace_match.group())
        except Exception:
            pass

    return None


def parse_specialist_output(raw_text: str) -> Dict[str, Any]:
    """Parses Round 1 structured output from a specialist agent."""
    data = _extract_json_block(raw_text) or {}
    
    position = _normalize_position(data.get("position"))
    try:
        conf = int(data.get("confidence", 65))
        conf = max(0, min(100, conf))
    except (ValueError, TypeError):
        conf = 65

    rationale = data.get("rationale") or []
    if isinstance(rationale, str):
        rationale = [rationale]

    # Clean text to show in the UI card (strip raw JSON block if desired, or keep prose)
    clean_text = re.sub(r'```(?:json)?\s*\{[\s\S]*?\}\s*```', '', raw_text).strip()
    if not clean_text:
        clean_text = raw_text.strip()

    return {
        "position": position,
        "confidence": conf,
        "rationale": rationale,
        "key_concern": data.get("key_concern", ""),
        "assumptions": data.get("assumptions", []),
        "question_that_matters": data.get("question_that_matters", ""),
        "clean_text": clean_text,
        "full_text": raw_text,
    }


def parse_rebuttal_output(raw_text: str, fallback_position: str, fallback_conf: int) -> Dict[str, Any]:
    """Parses Round 2 rebuttal output."""
    data = _extract_json_block(raw_text) or {}
    
    final_pos = data.get("final_position") or data.get("position")
    final_pos = _normalize_position(final_pos) if final_pos else fallback_position

    try:
        final_conf = int(data.get("final_confidence") or data.get("confidence") or fallback_conf)
        final_conf = max(0, min(100, final_conf))
    except (ValueError, TypeError):
        final_conf = fallback_conf

    clean_text = re.sub(r'```(?:json)?\s*\{[\s\S]*?\}\s*```', '', raw_text).strip()
    if not clean_text:
        clean_text = raw_text.strip()

    return {
        "challenge_to": data.get("challenge_to", ""),
        "rebuttal": data.get("rebuttal", ""),
        "changed_mind_on": data.get("changed_mind_on", ""),
        "final_position": final_pos,
        "final_confidence": final_conf,
        "clean_text": clean_text,
        "full_text": raw_text,
    }


def select_rebuttal_specialists(round1_results: Dict[str, Dict[str, Any]]) -> List[str]:
    """
    Selects 2-3 specialists involved in the strongest relevant disagreement(s).
    If there is effectively unanimous agreement, returns [] to skip Round 2.
    """
    positions = {rk: res.get("position", "uncertain") for rk, res in round1_results.items()}
    
    supports = [rk for rk, pos in positions.items() if pos == "support"]
    opposes = [rk for rk, pos in positions.items() if pos == "oppose"]
    uncertains = [rk for rk, pos in positions.items() if pos == "uncertain"]

    # If consensus (all agree, or almost all agree with 0 opposition)
    if len(supports) >= 5 and not opposes:
        return []
    if len(opposes) >= 5 and not supports:
        return []

    selected: List[str] = []
    # Primary debate: supporters vs opposers
    if supports and opposes:
        top_supporter = max(supports, key=lambda k: round1_results[k].get("confidence", 50))
        top_opposer = max(opposes, key=lambda k: round1_results[k].get("confidence", 50))
        selected.extend([top_supporter, top_opposer])
        
        # 3rd participant: critical_challenger, financial_advisor, or an uncertain voice
        if "critical_challenger" in round1_results and "critical_challenger" not in selected:
            selected.append("critical_challenger")
        elif "financial_advisor" in round1_results and "financial_advisor" not in selected:
            selected.append("financial_advisor")
        elif uncertains:
            selected.append(uncertains[0])
    elif opposes and not supports:
        selected.extend(opposes[:2])
        if "critical_challenger" in round1_results and "critical_challenger" not in selected:
            selected.append("critical_challenger")
    elif supports and uncertains:
        selected.append(supports[0])
        selected.append(uncertains[0])
        if "critical_challenger" in round1_results and "critical_challenger" not in selected:
            selected.append("critical_challenger")
    else:
        for key in ["critical_challenger", "financial_advisor", "career_advisor"]:
            if key in round1_results and key not in selected:
                selected.append(key)
            if len(selected) >= 3:
                break

    return selected[:3]


# ---------------------------------------------------------------------------
# Consultation Deliberation Runner
# ---------------------------------------------------------------------------
async def run_meeting(
    meeting_id: str,
    template_type: TemplateType,
    fields: Dict[str, Any],
    cancel_event: Optional[asyncio.Event] = None,
) -> AsyncGenerator[str, None]:
    """
    Runs a full Mashwara AI consultation:
    1. Initializes ConsultationContext (authoritative language + domain selection)
    2. Emits localized roles event with exact locale metadata
    3. Round 1: Executes all 6 specialists FULLY CONCURRENTLY at T+0
    4. Round 2: Selects 2-3 specialists with material disagreement (or skips if consensus)
    5. Final Synthesis: Lead Advisor generates final report with immutable specialist votes
    """
    t_start = time.perf_counter()
    if cancel_event is None:
        cancel_event = asyncio.Event()

    client = genai.Client()
    user_prompt = fields.get("prompt", "").strip()
    frontend_lang = fields.get("language")

    # 1. Authoritative Language & Domain Resolution
    target_lang, detected_lang = resolve_consultation_language(frontend_lang, user_prompt)
    template_key = template_type.value if hasattr(template_type, "value") else str(template_type)
    domain, secondary_domains = detect_consultation_domain(user_prompt, template_hint=template_key)

    context = ConsultationContext(
        language=target_lang,
        detected_language=detected_lang,
        domain=domain,
        user_message=user_prompt,
        secondary_domains=secondary_domains,
        template_hint=template_key,
    )

    council_role_keys = get_council_roles(domain, secondary_domains=secondary_domains, user_text=user_prompt)

    # 2. Build and Emit Localized Roles Event
    roles_info = []
    for rk in council_role_keys:
        meta = ROLE_METADATA.get(rk, ROLE_METADATA["career_advisor"])
        lang_data = meta.get(target_lang, meta.get("en", {}))
        roles_info.append({
            "key": rk,
            "role_id": rk,
            "name": lang_data.get("name", rk),
            "title": lang_data.get("title", ""),
            "description": lang_data.get("description", ""),
            "icon": meta.get("icon", "👔"),
            "color": meta.get("color", "from-blue-500 to-blue-700"),
            "is_moderator": False,
        })

    # Lead Advisor / Moderator
    lead_meta = ROLE_METADATA["lead_advisor"]
    lead_lang = lead_meta.get(target_lang, lead_meta["en"])
    lead_role_info = {
        "key": "lead_advisor",
        "role_id": "lead_advisor",
        "name": lead_lang.get("name", "Lead Advisor"),
        "title": lead_lang.get("title", "Lead Advisor"),
        "description": lead_lang.get("description", ""),
        "icon": lead_meta.get("icon", "⚖️"),
        "color": lead_meta.get("color", "from-indigo-500 to-indigo-700"),
        "is_moderator": True,
    }
    roles_info.append(lead_role_info)

    yield json.dumps({"type": "roles", "data": roles_info})

    # Queue for streaming chunks and status messages
    queue: asyncio.Queue = asyncio.Queue()

    # -----------------------------------------------------------------------
    # Specialist Execution Helper (with short bounded retries)
    # -----------------------------------------------------------------------
    async def call_specialist_stream(role_key: str, prompt: str, system_inst: str, model_id: str, max_tokens: int) -> str:
        max_retries = 2
        for attempt in range(max_retries + 1):
            if cancel_event.is_set():
                return ""
            try:
                contents = [genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=prompt)])]
                stream = await client.aio.models.generate_content_stream(
                    model=model_id,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=system_inst,
                        temperature=0.6,
                        max_output_tokens=max_tokens,
                    )
                )

                full_text = ""
                async for chunk in stream:
                    if cancel_event.is_set():
                        break
                    if chunk.text:
                        full_text += chunk.text
                        await queue.put({"type": "chunk", "agent": role_key, "text": chunk.text})

                return full_text

            except Exception as e:
                logger.warning(f"Error calling {role_key} on {model_id} (attempt {attempt+1}/{max_retries+1}): {e}")
                if attempt < max_retries and not cancel_event.is_set():
                    await asyncio.sleep(1.0 * (attempt + 1))
                else:
                    logger.error(f"Specialist {role_key} permanently failed: {e}")
                    fallback_msg = f"*[Mashir unavailable: {e}]*"
                    await queue.put({"type": "chunk", "agent": role_key, "text": fallback_msg})
                    return fallback_msg

        return ""

    # -----------------------------------------------------------------------
    # ROUND 1: All 6 Specialists Launch FULLY CONCURRENTLY at T+0
    # -----------------------------------------------------------------------
    t_r1_start = time.perf_counter()
    logger.info(f"[Mashwara] Starting Round 1: 6 concurrent specialists on {SPECIALIST_MODEL} | meeting={meeting_id}")

    # Emit initial status for all 6 specialists
    for rk in council_role_keys:
        await queue.put({"type": "status", "agent": rk, "status": "thinking", "message": ""})

    async def run_single_specialist_round1(rk: str) -> Tuple[str, Dict[str, Any]]:
        sys_prompt = get_specialist_prompt(rk, target_lang)
        user_msg = f"Mashwara Request:\n{user_prompt}\n\nProvide your independent assessment and structured JSON."
        raw_text = await call_specialist_stream(rk, user_msg, sys_prompt, SPECIALIST_MODEL, SPECIALIST_TOKENS)
        parsed = parse_specialist_output(raw_text)

        await queue.put({
            "type": "final",
            "agent": rk,
            "text": parsed["clean_text"],
            "thinking": f"Status: {parsed['position'].upper()} (Confidence: {parsed['confidence']}%)"
        })
        await queue.put({"type": "status", "agent": rk, "status": "done", "message": ""})
        return rk, parsed

    # Launch all 6 concurrently without delay or staggering
    r1_tasks = [asyncio.create_task(run_single_specialist_round1(rk)) for rk in council_role_keys]

    # Concurrent Consumer Loop for streaming events while Round 1 executes
    completed_r1 = 0
    round1_results: Dict[str, Dict[str, Any]] = {}

    async def r1_stream_consumer():
        nonlocal completed_r1
        while completed_r1 < len(council_role_keys) and not cancel_event.is_set():
            try:
                evt = await asyncio.wait_for(queue.get(), timeout=90.0)
            except asyncio.TimeoutError:
                break
            if evt.get("type") == "status" and evt.get("status") == "done":
                completed_r1 += 1
            yield json.dumps(evt)

    async for evt_json in r1_stream_consumer():
        yield evt_json

    # Await all task results safely
    r1_raw_results = await asyncio.gather(*r1_tasks, return_exceptions=True)
    for res in r1_raw_results:
        if isinstance(res, tuple) and len(res) == 2:
            rk, parsed = res
            round1_results[rk] = parsed
        elif isinstance(res, Exception):
            logger.error(f"Round 1 task exception: {res}")

    t_r1_duration = time.perf_counter() - t_r1_start
    logger.info(f"[Mashwara] Round 1 completed in {t_r1_duration:.2f}s | Results: {len(round1_results)}")

    if cancel_event.is_set():
        return

    # -----------------------------------------------------------------------
    # ROUND 2: Selective Deliberation & Rebuttal (2-3 specialists or skipped)
    # -----------------------------------------------------------------------
    t_r2_start = time.perf_counter()
    rebuttal_keys = select_rebuttal_specialists(round1_results)
    final_votes: Dict[str, Dict[str, Any]] = {}

    # Initialize final votes with Round 1 positions
    for rk, r1 in round1_results.items():
        vote_token = "YES" if r1["position"] == "support" else ("NO" if r1["position"] == "oppose" else "DEFER")
        final_votes[rk] = {
            "vote": vote_token,
            "confidence": r1["confidence"],
            "position": r1["position"],
        }

    round2_rebuttals: Dict[str, Dict[str, Any]] = {}

    if rebuttal_keys and not cancel_event.is_set():
        logger.info(f"[Mashwara] Starting Round 2 Deliberation with {len(rebuttal_keys)} specialists: {rebuttal_keys} on {DELIBERATION_MODEL}")
        
        # Build compact digest of Round 1
        digest_lines = []
        for rk, r1 in round1_results.items():
            name = ROLE_METADATA.get(rk, {}).get(target_lang, {}).get("name", rk)
            digest_lines.append(f"- {name} ({rk}): {r1['position'].upper()} ({r1['confidence']}%) | Concern: {r1.get('key_concern', 'None')}")
        peer_summary = "\n".join(digest_lines)

        for rk in rebuttal_keys:
            await queue.put({
                "type": "status",
                "agent": rk,
                "status": "thinking",
                "message": "🔄 Deliberating with colleagues..." if target_lang != "ur" else "🔄 ساتھی مشیروں کے دلائل کا جائزہ لے رہے ہیں..."
            })

        async def run_single_rebuttal(rk: str) -> Tuple[str, Dict[str, Any]]:
            reb_prompt = get_rebuttal_prompt(rk, target_lang, peer_summary)
            user_msg = f"User situation:\n{user_prompt}\n\nPresent your rebuttal and final revised position."
            raw_text = await call_specialist_stream(rk, user_msg, reb_prompt, DELIBERATION_MODEL, REBUTTAL_TOKENS)
            r1_orig = round1_results.get(rk, {})
            parsed = parse_rebuttal_output(raw_text, r1_orig.get("position", "uncertain"), r1_orig.get("confidence", 65))

            # Update final vote for participating specialist
            vote_tok = "YES" if parsed["final_position"] == "support" else ("NO" if parsed["final_position"] == "oppose" else "DEFER")
            final_votes[rk] = {
                "vote": vote_tok,
                "confidence": parsed["final_confidence"],
                "position": parsed["final_position"],
            }

            await queue.put({
                "type": "final",
                "agent": rk,
                "text": f"{round1_results.get(rk, {}).get('clean_text', '')}\n\n**Rebuttal / Final View:**\n{parsed['clean_text']}",
                "thinking": f"Revised: {parsed['final_position'].upper()} ({parsed['final_confidence']}%)"
            })
            await queue.put({"type": "status", "agent": rk, "status": "done", "message": ""})
            return rk, parsed

        # Execute selected rebuttal specialists CONCURRENTLY
        r2_tasks = [asyncio.create_task(run_single_rebuttal(rk)) for rk in rebuttal_keys]
        completed_r2 = 0

        async def r2_stream_consumer():
            nonlocal completed_r2
            while completed_r2 < len(rebuttal_keys) and not cancel_event.is_set():
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=60.0)
                except asyncio.TimeoutError:
                    break
                if evt.get("type") == "status" and evt.get("status") == "done":
                    completed_r2 += 1
                yield json.dumps(evt)

        async for evt_json in r2_stream_consumer():
            yield evt_json

        r2_raw_results = await asyncio.gather(*r2_tasks, return_exceptions=True)
        for res in r2_raw_results:
            if isinstance(res, tuple) and len(res) == 2:
                rk, parsed = res
                round2_rebuttals[rk] = parsed
            elif isinstance(res, Exception):
                logger.error(f"Round 2 task exception: {res}")

        t_r2_duration = time.perf_counter() - t_r2_start
        logger.info(f"[Mashwara] Round 2 completed in {t_r2_duration:.2f}s")
    else:
        logger.info(f"[Mashwara] Round 2 skipped (consensus or empty rebuttal list).")
        t_r2_duration = 0.0

    if cancel_event.is_set():
        return

    # -----------------------------------------------------------------------
    # LEAD ADVISOR: Final Synthesis with Immutable Specialist Votes
    # -----------------------------------------------------------------------
    t_mod_start = time.perf_counter()
    logger.info(f"[Mashwara] Starting Lead Advisor synthesis on {LEAD_ADVISOR_MODEL}")

    await queue.put({
        "type": "status",
        "agent": "lead_advisor",
        "status": "thinking",
        "message": "⚖️ Synthesizing final consultation..." if target_lang != "ur" else "⚖️ حتمی مشاورتی رپورٹ مرتب ہو رہی ہے..."
    })

    # Build immutable specialist vote summary
    vote_summary_lines = []
    for rk, vdata in final_votes.items():
        name = ROLE_METADATA.get(rk, {}).get(target_lang, {}).get("name", rk)
        vote_summary_lines.append(f"- {name} ({rk}): Vote={vdata['vote']} (Confidence: {vdata['confidence']}%)")
    immutable_votes_summary = "\n".join(vote_summary_lines)

    # Lead Advisor prompt
    mod_sys_prompt = get_lead_advisor_prompt(target_lang, immutable_votes_summary)
    
    # Contextual synthesis user message
    mod_user_msg = f"""User Decision Request:
{user_prompt}

Specialist Analyses (Round 1):
"""
    for rk, r1 in round1_results.items():
        name = ROLE_METADATA.get(rk, {}).get(target_lang, {}).get("name", rk)
        mod_user_msg += f"\n--- {name} ({rk}) ---\n{r1['clean_text']}\n"

    if round2_rebuttals:
        mod_user_msg += "\nRound 2 Deliberation & Rebuttals:\n"
        for rk, r2 in round2_rebuttals.items():
            name = ROLE_METADATA.get(rk, {}).get(target_lang, {}).get("name", rk)
            mod_user_msg += f"\n--- {name} ({rk}) ---\n{r2['clean_text']}\n"

    mod_user_msg += "\nSynthesize the final Mashwara report strictly respecting the specialist votes."

    mod_full_text = await call_specialist_stream("lead_advisor", mod_user_msg, mod_sys_prompt, LEAD_ADVISOR_MODEL, LEAD_ADVISOR_TOKENS)
    await queue.put({"type": "status", "agent": "lead_advisor", "status": "done", "message": ""})

    t_mod_duration = time.perf_counter() - t_mod_start
    t_total = time.perf_counter() - t_start

    logger.info(f"[Mashwara Timing] meeting={meeting_id} lang={target_lang} domain={domain} | r1: {t_r1_duration:.2f}s | r2: {t_r2_duration:.2f}s | lead_advisor: {t_mod_duration:.2f}s | total: {t_total:.2f}s")

    # Parse and structure the final report
    parsed_report = _extract_json_block(mod_full_text) or {}
    
    final_decision = parsed_report.get("final_decision", "APPROVE")
    if "APPROV" in str(final_decision).upper() or "YES" in str(final_decision).upper():
        final_decision = "APPROVE"
    elif "REJECT" in str(final_decision).upper() or "NO" in str(final_decision).upper():
        final_decision = "REJECT"
    else:
        final_decision = "DEFER"

    try:
        conf_score = int(parsed_report.get("confidence_score", 70))
    except Exception:
        conf_score = 70

    report_dict = {
        "meeting_id": meeting_id,
        "template": template_key,
        "decision_title": fields.get("decision_title", "Mashwara Consultation"),
        "final_decision": final_decision,
        "confidence_score": conf_score,
        "board_votes": final_votes,
        "debate_summary": parsed_report.get("debate_summary", mod_full_text),
        "key_risks": parsed_report.get("key_risks", ["Evaluate unexpected cash flow or workload friction."]),
        "recommended_actions": parsed_report.get("recommended_actions", ["Proceed with a 30-day testing milestone."]),
    }

    yield json.dumps({"type": "report", "data": report_dict})
    yield json.dumps({"type": "done"})


# ---------------------------------------------------------------------------
# Output Parser Function for Legacy Callers
# ---------------------------------------------------------------------------
def _parse_moderator_output(
    raw_output: str,
    meeting_id: str,
    template_type: TemplateType,
    decision_title: str,
    config: dict,
) -> Dict[str, Any]:
    """Parse moderator output with legacy compatibility."""
    parsed = _extract_json_block(raw_output) or {}
    template_key = template_type.value if hasattr(template_type, "value") else str(template_type)

    default_votes = {}
    for role in config.get("roles", []):
        default_votes[role["key"]] = {"vote": "DEFER", "confidence": 50}

    return {
        "meeting_id": meeting_id,
        "template": template_key,
        "decision_title": decision_title,
        "final_decision": parsed.get("final_decision", "DEFER"),
        "confidence_score": parsed.get("confidence_score", 50),
        "board_votes": parsed.get("board_votes", default_votes),
        "key_risks": parsed.get("key_risks", ["Unable to complete full risk analysis."]),
        "recommended_actions": parsed.get("recommended_actions", ["Review proposal with additional context."]),
        "debate_summary": parsed.get("debate_summary", raw_output[:1000]),
    }
