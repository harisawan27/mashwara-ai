"""
Mashwara AI — Structured Decision Router & Council Orchestration
================================================================
Intelligent Auto/Open routing layer for free-form and preset Mashwara decisions.
Understands user dilemmas across dimensions, selects the 6 most relevant expert
perspectives from the global role pool, and generates at most 2 validated contextual
dynamic roles when a genuine expertise gap exists.
Pure functional module with deterministic fallback and zero database dependencies.
"""

import os
import json
import re
import time
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Tuple

from google import genai
import google.genai.types as genai_types

from agents.board_config import (
    ROUTER_MODEL,
    ROLE_METADATA,
    get_council_roles,
)
from agents.language_intelligence import (
    detect_consultation_domain,
)

logger = logging.getLogger("mashwara_ai.router")

# Safe allowlists for dynamic roles
SAFE_ICONS = {"🛡️", "🏡", "🌾", "📦", "⚖️", "🧭", "🚗", "🏗️", "📋", "🤝", "🌐", "🔍", "⚡", "💡", "🎯", "👥", "💰", "📈", "⚙️"}
DEFAULT_ICON = "🛡️"

SAFE_GRADIENTS = {
    "from-slate-500 to-slate-700",
    "from-cyan-500 to-cyan-700",
    "from-teal-500 to-teal-700",
    "from-amber-500 to-amber-700",
    "from-violet-500 to-violet-700",
    "from-emerald-500 to-emerald-700",
    "from-blue-500 to-blue-700",
    "from-indigo-500 to-indigo-700",
    "from-rose-500 to-rose-700",
    "from-pink-500 to-pink-700",
}
DEFAULT_GRADIENT = "from-slate-500 to-slate-700"

# Available global specialist roles (excluding internal lead_advisor)
GLOBAL_SPECIALIST_ROLES = [rk for rk in ROLE_METADATA.keys() if rk != "lead_advisor"]


@dataclass
class RoutingResult:
    """Structured, validated decision routing output."""
    selected_roles: List[str]
    dynamic_role_defs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    primary_dimension: str = "career"
    secondary_dimensions: List[str] = field(default_factory=list)
    decision_type: str = "general decision"
    stakes: List[str] = field(default_factory=list)
    expertise_needed: List[str] = field(default_factory=list)
    is_fallback: bool = False
    fallback_reason: Optional[str] = None
    routing_duration_ms: float = 0.0


def _build_router_system_prompt(template_hint: Optional[str] = None) -> str:
    roles_summary = []
    for rk in GLOBAL_SPECIALIST_ROLES:
        meta = ROLE_METADATA[rk]
        en_name = meta.get("en", {}).get("name", rk)
        en_desc = meta.get("en", {}).get("description", "")
        roles_summary.append(f"- {rk}: {en_name} — {en_desc}")
    roles_list_str = "\n".join(roles_summary)

    hint_clause = ""
    if template_hint and template_hint.upper() not in {"AUTO", "NONE", ""}:
        hint_clause = (
            f"\nTEMPLATE HINT: The user initially selected '{template_hint}'. "
            "Use this as an orienting context signal, but DO NOT let it restrict your selection "
            "if the user's dilemma involves other critical dimensions (e.g. family dependencies, "
            "cash flow limits, legal risk, relocation logistics, burnout)."
        )

    return f"""You are the Decision Router for Mashwara AI, an expert consultation system in Pakistan.
Your sole job is to analyze the user's decision dilemma, identify its core dimensions, and select the exactly 6 most relevant expert perspectives.
You MUST NOT provide advice, solutions, or recommendations.
{hint_clause}

GLOBAL EXPERT ROLES AVAILABLE:
{roles_list_str}

ROUTING RULES:
1. Prefer existing global expert roles whenever they cover the required perspective.
2. Select 4 to 6 existing role IDs that provide materially distinct, diverse lenses on the problem. Avoid redundant roles.
3. DYNAMIC CONTEXTUAL ROLES (MAXIMUM 2):
   - Only create a dynamic role if a vital, decision-critical perspective is GENUINELY ABSENT from the global pool (e.g., apartment community security planning, agricultural crop dispute, relocation immigration logistics).
   - If existing roles adequately address the dilemma, dynamic_roles MUST be an empty array [].
   - Dynamic roles must be temporary analytical perspectives, NOT claims of real professional licenses (e.g., use "Security Planning Advisor", NOT "Licensed Security Contractor").
   - Dynamic role key MUST start with "dynamic_" (e.g. "dynamic_security_planning_advisor").
   - Provide localized names and titles in English, natural Pakistani Urdu (NO Arabic phrases or clichés), and Roman Urdu.
   - expertise_instruction must be a concise, objective evaluation instruction (max 200 characters).

Return ONLY a valid JSON object matching this exact schema:
{{
  "primary_dimension": "string",
  "secondary_dimensions": ["string"],
  "decision_type": "string",
  "stakes": ["string"],
  "expertise_needed": ["string"],
  "existing_role_ids": ["string (valid keys from global pool)"],
  "dynamic_roles": [
    {{
      "key": "dynamic_...",
      "name": {{"en": "...", "ur": "...", "roman-ur": "..."}},
      "title": {{"en": "...", "ur": "...", "roman-ur": "..."}},
      "description": {{"en": "...", "ur": "...", "roman-ur": "..."}},
      "expertise_instruction": "Evaluate the decision specifically through...",
      "icon": "🛡️",
      "color": "from-slate-500 to-slate-700"
    }}
  ]
}}"""


