"""
Boardroom AI — Board Template Definitions
==========================================
Defines the 5 board templates, their field schemas, validation logic,
and metadata used by both the API and the agent system.

Each template targets a different user type:
- STARTUP_BOARD:    Founders making company-level decisions
- HIRING_BOARD:     Hiring, firing, or promotion decisions
- FREELANCER_BOARD: Independent workers and solopreneurs
- STUDENT_BOARD:    Academic and career decisions
- PRODUCT_BOARD:    Product and feature decisions
"""

from enum import Enum
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Template type enum
# ---------------------------------------------------------------------------
class TemplateType(str, Enum):
    """Supported board meeting template types."""

    STARTUP_BOARD = "STARTUP_BOARD"
    HIRING_BOARD = "HIRING_BOARD"
    FREELANCER_BOARD = "FREELANCER_BOARD"
    STUDENT_BOARD = "STUDENT_BOARD"
    PRODUCT_BOARD = "PRODUCT_BOARD"


# ---------------------------------------------------------------------------
# Field definitions per template
# ---------------------------------------------------------------------------
# Each field has: key, label, type, required, options (for selects), placeholder

TEMPLATE_FIELDS: Dict[TemplateType, List[Dict[str, Any]]] = {
    TemplateType.STARTUP_BOARD: [
        {"key": "company_name", "label": "Company Name", "type": "text", "required": True, "placeholder": "e.g. Acme Inc."},
        {"key": "decision_title", "label": "Decision Title", "type": "text", "required": True, "placeholder": "e.g. Should we pivot to B2B?"},
        {"key": "decision_goal", "label": "Decision Goal", "type": "textarea", "required": True, "placeholder": "What are you trying to achieve with this decision?"},
        {"key": "company_stage", "label": "Company Stage", "type": "select", "required": True, "options": ["idea", "pre-revenue", "seed", "series-a", "growth"]},
        {"key": "funding_status", "label": "Funding Status", "type": "text", "required": False, "placeholder": "e.g. Bootstrapped, $500K raised"},
        {"key": "team_size", "label": "Team Size", "type": "number", "required": False, "placeholder": "e.g. 5"},
        {"key": "monthly_revenue", "label": "Monthly Revenue ($)", "type": "text", "required": False, "placeholder": "e.g. $10,000"},
        {"key": "runway_months", "label": "Runway (Months)", "type": "number", "required": False, "placeholder": "e.g. 18"},
        {"key": "industry", "label": "Industry", "type": "text", "required": False, "placeholder": "e.g. SaaS, FinTech, HealthTech"},
        {"key": "deadline", "label": "Decision Deadline", "type": "text", "required": False, "placeholder": "e.g. End of Q3 2026"},
    ],
    TemplateType.HIRING_BOARD: [
        {"key": "company_name", "label": "Company Name", "type": "text", "required": True, "placeholder": "e.g. Acme Inc."},
        {"key": "decision_title", "label": "Decision Title", "type": "text", "required": True, "placeholder": "e.g. Should we hire a VP of Engineering?"},
        {"key": "role_title", "label": "Role Title", "type": "text", "required": True, "placeholder": "e.g. Senior Backend Engineer"},
        {"key": "salary_budget", "label": "Salary Budget", "type": "text", "required": False, "placeholder": "e.g. $120,000 - $150,000"},
        {"key": "team_size", "label": "Current Team Size", "type": "number", "required": False, "placeholder": "e.g. 8"},
        {"key": "urgency", "label": "Urgency Level", "type": "select", "required": True, "options": ["low", "medium", "high", "critical"]},
        {"key": "current_team_workload", "label": "Current Team Workload", "type": "textarea", "required": False, "placeholder": "Describe current team capacity and workload"},
        {"key": "industry", "label": "Industry", "type": "text", "required": False, "placeholder": "e.g. SaaS, E-commerce"},
        {"key": "decision_goal", "label": "Decision Goal", "type": "textarea", "required": True, "placeholder": "What outcome are you hoping for?"},
        {"key": "deadline", "label": "Decision Deadline", "type": "text", "required": False, "placeholder": "e.g. Within 2 weeks"},
    ],
    TemplateType.FREELANCER_BOARD: [
        {"key": "your_name", "label": "Your Name", "type": "text", "required": True, "placeholder": "e.g. Jane Doe"},
        {"key": "decision_title", "label": "Decision Title", "type": "text", "required": True, "placeholder": "e.g. Should I take this $15K project?"},
        {"key": "project_type", "label": "Project Type", "type": "text", "required": True, "placeholder": "e.g. Web development, Brand design"},
        {"key": "budget_offered", "label": "Budget Offered", "type": "text", "required": False, "placeholder": "e.g. $15,000"},
        {"key": "project_timeline", "label": "Project Timeline", "type": "text", "required": False, "placeholder": "e.g. 3 months"},
        {"key": "current_capacity_percent", "label": "Current Capacity (%)", "type": "number", "required": False, "placeholder": "e.g. 70"},
        {"key": "client_history", "label": "Client Relationship", "type": "select", "required": False, "options": ["new", "returning", "referral"]},
        {"key": "decision_goal", "label": "Decision Goal", "type": "textarea", "required": True, "placeholder": "What are you trying to decide?"},
        {"key": "deadline", "label": "Decision Deadline", "type": "text", "required": False, "placeholder": "e.g. Must respond by Friday"},
    ],
    TemplateType.STUDENT_BOARD: [
        {"key": "your_name", "label": "Your Name", "type": "text", "required": True, "placeholder": "e.g. Alex Chen"},
        {"key": "decision_title", "label": "Decision Title", "type": "text", "required": True, "placeholder": "e.g. Should I pursue a Master's or start working?"},
        {"key": "options_being_compared", "label": "Options Being Compared", "type": "textarea", "required": True, "placeholder": "List the options you're considering"},
        {"key": "current_situation", "label": "Current Situation", "type": "textarea", "required": True, "placeholder": "Describe your current academic/career situation"},
        {"key": "long_term_goals", "label": "Long-Term Goals", "type": "textarea", "required": False, "placeholder": "Where do you see yourself in 5-10 years?"},
        {"key": "key_constraints", "label": "Key Constraints", "type": "textarea", "required": False, "placeholder": "e.g. Financial limitations, location, family"},
        {"key": "decision_goal", "label": "Decision Goal", "type": "textarea", "required": True, "placeholder": "What outcome would make this decision a success?"},
        {"key": "deadline", "label": "Decision Deadline", "type": "text", "required": False, "placeholder": "e.g. Application deadline in 2 months"},
    ],
    TemplateType.PRODUCT_BOARD: [
        {"key": "product_name", "label": "Product Name", "type": "text", "required": True, "placeholder": "e.g. TaskFlow App"},
        {"key": "decision_title", "label": "Decision Title", "type": "text", "required": True, "placeholder": "e.g. Should we build real-time collaboration?"},
        {"key": "feature_description", "label": "Feature Description", "type": "textarea", "required": True, "placeholder": "Describe the feature or product change in detail"},
        {"key": "target_users", "label": "Target Users", "type": "text", "required": False, "placeholder": "e.g. Enterprise teams, SMB owners"},
        {"key": "estimated_engineering_effort", "label": "Estimated Engineering Effort", "type": "text", "required": False, "placeholder": "e.g. 3 engineers, 6 weeks"},
        {"key": "potential_revenue_impact", "label": "Potential Revenue Impact", "type": "text", "required": False, "placeholder": "e.g. Could increase ARR by 20%"},
        {"key": "strategic_alignment", "label": "Strategic Alignment", "type": "textarea", "required": False, "placeholder": "How does this align with product vision?"},
        {"key": "decision_goal", "label": "Decision Goal", "type": "textarea", "required": True, "placeholder": "What should this decision accomplish?"},
        {"key": "deadline", "label": "Decision Deadline", "type": "text", "required": False, "placeholder": "e.g. Sprint planning next Monday"},
    ],
}


