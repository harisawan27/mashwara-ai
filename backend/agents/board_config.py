"""
Mashwara AI — Consultation Configuration & Dynamic Expert Councils
==================================================================
Native trilingual role definitions, shared role pool, Pakistani contextual intelligence,
and dynamic council orchestration for Urdu, Roman Urdu, and English.
"""

from typing import Dict, List, Any, Optional

# ---------------------------------------------------------------------------
# Model Pool — Production Gemini Models
# ---------------------------------------------------------------------------
CONSULTATION_MODEL = "gemini-3.5-flash-lite"
SPECIALIST_MODEL = "gemini-3.5-flash-lite"
DELIBERATION_MODEL = "gemini-3.5-flash-lite"
LEAD_ADVISOR_MODEL = "gemini-3.5-flash-lite"

CHAT_MODEL = "gemini-3.1-flash-lite"
SEARCH_MODEL = "gemini-3.1-flash-lite"

# Backward compatibility aliases
FAST_SPECIALIST_MODEL = SPECIALIST_MODEL
SPECIALIST_FALLBACK_MODEL = "gemini-3.5-flash-lite"

# Token limits
SPECIALIST_TOKENS = 768
REBUTTAL_TOKENS = 512
LEAD_ADVISOR_TOKENS = 2048


# ---------------------------------------------------------------------------
# Trilingual Role Display Metadata
# ---------------------------------------------------------------------------
ROLE_METADATA: Dict[str, Dict[str, Any]] = {
    "career_advisor": {
        "icon": "🧭",
        "color": "from-blue-500 to-blue-700",
        "en": {
            "name": "Career Advisor",
            "title": "Career Strategy & Employability",
            "description": "Analyzes long-term career growth, skill acquisition, and market employability."
        },
        "ur": {
            "name": "کیریئر مشیر",
            "title": "کیریئر حکمتِ عملی اور روزگار",
            "description": "مستقبل کی ترقی، مہارتوں کے حصول اور روزگار کے طویل مدتی امکانات کا جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Career Mashir",
            "title": "Career Strategy & Employability",
            "description": "Long-term career growth, skill acquisition aur market employability ka jaiza leta hai."
        }
    },
    "financial_advisor": {
        "icon": "💰",
        "color": "from-emerald-500 to-emerald-700",
        "en": {
            "name": "Financial Advisor",
            "title": "Cash Flow & Financial Health",
            "description": "Evaluates affordability, income stability, emergency buffers, and financial risk."
        },
        "ur": {
            "name": "مالی مشیر",
            "title": "آمدن، اخراجات اور مالی استحکام",
            "description": "آمدن کے استحکام، ماہانہ اخراجات، بچت اور مالیاتی خطرات کا باریک بینی سے جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Financial Mashir",
            "title": "Cash Flow & Financial Health",
            "description": "Income stability, mahana kharche, savings buffer aur financial risk ka jaiza leta hai."
        }
    },
    "market_advisor": {
        "icon": "📈",
        "color": "from-orange-500 to-orange-700",
        "en": {
            "name": "Job Market Expert",
            "title": "Market Demand & Industry Trends",
            "description": "Assesses external market demand, earning potential, and competition."
        },
        "ur": {
            "name": "روزگار کی مارکیٹ کے ماہر",
            "title": "مارکیٹ کی طلب اور رحجانات",
            "description": "مارکیٹ میں اس شعبے کی حقیقی طلب، متوقع آمدن اور مسابقت کا تجزیہ کرتے ہیں۔"
        },
        "roman-ur": {
            "name": "Job Market Expert",
            "title": "Market Demand & Industry Trends",
            "description": "Market demand, earning potential aur industry ke muqable ka jaiza leta hai."
        }
    },
    "practical_advisor": {
        "icon": "📋",
        "color": "from-teal-500 to-teal-700",
        "en": {
            "name": "Practical Advisor",
            "title": "Implementation & Daily Realities",
            "description": "Considers daily execution feasibility, actual workload, and logistical realities."
        },
        "ur": {
            "name": "عملی مشیر",
            "title": "عملی نفاذ اور زمینی حقائق",
            "description": "روزمرہ کے معمولات، کام کے حقیقی بوجھ اور عملی دشواریوں کا حقیقت پسندانہ جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Practical Mashir",
            "title": "Implementation & Daily Realities",
            "description": "Daily execution, actual workload aur ground reality ko mad-e-nazar rakhta hai."
        }
    },
    "family_constraint_advisor": {
        "icon": "🏡",
        "color": "from-indigo-500 to-indigo-700",
        "en": {
            "name": "Family & Practical Advisor",
            "title": "Family Responsibilities & Constraints",
            "description": "Evaluates household obligations, dependents, and practical family commitments without stereotyping."
        },
        "ur": {
            "name": "خاندانی اور عملی مشیر",
            "title": "خاندانی ذمہ داریاں اور حدود",
            "description": "گھریلو اخراجات، خاندان کے تعاون اور عملی مجبوریوں کا غیر جانبدارانہ جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Family & Practical Mashir",
            "title": "Family Responsibilities & Constraints",
            "description": "Ghar ke kharche, family responsibilities aur practical constraints ka jaiza leta hai."
        }
    },
    "risk_analyst": {
        "icon": "🛡️",
        "color": "from-red-500 to-red-700",
        "en": {
            "name": "Risk Expert",
            "title": "Downside & Failure Modes",
            "description": "Identifies failure points, worst-case scenarios, reversibility, and uncertainty."
        },
        "ur": {
            "name": "خطرات کے ماہر",
            "title": "منفی اثرات اور غیر یقینی صورتحال",
            "description": "ممکنہ ناکامی کے اسباب، بدترین حالات اور فیصلے کی واپسی کے امکانات کا جائزہ لیتے ہیں۔"
        },
        "roman-ur": {
            "name": "Risk Expert",
            "title": "Downside & Failure Modes",
            "description": "Failure points, worst-case scenarios, reversibility aur uncertainty ka jaiza leta hai."
        }
    },
    "critical_challenger": {
        "icon": "⚡",
        "color": "from-rose-500 to-rose-700",
        "en": {
            "name": "Critical Challenger",
            "title": "Assumption Testing & Counterarguments",
            "description": "Challenges consensus, uncovers hidden blind spots, and argues reasonable counterpoints."
        },
        "ur": {
            "name": "مخالف نقطۂ نظر",
            "title": "تنقیدی جائزہ اور متبادل زاویہ",
            "description": "عام مفروضات کو چیلنج کرتا ہے، نظر انداز پہلوؤں کو سامنے لاتا ہے اور مضبوط جوابی دلیل دیتا ہے۔"
        },
        "roman-ur": {
            "name": "Mukhalif Raaye",
            "title": "Assumption Testing & Counterarguments",
            "description": "Assumptions ko challenge karta hai, blind spots samnay lata hai aur solid counter-argument deta hai."
        }
    },
    "lead_advisor": {
        "icon": "⚖️",
        "color": "from-indigo-500 to-indigo-700",
        "en": {
            "name": "Lead Advisor",
            "title": "Synthesis & Final Recommendation",
            "description": "Synthesizes specialist perspectives into an actionable, balanced consultation report."
        },
        "ur": {
            "name": "مرکزی مشیر",
            "title": "مشاورتی خلاصہ اور حتمی رہنمائی",
            "description": "تمام ماہرین کی آراء کا غیر جانبدارانہ تجزیہ اور حتمی عملی لائحۂ عمل مرتب کرتا ہے۔"
        },
        "roman-ur": {
            "name": "Lead Mashir",
            "title": "Synthesis & Final Recommendation",
            "description": "Tamam mahireen ki aara ka balanced nichor aur final actionable mashwara tayar karta hai."
        }
    },
    "academic_advisor": {
        "icon": "🎓",
        "color": "from-sky-500 to-sky-700",
        "en": {
            "name": "Academic Advisor",
            "title": "Education Pathways & Credentials",
            "description": "Focuses on curriculum rigor, degree value, prerequisites, and learning outcomes."
        },
        "ur": {
            "name": "تعلیمی مشیر",
            "title": "تعلیمی راستے اور اسناد",
            "description": "نصاب کی اہمیت، ڈگری کی افادیت، تعلیمی تقاضوں اور سیکھنے کے عمل کا جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Taleemi Mashir",
            "title": "Education Pathways & Credentials",
            "description": "Degree ki value, curriculum rigor, prerequisites aur learning outcomes ka jaiza leta hai."
        }
    },
    "opportunity_advisor": {
        "icon": "🌟",
        "color": "from-amber-500 to-amber-700",
        "en": {
            "name": "Opportunity Advisor",
            "title": "Alternative Pathways & Scholarships",
            "description": "Identifies overlooked alternatives, scholarships, and hidden upsides."
        },
        "ur": {
            "name": "مواقع کے ماہر",
            "title": "متبادل مواقع اور اسکالرشپس",
            "description": "متبادل تعلیمی راستوں، اسکالرشپ اور پوشیدہ مفید مواقع کی نشاندہی کرتے ہیں۔"
        },
        "roman-ur": {
            "name": "Opportunity Expert",
            "title": "Alternative Pathways & Scholarships",
            "description": "Alternative pathways, scholarships aur hidden upsides ko highlight karta hai."
        }
    },
    "freelance_advisor": {
        "icon": "💼",
        "color": "from-blue-500 to-blue-700",
        "en": {
            "name": "Freelance Advisor",
            "title": "Freelance Strategy & Client Health",
            "description": "Evaluates rates, client diversification, contract scope, and gig sustainability."
        },
        "ur": {
            "name": "فری لانسنگ مشیر",
            "title": "فری لانسنگ اور کلائنٹ تعلقات",
            "description": "فری لانسنگ ریٹس، کلائنٹس کے ساتھ تعلقات، پروجیکٹ کے دائرہ کار اور پائیداری کا جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Freelance Mashir",
            "title": "Freelance Strategy & Client Health",
            "description": "Freelance rates, client diversification aur gig sustainability ka jaiza leta hai."
        }
    },
    "workload_advisor": {
        "icon": "🧘",
        "color": "from-amber-500 to-amber-700",
        "en": {
            "name": "Work & Lifestyle Advisor",
            "title": "Workload & Burnout Prevention",
            "description": "Evaluates burnout risk, mental wellbeing, personal capacity, and sustainable pace."
        },
        "ur": {
            "name": "طرزِ زندگی اور ذہنی سکون کے مشیر",
            "title": "کام کا دباؤ اور توازن",
            "description": "ذہنی دباؤ، تھکن کے خطرے، ذاتی صلاحیت اور کام و زندگی کے پائیدار توازن کا جائزہ لیتے ہیں۔"
        },
        "roman-ur": {
            "name": "Work-Life Mashir",
            "title": "Workload & Burnout Prevention",
            "description": "Burnout risk, mental wellbeing aur work-life balance ka jaiza leta hai."
        }
    },
    "business_strategist": {
        "icon": "🎯",
        "color": "from-blue-500 to-blue-700",
        "en": {
            "name": "Business Strategist",
            "title": "Business Model & Positioning",
            "description": "Evaluates business viability, unit economics, market positioning, and revenue models."
        },
        "ur": {
            "name": "کاروباری حکمتِ عملی کے ماہر",
            "title": "بزنس ماڈل اور پوزیشننگ",
            "description": "کاروبار کے امکانات، منافع بخش ماڈل اور مارکیٹ میں برتری کی حکمتِ عملی کا جائزہ لیتے ہیں۔"
        },
        "roman-ur": {
            "name": "Business Strategy Expert",
            "title": "Business Model & Positioning",
            "description": "Business viability, unit economics, market positioning aur revenue models ka jaiza leta hai."
        }
    },
    "operations_advisor": {
        "icon": "⚙️",
        "color": "from-purple-500 to-purple-700",
        "en": {
            "name": "Operations Expert",
            "title": "Operational Execution & Logistics",
            "description": "Assesses execution bottlenecks, supply/logistics requirements, and team capacity."
        },
        "ur": {
            "name": "آپریشنز کے ماہر",
            "title": "عملی انتظامات اور لاجسٹکس",
            "description": "کام کے بہاؤ، رسد کے انتظامات اور ٹیم کی آپریشنل صلاحیت کا جائزہ لیتے ہیں۔"
        },
        "roman-ur": {
            "name": "Operations Expert",
            "title": "Operational Execution & Logistics",
            "description": "Execution bottlenecks, logistics aur operational capacity ka jaiza leta hai."
        }
    },
    "product_advisor": {
        "icon": "📦",
        "color": "from-blue-500 to-blue-700",
        "en": {
            "name": "Product Advisor",
            "title": "Product-Market Fit & Roadmap",
            "description": "Evaluates user needs, feature validation, prioritization, and product strategy."
        },
        "ur": {
            "name": "پروڈکٹ مشیر",
            "title": "پروڈکٹ مارکیٹ فٹ اور ترجیحات",
            "description": "صارفین کی ضرورت، فیچرز کی تصدیق اور پروڈکٹ حکمتِ عملی کا جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Product Mashir",
            "title": "Product-Market Fit & Roadmap",
            "description": "User needs, feature validation, prioritization aur product strategy ka jaiza leta hai."
        }
    },
    "technology_advisor": {
        "icon": "⚙️",
        "color": "from-purple-500 to-purple-700",
        "en": {
            "name": "Technology Advisor",
            "title": "Technical Feasibility & Architecture",
            "description": "Assesses engineering complexity, architecture choices, scalability, and technical debt."
        },
        "ur": {
            "name": "ٹیکنالوجی مشیر",
            "title": "تکنیکی فزیبلٹی اور اسکیل ایبلٹی",
            "description": "انجینئرنگ کی پیچیدگی، آرکیٹیکچر کے انتخابات اور تکنیکی پائیداری کا جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Technology Mashir",
            "title": "Technical Feasibility & Architecture",
            "description": "Engineering complexity, architecture choices aur tech debt ka jaiza leta hai."
        }
    },
    "user_experience_advisor": {
        "icon": "🎨",
        "color": "from-pink-500 to-pink-700",
        "en": {
            "name": "User Experience Expert",
            "title": "Usability & Customer Flow",
            "description": "Advocates for usability, user journeys, friction reduction, and accessibility."
        },
        "ur": {
            "name": "صارف کے تجربے کے ماہر",
            "title": "استعمال میں آسانی اور یوزر فلو",
            "description": "استعمال میں سہولت، یوزر جرنی اور صارف کی تسلی کے پہلوؤں کا جائزہ لیتے ہیں۔"
        },
        "roman-ur": {
            "name": "User Experience Expert",
            "title": "Usability & Customer Flow",
            "description": "Usability, user journeys, friction reduction aur customer flow ka jaiza leta hai."
        }
    },
    "budget_advisor": {
        "icon": "💵",
        "color": "from-emerald-500 to-emerald-700",
        "en": {
            "name": "Budget Advisor",
            "title": "Monthly Budget & Cash Management",
            "description": "Focuses on day-to-day cash flow limits, savings discipline, and budget allocations."
        },
        "ur": {
            "name": "بجٹ مشیر",
            "title": "ماہانہ بجٹ اور بچت کا انتظام",
            "description": "ماہانہ خرچ کی حد، بچت کے نظم و ضبط اور مالی وسائل کی درست تقسیم کا جائزہ لیتا ہے۔"
        },
        "roman-ur": {
            "name": "Budget Mashir",
            "title": "Monthly Budget & Cash Management",
            "description": "Monthly cash limits, savings discipline aur budget allocation ka jaiza leta hai."
        }
    },
    "future_planning_advisor": {
        "icon": "🔮",
        "color": "from-indigo-500 to-indigo-700",
        "en": {
            "name": "Future Planning Expert",
            "title": "Long-Term Goals & Resilience",
            "description": "Evaluates 3-5 year compounding effects, life milestones, and long-term security."
        },
        "ur": {
            "name": "مستقبل کی منصوبہ بندی کے ماہر",
            "title": "طویل مدتی اہداف اور تحفظ",
            "description": "تین سے پانچ سال کے دور رس اثرات، خاندانی اہداف اور طویل مدتی تحفظ کا جائزہ لیتے ہیں۔"
        },
        "roman-ur": {
            "name": "Future Planning Expert",
            "title": "Long-Term Goals & Resilience",
            "description": "3-5 year compounding effects, life milestones aur long-term security ka jaiza leta hai."
        }
    }
}


