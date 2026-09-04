"""
Mashwara AI — Language & Consultation Intelligence
==================================================
Deterministic, lightweight language detection, priority resolution,
and domain/council selection for Urdu, Roman Urdu, and English.
"""

import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Set, Tuple


# ---------------------------------------------------------------------------
# Unicode Patterns
# ---------------------------------------------------------------------------
# Matches Arabic/Urdu Unicode blocks
URDU_UNICODE_RE = re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')

# Common Roman Urdu linguistic markers (pronouns, auxiliaries, particles)
ROMAN_URDU_MARKERS: Set[str] = {
    "mujhe", "mera", "meri", "mere", "kya", "kyun", "karun", "karna", "karne",
    "karte", "karti", "karta", "chahiye", "nahi", "nahin", "hai", "hain", "se",
    "ka", "ki", "ke", "ko", "ghar", "paisay", "paison", "paise", "mashwara",
    "acha", "achi", "achha", "achhi", "behtar", "soch", "socha", "lena", "dena",
    "mil", "raha", "rahi", "rahe", "hoga", "hogi", "hoge", "bhi", "toh", "to",
    "lekin", "magar", "par", "ab", "karo", "karein", "batao", "bataiye", "aur",
    "pe", "walay", "wali", "waly", "kharcha", "kharch", "kamai", "yar", "bhai",
    "jana", "aana", "sakta", "sakti", "sakte", "apna", "apni", "apne", "kisi",
    "koi", "kuch", "bohat", "zyada", "kam", "lagta", "lagti", "lagte", "lag",
    "wala", "wali", "kabhi", "jata", "jati", "jate", "aata", "aati", "aate",
    "pehle", "phir", "hota", "hoti", "hote", "tha", "thi", "the"
}


@dataclass
class ConsultationContext:
    """Authoritative context capturing language, domain, and message details."""
    language: str  # Authoritative response language: "ur" | "roman-ur" | "en"
    detected_language: str  # Detected input language: "ur" | "roman-ur" | "en" | "mixed"
    domain: str  # "career" | "education" | "freelance" | "business" | "technology" | "finance" | "general"
    user_message: str
    secondary_domains: List[str] = field(default_factory=list)
    template_hint: Optional[str] = None
    user_context: Optional[str] = None


def detect_language(text: str) -> str:
    """
    Lightweight, deterministic language detector.
    Returns: 'ur' | 'roman-ur' | 'en' | 'mixed'
    """
    if not text or not text.strip():
        return "en"

    clean = text.strip()
    urdu_chars = len(URDU_UNICODE_RE.findall(clean))
    total_alpha = sum(1 for c in clean if c.isalpha())

    # 1. Urdu script detection
    if urdu_chars >= 3 or (total_alpha > 0 and (urdu_chars / total_alpha) > 0.15):
        # Check if code-mixed with substantial Latin words
        latin_words = [w for w in re.findall(r'[a-zA-Z]{3,}', clean)]
        if len(latin_words) >= 3:
            return "mixed"
        return "ur"

    # 2. Roman Urdu vs English
    words = [w.lower() for w in re.findall(r'[a-zA-Z]+', clean)]
    if not words:
        return "en"

    matched_markers = [w for w in words if w in ROMAN_URDU_MARKERS]
    marker_count = len(matched_markers)
    unique_markers = len(set(matched_markers))

    # A short sentence like "kya karun?" has 2 markers out of 2 words.
    # An English sentence with loanword like "I love biryani" has 0 markers.
    if marker_count >= 2 or (len(words) <= 5 and unique_markers >= 1):
        # Check if heavily code-mixed with English professional vocabulary
        common_english_indicators = {"but", "job", "salary", "startup", "offer", "risky", "business", "client", "project", "career", "switch", "remote", "company", "team", "growth", "issue", "problem", "options", "stability"}
        english_vocab = [w for w in words if w in common_english_indicators or (len(w) > 4 and w not in ROMAN_URDU_MARKERS)]
        
        # If there's a strong presence of English vocabulary alongside Roman Urdu
        if len(english_vocab) >= 3 and (marker_count / len(words)) < 0.55:
            return "mixed"
        return "roman-ur"

    return "en"