def validate_and_assemble_council(
    raw_data: Dict[str, Any],
    target_lang: str,
    user_prompt: str,
    template_hint: Optional[str] = None
) -> Tuple[List[str], Dict[str, Dict[str, Any]]]:
    """
    Validates router output and guarantees EXACTLY 6 visible expert roles.
    Never trusts LLM output blindly.
    """
    primary_dim = str(raw_data.get("primary_dimension", "general")).lower()
    raw_existing = raw_data.get("existing_role_ids", [])
    raw_dynamic = raw_data.get("dynamic_roles", [])

    # 1. Validate existing role IDs
    valid_existing: List[str] = []
    if isinstance(raw_existing, list):
        for rk in raw_existing:
            if isinstance(rk, str):
                rk_clean = rk.strip().lower()
                if (
                    rk_clean in ROLE_METADATA
                    and rk_clean != "lead_advisor"
                    and rk_clean != "moderator"
                    and rk_clean not in valid_existing
                ):
                    valid_existing.append(rk_clean)

    # 2. Validate dynamic roles (at most 2, optional)
    valid_dynamic_defs: Dict[str, Dict[str, Any]] = {}
    valid_dynamic_keys: List[str] = []

    if isinstance(raw_dynamic, list):
        for dyn in raw_dynamic[:2]:  # Enforce hard cap of 2
            if not isinstance(dyn, dict):
                continue
            raw_key = str(dyn.get("key", "")).strip().lower()
            if not re.match(r"^dynamic_[a-z0-9_]{3,40}$", raw_key):
                # Auto-sanitize key or skip
                sanitized_key = re.sub(r"[^a-z0-9_]", "", raw_key.replace(" ", "_"))
                if not sanitized_key.startswith("dynamic_"):
                    sanitized_key = f"dynamic_{sanitized_key}"
                raw_key = sanitized_key[:40]

            if not re.match(r"^dynamic_[a-z0-9_]{3,40}$", raw_key) or raw_key in valid_dynamic_keys:
                continue

            # Safe names / titles
            names = dyn.get("name") if isinstance(dyn.get("name"), dict) else {}
            titles = dyn.get("title") if isinstance(dyn.get("title"), dict) else {}
            descs = dyn.get("description") if isinstance(dyn.get("description"), dict) else {}

            en_name = str(names.get("en", "Specialist Advisor")).strip()[:60]
            ur_name = str(names.get("ur", en_name)).strip()[:80]
            ro_name = str(names.get("roman-ur", en_name)).strip()[:60]

            en_title = str(titles.get("en", en_name)).strip()[:80]
            ur_title = str(titles.get("ur", ur_name)).strip()[:100]
            ro_title = str(titles.get("roman-ur", ro_name)).strip()[:80]

            en_desc = str(descs.get("en", f"Provides specialized perspective on this decision.")).strip()[:200]
            ur_desc = str(descs.get("ur", en_desc)).strip()[:250]
            ro_desc = str(descs.get("roman-ur", en_desc)).strip()[:200]

            # Validate icon & color against allowlists
            raw_icon = str(dyn.get("icon", DEFAULT_ICON)).strip()
            safe_icon = raw_icon if raw_icon in SAFE_ICONS else DEFAULT_ICON

            raw_color = str(dyn.get("color", DEFAULT_GRADIENT)).strip()
            safe_color = raw_color if raw_color in SAFE_GRADIENTS else DEFAULT_GRADIENT

            # Expertise instruction (narrow lens)
            raw_inst = str(dyn.get("expertise_instruction", "")).strip()
            safe_inst = raw_inst[:300] if raw_inst else f"Analyze this decision objectively through the specialized lens of {en_name}."

            dynamic_def = {
                "key": raw_key,
                "role_id": raw_key,
                "name": {
                    "en": en_name,
                    "ur": ur_name,
                    "roman-ur": ro_name,
                },
                "title": {
                    "en": en_title,
                    "ur": ur_title,
                    "roman-ur": ro_title,
                },
                "description": {
                    "en": en_desc,
                    "ur": ur_desc,
                    "roman-ur": ro_desc,
                },
                "icon": safe_icon,
                "color": safe_color,
                "expertise_instruction": safe_inst,
                "is_dynamic": True,
                "is_moderator": False,
            }

            valid_dynamic_defs[raw_key] = dynamic_def
            valid_dynamic_keys.append(raw_key)

    # 3. Assemble exactly 6 roles
    assembled_roles: List[str] = []
    # Dynamic roles first (max 2)
    for dk in valid_dynamic_keys:
        if dk not in assembled_roles:
            assembled_roles.append(dk)

    # Add valid existing roles
    for ek in valid_existing:
        if ek not in assembled_roles:
            assembled_roles.append(ek)
        if len(assembled_roles) == 6:
            break

    # 4. If still under 6, backfill from deterministic fallback logic
    if len(assembled_roles) < 6:
        fallback_domain, fallback_sec = detect_consultation_domain(user_prompt, template_hint)
        fallback_roles = get_council_roles(fallback_domain, secondary_domains=fallback_sec, user_text=user_prompt)
        for fb_role in fallback_roles:
            if fb_role not in assembled_roles and fb_role != "lead_advisor":
                assembled_roles.append(fb_role)
            if len(assembled_roles) == 6:
                break

    # If still under 6 (edge case), backfill from core diverse pool
    core_backup = ["career_advisor", "financial_advisor", "practical_advisor", "family_constraint_advisor", "risk_analyst", "critical_challenger"]
    for bk in core_backup:
        if len(assembled_roles) >= 6:
            break
        if bk not in assembled_roles:
            assembled_roles.append(bk)

    # Guaranteed exactly 6
    return assembled_roles[:6], valid_dynamic_defs