# ---------------------------------------------------------------------------
# Legacy Role Compatibility Mapping
# ---------------------------------------------------------------------------
LEGACY_ROLE_MAP: Dict[str, str] = {
    "CEO": "business_strategist",
    "CFO": "financial_advisor",
    "CTO": "technology_advisor",
    "CMO": "market_advisor",
    "Risk": "risk_analyst",
    "Devil": "critical_challenger",
    "Moderator": "lead_advisor",
    "HR": "practical_advisor",
    "Manager": "career_advisor",
    "Finance": "financial_advisor",
    "Culture": "workload_advisor",
    "Strategist": "business_strategist",
    "Client": "market_advisor",
    "Wellness": "workload_advisor",
    "PM": "product_advisor",
    "Engineer": "technology_advisor",
    "Designer": "user_experience_advisor",
    "Growth": "market_advisor",
    "Advisor": "academic_advisor",
    "Counselor": "career_advisor",
    "Financial": "financial_advisor",
    "Mentor": "practical_advisor",
    "Peer": "opportunity_advisor",
}


# ---------------------------------------------------------------------------
# Dynamic Consultation Councils (6 Specialists + 1 Lead Advisor)
# ---------------------------------------------------------------------------
COUNCILS: Dict[str, List[str]] = {
    "career": [
        "career_advisor",
        "financial_advisor",
        "market_advisor",
        "practical_advisor",
        "risk_analyst",
        "critical_challenger",
    ],
    "education": [
        "academic_advisor",
        "career_advisor",
        "financial_advisor",
        "opportunity_advisor",
        "risk_analyst",
        "critical_challenger",
    ],
    "freelance": [
        "freelance_advisor",
        "financial_advisor",
        "market_advisor",
        "workload_advisor",
        "risk_analyst",
        "critical_challenger",
    ],
    "business": [
        "business_strategist",
        "financial_advisor",
        "market_advisor",
        "operations_advisor",
        "risk_analyst",
        "critical_challenger",
    ],
    "technology": [
        "product_advisor",
        "technology_advisor",
        "user_experience_advisor",
        "market_advisor",
        "risk_analyst",
        "critical_challenger",
    ],
    "finance": [
        "financial_advisor",
        "budget_advisor",
        "practical_advisor",
        "future_planning_advisor",
        "risk_analyst",
        "critical_challenger",
    ],
    "general": [
        "career_advisor",
        "financial_advisor",
        "practical_advisor",
        "family_constraint_advisor",
        "risk_analyst",
        "critical_challenger",
    ],
}