def resolve_consultation_language(frontend_language: Optional[str], user_message: str) -> Tuple[str, str]:
    """
    Resolves final consultation language following the mandatory rule:
    If frontend_language in {"ur", "roman-ur", "en"}, frontend is 100% AUTHORITATIVE.
    Otherwise falls back to detected language.

    Returns:
      (authoritative_response_language, detected_user_language)
    """
    detected = detect_language(user_message)
    
    if frontend_language:
        normalized = frontend_language.strip().lower()
        if normalized in {"ur", "roman-ur", "en"}:
            return normalized, detected

    # Fallback to detected language
    if detected == "mixed":
        return "roman-ur", detected
    if detected in {"ur", "roman-ur", "en"}:
        return detected, detected
        
    return "en", detected


# ---------------------------------------------------------------------------
# Domain Classification & Hybrid Councils
# ---------------------------------------------------------------------------

DOMAIN_KEYWORDS: Dict[str, Set[str]] = {
    "education": {
        "matric", "inter", "fsc", "fa", "ics", "icom", "university", "degree",
        "study", "parhai", "admission", "scholarship", "college", "semester",
        "cgpa", "exam", "board", "masters", "bachelors", "phd", "academic",
        "تعلیم", "ڈگری", "کالج", "یونیورسٹی", "امتحان", "اسکالرشپ", "داخلہ"
    },
    "freelance": {
        "freelanc", "freelancing", "freelancer", "fiverr", "upwork", "client",
        "gig", "remote", "project", "proposal", "contract", "hourly",
        "فری لانسنگ", "کلائنٹ", "فری لانسر", "پروجیکٹ"
    },
    "finance": {
        "savings", "committee", "udhaar", "qarz", "installment", "budget",
        "investment", "bachat", "qist", "bank", "loan", "debt", "kharch",
        "خرچہ", "قرض", "ادھار", "بچت", "کمیٹی", "سرمایہ", "بینک"
    },
    "career": {
        "job", "salary", "offer", "career", "interview", "hiring", "promotion",
        "switch", "naukri", "nokri", "resign", "tanha", "tanwah", "office",
        "manager", "resume", "cv", "experience", "corporate",
        "نوکری", "ملازمت", "تنخواہ", "کیریئر", "انٹرویو"
    },
    "business": {
        "business", "startup", "karobar", "dukan", "store", "sales", "revenue",
        "shop", "customer", "b2b", "b2c", "founder", "inventory", "profit",
        "margin", "partnership", "investor",
        "کاروبار", "دکان", "سیلز", "منافع", "انویسٹر", "گاہک"
    },
    "technology": {
        "app", "software", "code", "stack", "feature", "tech", "build",
        "developer", "engineering", "backend", "frontend", "architecture",
        "bug", "database", "ai", "product", "saas",
        "سافٹ ویئر", "ٹیکنالوجی", "پروڈکٹ", "انجینئرنگ"
    }
}

TEMPLATE_TO_DOMAIN = {
    "STUDENT_BOARD": "education",
    "HIRING_BOARD": "career",
    "FREELANCER_BOARD": "freelance",
    "STARTUP_BOARD": "business",
    "PRODUCT_BOARD": "technology",
}


def detect_consultation_domain(text: str, template_hint: Optional[str] = None) -> Tuple[str, List[str]]:
    """
    Identifies primary domain and any secondary domains.
    If multiple strong signals are present (e.g. Dubai job offer vs family business),
    flags as 'general' / hybrid with secondary domains.
    """
    words = set(re.findall(r'[\w\u0600-\u06FF]+', text.lower()))
    scores: Dict[str, int] = {d: 0 for d in DOMAIN_KEYWORDS}

    for domain, kws in DOMAIN_KEYWORDS.items():
        for kw in kws:
            if any(kw in w for w in words):
                scores[domain] += 1

    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_domain, top_score = sorted_scores[0]
    second_domain, second_score = sorted_scores[1]

    secondary_domains: List[str] = []
    if second_score > 0 and second_score >= (top_score - 1):
        secondary_domains.append(second_domain)

    # If family/abroad/multiple conflicting signals, or top score is weak:
    family_markers = {"family", "ghar", "walay", "walidain", "rishta", "dubai", "abroad", "bahir", "bahar"}
    has_family_factor = bool(words & family_markers)

    if has_family_factor and top_score > 0 and second_score > 0:
        # Cross-cutting dilemma (e.g. Dubai job vs local family business)
        return "general", [top_domain, second_domain]

    if top_score >= 1:
        return top_domain, secondary_domains

    # Fallback to template hint if provided
    if template_hint and template_hint in TEMPLATE_TO_DOMAIN:
        return TEMPLATE_TO_DOMAIN[template_hint], []

    return "career", []