async def route_consultation_council(
    user_prompt: str,
    target_lang: str,
    template_hint: Optional[str] = None,
    timeout_seconds: float = 5.0,
    document_summary: Optional[str] = None,
    web_evidence_summary: Optional[str] = None
) -> RoutingResult:
    """
    Runs an inexpensive structured routing step using Gemini Flash-Lite.
    Returns RoutingResult with exactly 6 selected roles and metadata.
    Completely independent of meeting persistence or database models.
    """
    t_start = time.perf_counter()
    clean_prompt = (user_prompt or "").strip()

    # If prompt is completely empty, use deterministic fallback immediately
    if not clean_prompt:
        fb_domain, fb_sec = detect_consultation_domain("", template_hint)
        fb_roles = get_council_roles(fb_domain, secondary_domains=fb_sec, user_text="")
        return RoutingResult(
            selected_roles=fb_roles[:6],
            primary_dimension=fb_domain,
            is_fallback=True,
            fallback_reason="Empty user prompt",
            routing_duration_ms=0.0
        )

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key) if api_key else genai.Client()
    sys_prompt = _build_router_system_prompt(template_hint=template_hint)
    doc_clause = f"\n\nDocument Evidence Context Summary:\n{document_summary.strip()}" if document_summary and document_summary.strip() else ""
    web_clause = f"\n\nCurrent Web Evidence Summary:\n{web_evidence_summary.strip()}" if web_evidence_summary and web_evidence_summary.strip() else ""
    user_msg = f"Decision Dilemma:\n{clean_prompt}{doc_clause}{web_clause}\n\nAnalyze dimensions and select the 6 expert perspectives as JSON."

    try:
        response = await client.aio.models.generate_content(
            model=ROUTER_MODEL,
            contents=[genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=user_msg)])],
            config=genai_types.GenerateContentConfig(
                system_instruction=sys_prompt,
                temperature=0.2,
                max_output_tokens=1024,
                response_mime_type="application/json",
            )
        )

        raw_text = (response.text or "").strip()
        parsed_data = json.loads(raw_text) if raw_text else {}

        selected_roles, dynamic_defs = validate_and_assemble_council(
            parsed_data, target_lang, clean_prompt, template_hint
        )

        duration_ms = (time.perf_counter() - t_start) * 1000.0

        return RoutingResult(
            selected_roles=selected_roles,
            dynamic_role_defs=dynamic_defs,
            primary_dimension=str(parsed_data.get("primary_dimension", "general")),
            secondary_dimensions=parsed_data.get("secondary_dimensions", []) if isinstance(parsed_data.get("secondary_dimensions"), list) else [],
            decision_type=str(parsed_data.get("decision_type", "decision")),
            stakes=parsed_data.get("stakes", []) if isinstance(parsed_data.get("stakes"), list) else [],
            expertise_needed=parsed_data.get("expertise_needed", []) if isinstance(parsed_data.get("expertise_needed"), list) else [],
            is_fallback=False,
            routing_duration_ms=round(duration_ms, 2)
        )

    except Exception as e:
        duration_ms = (time.perf_counter() - t_start) * 1000.0
        logger.warning(f"Router call failed ({e}); engaging deterministic fallback.", exc_info=False)

        fb_domain, fb_sec = detect_consultation_domain(clean_prompt, template_hint)
        fb_roles = get_council_roles(fb_domain, secondary_domains=fb_sec, user_text=clean_prompt)

        return RoutingResult(
            selected_roles=fb_roles[:6],
            dynamic_role_defs={},
            primary_dimension=fb_domain,
            secondary_dimensions=fb_sec,
            decision_type="fallback",
            is_fallback=True,
            fallback_reason=str(e),
            routing_duration_ms=round(duration_ms, 2)
        )