def get_council_roles(domain: str, secondary_domains: Optional[List[str]] = None, user_text: str = "") -> List[str]:
    """
    Assembles the 6 specialist roles for the consultation.
    Supports contextual role substitution (e.g. including family_constraint_advisor
    when family obligations, household support, or cross-cutting dilemmas are present).
    """
    text_lower = (user_text or "").lower()
    has_family = any(w in text_lower for w in ["family", "ghar", "walay", "walidain", "rishta", "bachon", "ghar ka kharcha", "bhai", "ammi", "abu"])
    
    # If general or cross-cutting with family constraints
    if domain == "general" or has_family:
        if domain == "education":
            return ["academic_advisor", "career_advisor", "financial_advisor", "family_constraint_advisor", "risk_analyst", "critical_challenger"]
        elif domain == "freelance":
            return ["freelance_advisor", "financial_advisor", "practical_advisor", "family_constraint_advisor", "risk_analyst", "critical_challenger"]
        elif domain == "business":
            return ["business_strategist", "financial_advisor", "practical_advisor", "family_constraint_advisor", "risk_analyst", "critical_challenger"]
        else:
            return ["career_advisor", "financial_advisor", "practical_advisor", "family_constraint_advisor", "risk_analyst", "critical_challenger"]

    return COUNCILS.get(domain, COUNCILS["career"])