# ---------------------------------------------------------------------------
# Template metadata (display info for frontend & agents)
# ---------------------------------------------------------------------------
TEMPLATE_METADATA: Dict[TemplateType, Dict[str, Any]] = {
    TemplateType.STARTUP_BOARD: {
        "name": "Startup Board",
        "description": "For founders making company-level strategic decisions",
        "icon": "🚀",
        "accent_color": "indigo",
        "example_decision": "Should we pivot from B2C to B2B SaaS?",
        "target_audience": "startup founders and co-founders",
    },
    TemplateType.HIRING_BOARD: {
        "name": "Hiring Board",
        "description": "For hiring, firing, or promotion decisions",
        "icon": "👥",
        "accent_color": "emerald",
        "example_decision": "Should we hire a VP of Engineering now?",
        "target_audience": "hiring managers and team leads",
    },
    TemplateType.FREELANCER_BOARD: {
        "name": "Freelancer Board",
        "description": "For independent workers and solopreneurs",
        "icon": "💼",
        "accent_color": "amber",
        "example_decision": "Should I take this $15K project from a new client?",
        "target_audience": "freelancers and independent consultants",
    },
    TemplateType.STUDENT_BOARD: {
        "name": "Student Board",
        "description": "For academic and career decisions",
        "icon": "🎓",
        "accent_color": "sky",
        "example_decision": "Should I pursue a Master's degree or start working?",
        "target_audience": "students and early-career professionals",
    },
    TemplateType.PRODUCT_BOARD: {
        "name": "Product Board",
        "description": "For product and feature decisions",
        "icon": "📦",
        "accent_color": "rose",
        "example_decision": "Should we build real-time collaboration features?",
        "target_audience": "product managers and product teams",
    },
}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def validate_fields(template_type: TemplateType, fields: Dict[str, Any]) -> Optional[str]:
    """
    Validate that all required fields for the given template are present.
    Returns an error message string if validation fails, or None if valid.
    """
    template_fields = TEMPLATE_FIELDS.get(template_type, [])
    missing = []

    for field_def in template_fields:
        if field_def["required"] and not fields.get(field_def["key"]):
            missing.append(field_def["label"])

    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    return None


# ---------------------------------------------------------------------------
# Context builder (converts fields into a structured prompt for agents)
# ---------------------------------------------------------------------------
def get_template_context(template_type: TemplateType, fields: Dict[str, Any]) -> str:
    """
    Build a structured context string from the template type and user fields.
    This is injected into agent prompts so they understand the decision context.
    """
    meta = TEMPLATE_METADATA[template_type]
    template_fields = TEMPLATE_FIELDS[template_type]

    lines = [
        f"## Board Meeting Context",
        f"**Template**: {meta['name']}",
        f"**Target Audience**: {meta['target_audience']}",
        f"",
        f"### Decision Details",
    ]

    for field_def in template_fields:
        key = field_def["key"]
        label = field_def["label"]
        value = fields.get(key, "Not provided")
        if value and str(value).strip():
            lines.append(f"- **{label}**: {value}")

    return "\n".join(lines)