# ---------------------------------------------------------------------------
# Pakistani Context & Role Prompts
# ---------------------------------------------------------------------------
PAKISTANI_CONTEXT_PROMPT = """
PAKISTANI CONTEXT INTELLIGENCE:
- Currency & Financial: Understand Pakistani terms naturally without asking the user to convert:
  * 90k = 90,000 PKR; 1.5 lakh = 150,000 PKR; 2 lakh = 200,000 PKR; 1 crore = 10,000,000 PKR; hazaar = thousand.
  * Understand concepts: ghar ka kharcha (essential household expenses), udhaar / qarz (debt/loans), installment / qist, committee (kameti / ROSCA savings pool), emergency savings buffer.
- Education: Understand Pakistani educational stages:
  * Matric (10th), Inter / HSSC (FSc Pre-Medical, FSc Pre-Engineering, ICS, FA, I.Com), board examinations, supply (supplementary exam), marks improvement, entry tests (MDCAT, ECAT), university admissions, GPA/CGPA, semester system.
- Careers: Understand Pakistani career realities:
  * Freelancing (Upwork, Fiverr, direct international clients), remote USD/foreign contracts, local corporate / software house salaries, government job (CSS, FPSC, PPSC, gas/bank) vs private sector, family dependencies, abroad opportunities (Dubai/Gulf, UK, Europe visa).
- Family & Social:
  * Recognize family expectations (ghar walay, walidain, rishta, shaadi, family support) objectively without stereotyping. Reason strictly from constraints provided by the user.
"""

def get_language_prompt_instruction(lang: str) -> str:
    if lang == "ur":
        return """
LANGUAGE INSTRUCTION (URDU):
آپ کو مکمل طور پر اردو زبان میں جواب دینا ہے۔ کسی انگریزی جواب کا ترجمہ نہ کریں بلکہ براہِ راست سلیس اور باوقار اردو میں سوچیں اور لکھیں۔ غیر ضروری طور پر مشکل یا فرسودہ الفاظ سے گریز کریں۔ جہاں پاکستانی بول چال میں رائج انگریزی الفاظ (جیسے جاب، سیلری، فری لانسنگ، بجٹ، پروجیکٹ، کلائنٹ، رسک) فطری ہوں، وہ استعمال کریں۔
"""
    elif lang == "roman-ur":
        return """
LANGUAGE INSTRUCTION (ROMAN URDU):
Aap ko natural, modern Pakistani Roman Urdu mein jawab dena hai. English se translate mat karein, seedha Roman Urdu mein likhein. Overly literary ya formal Urdu use na karein. Natural educated Pakistani conversational style apnaayein jahan technical/professional terms (salary, job, freelancing, budget, client, risk, career) naturally use hoti hain.
"""
    else:
        return """
LANGUAGE INSTRUCTION (ENGLISH):
Respond in clear, professional English while demonstrating full fluency with Pakistani financial, educational, and cultural context.
"""


def get_specialist_prompt(role_key: str, lang: str) -> str:
    """Generates the concise, lens-specific system prompt for a specialist in Round 1."""
    role_meta = ROLE_METADATA.get(role_key, ROLE_METADATA["career_advisor"])
    role_name = role_meta.get(lang, role_meta["en"])["name"]
    role_desc = role_meta.get(lang, role_meta["en"])["description"]
    lang_inst = get_language_prompt_instruction(lang)

    lens_instructions = {
        "career_advisor": "Focus strictly on long-term trajectory, skills development, employability, and growth optionality.",
        "financial_advisor": "Focus strictly on cash flow, income stability, downside affordability, savings buffer, and opportunity cost.",
        "market_advisor": "Focus strictly on market demand, competitive dynamics, industry hiring trends, and realistic earning ceiling.",
        "practical_advisor": "Focus strictly on daily reality, workload feasibility, execution friction, and logistics.",
        "family_constraint_advisor": "Focus strictly on household obligations, dependents' support, and practical family constraints supplied by the user.",
        "risk_analyst": "Focus strictly on failure modes, downside severity, uncertainty, and reversibility of the decision.",
        "critical_challenger": "Your role is to test emerging consensus. Challenge hidden assumptions, expose overconfidence, and present the strongest reasonable opposing case.",
        "academic_advisor": "Focus strictly on academic prerequisites, educational quality, learning outcomes, and degree marketability.",
        "opportunity_advisor": "Focus strictly on alternative pathways, scholarships, hidden upsides, and unconventional options.",
        "freelance_advisor": "Focus strictly on rate negotiation, client diversification, contract scope, and freelance career sustainability.",
        "workload_advisor": "Focus strictly on personal capacity, burnout risk, mental wellbeing, and sustainable workload pace.",
        "business_strategist": "Focus strictly on unit economics, business model viability, positioning, and scalable revenue.",
        "operations_advisor": "Focus strictly on execution capacity, logistics, supply bottlenecks, and operational realistic load.",
        "product_advisor": "Focus strictly on product-market fit, user problem validation, and roadmap prioritization.",
        "technology_advisor": "Focus strictly on engineering complexity, technical feasibility, architecture choices, and tech debt.",
        "user_experience_advisor": "Focus strictly on usability, user journeys, customer satisfaction, and adoption friction.",
        "budget_advisor": "Focus strictly on monthly cash allocation, expenditure discipline, and buffer preservation.",
        "future_planning_advisor": "Focus strictly on 3-5 year life milestones, compounding advantages, and future security.",
    }

    specific_lens = lens_instructions.get(role_key, "Provide objective specialist counsel.")

    return f"""You are {role_name} on Mashwara AI.
{role_desc}
{specific_lens}

{PAKISTANI_CONTEXT_PROMPT}
{lang_inst}

RULES:
1. Do NOT write long essays. Keep your rationale to 2-4 tight, actionable points.
2. Formulate your reasoning DIRECTLY in the target language.
3. You MUST end your response with a structured JSON block in this exact schema:

```json
{{
  "position": "support | oppose | uncertain",
  "confidence": 0-100,
  "rationale": [
    "point 1",
    "point 2"
  ],
  "key_concern": "Single biggest concern or downside",
  "assumptions": [
    "Core assumption made"
  ],
  "question_that_matters": "The single most decisive question"
}}
```
"""


def get_rebuttal_prompt(role_key: str, lang: str, peer_summary: str) -> str:
    """Generates the prompt for a specialist participating in Round 2 rebuttal."""
    role_meta = ROLE_METADATA.get(role_key, ROLE_METADATA["career_advisor"])
    role_name = role_meta.get(lang, role_meta["en"])["name"]
    lang_inst = get_language_prompt_instruction(lang)

    return f"""You are {role_name} participating in Round 2 Deliberation on Mashwara AI.

Below is the summary of key positions and disagreements from your fellow specialists:
{peer_summary}

{lang_inst}

YOUR TASK:
1. Review where your colleagues disagree with your lens.
2. Identify the single strongest point made by a colleague that challenges your view.
3. State whether your perspective changed, held firm, or softened.
4. Give your FINAL revised position and confidence.

Keep your response short and decisive (under 120 words). You MUST end with this JSON block:

```json
{{
  "challenge_to": "Role name you most disagree with or are addressing",
  "rebuttal": "Short, sharp counterpoint or clarification",
  "changed_mind_on": "What point changed or refined your thinking, if any",
  "final_position": "support | oppose | uncertain",
  "final_confidence": 0-100
}}
```
"""


def get_lead_advisor_prompt(lang: str, immutable_votes_summary: str) -> str:
    """Generates the synthesis prompt for the Lead Advisor."""
    lang_inst = get_language_prompt_instruction(lang)

    if lang == "ur":
        headings_guide = """
رپورٹ کے لازمی حصے (اردو عنوانات):
- خلاصہ (Summary)
- حتمی مشورہ (Final Mashwara)
- اس کی وجہ (Why)
- ماہرین کہاں متفق ہیں (Where Experts Agree)
- اختلاف کہاں ہے (Where Experts Disagree)
- اہم خطرات (Important Risks)
- اہم مفروضے (Important Assumptions)
- اگلے اقدامات (Next Steps)
- کن حالات میں یہ مشورہ بدل سکتا ہے (What Could Change This Recommendation)
"""
    elif lang == "roman-ur":
        headings_guide = """
Report ke mandatory sections (Roman Urdu headings):
- Khulasa (Summary)
- Final Mashwara (Final Recommendation)
- Kyun (Why)
- Mahireen kahan agree karte hain (Where Experts Agree)
- Ikhtilaf kahan hai (Where Experts Disagree)
- Aham Khatray (Important Risks)
- Important Assumptions
- Aglay Qadam (Next Steps)
- Kis surat mein yeh mashwara badal sakta hai (What Could Change This Recommendation)
"""
    else:
        headings_guide = """
Mandatory report sections (English headings):
- Summary
- Final Recommendation
- Why
- Where Experts Agree
- Where Experts Disagree
- Key Risks
- Important Assumptions
- Next Steps
- What Would Change This Recommendation
"""

    return f"""You are the Lead Advisor (مرکزی مشیر / Lead Mashir) on Mashwara AI.
Your job is to synthesize the specialist deliberation into a definitive, balanced consultation report.

CRITICAL VOTING RULE:
You MUST respect the immutable final specialist votes provided below. You are NOT allowed to invent, fabricate, or change their votes.
Specialist Votes:
{immutable_votes_summary}

{PAKISTANI_CONTEXT_PROMPT}
{lang_inst}
{headings_guide}

OUTPUT FORMAT:
You MUST output ONLY valid JSON matching this schema:
```json
{{
  "final_decision": "APPROVE | REJECT | DEFER",
  "confidence_score": 0-100,
  "debate_summary": "Comprehensive markdown text containing all the required headings and analysis in the target language",
  "key_risks": [
    "Risk 1",
    "Risk 2",
    "Risk 3"
  ],
  "recommended_actions": [
    "Action 1",
    "Action 2",
    "Action 3"
  ]
}}
```
"""


# ---------------------------------------------------------------------------
# Backward Compatibility Helpers
# ---------------------------------------------------------------------------
def get_board_config(template_key: str, lang: str = "ur", user_text: str = "") -> Dict[str, Any]:
    """
    Returns the board configuration dictionary compatible with existing callers.
    Resolves legacy template keys into dynamic councils.
    """
    domain_map = {
        "STUDENT_BOARD": "education",
        "HIRING_BOARD": "career",
        "FREELANCER_BOARD": "freelance",
        "STARTUP_BOARD": "business",
        "PRODUCT_BOARD": "technology",
    }
    domain = domain_map.get(template_key, "career")
    role_keys = get_council_roles(domain, user_text=user_text)

    roles = []
    for rk in role_keys:
        meta = ROLE_METADATA.get(rk, ROLE_METADATA["career_advisor"])
        lang_data = meta.get(lang, meta.get("en", {}))
        roles.append({
            "key": rk,
            "role_id": rk,
            "name": lang_data.get("name", rk),
            "title": lang_data.get("title", ""),
            "description": lang_data.get("description", ""),
            "icon": meta.get("icon", "👔"),
            "color": meta.get("color", "from-blue-500 to-blue-700"),
            "model": SPECIALIST_MODEL,
            "tokens": SPECIALIST_TOKENS,
            "prompt": get_specialist_prompt(rk, lang),
        })

    mod_meta = ROLE_METADATA["lead_advisor"]
    mod_lang = mod_meta.get(lang, mod_meta["en"])
    moderator = {
        "key": "lead_advisor",
        "role_id": "lead_advisor",
        "name": mod_lang.get("name", "Lead Advisor"),
        "title": mod_lang.get("title", "Lead Advisor"),
        "description": mod_lang.get("description", ""),
        "icon": mod_meta.get("icon", "⚖️"),
        "color": mod_meta.get("color", "from-indigo-500 to-indigo-700"),
        "model": LEAD_ADVISOR_MODEL,
        "tokens": LEAD_ADVISOR_TOKENS,
        "prompt": get_lead_advisor_prompt(lang, ""),
    }

    return {
        "name": f"Mashwara Council ({domain.capitalize()})",
        "domain": domain,
        "roles": roles,
        "moderator": moderator,
    }


def get_role_keys(template_key: str) -> list:
    domain_map = {
        "STUDENT_BOARD": "education",
        "HIRING_BOARD": "career",
        "FREELANCER_BOARD": "freelance",
        "STARTUP_BOARD": "business",
        "PRODUCT_BOARD": "technology",
    }
    domain = domain_map.get(template_key, "career")
    return get_council_roles(domain)
