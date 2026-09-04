"""
Unit Tests for Mashwara AI Multilingual Consultation Intelligence
==================================================================
Tests:
- Deterministic language detection
- Authoritative frontend language resolution
- Domain classification & hybrid council selection
- Exact locale-specific role names (Urdu-script vs Roman Urdu vs English)
- Selective Round 2 disagreement detection & skipping on consensus
- Structured output parsing
- Specialist vote preservation & immutability
- Legacy Boardroom role mapping compatibility
"""

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import unittest
from agents.language_intelligence import (
    detect_language,
    resolve_consultation_language,
    detect_consultation_domain,
    ConsultationContext,
)
from agents.board_config import (
    ROLE_METADATA,
    LEGACY_ROLE_MAP,
    COUNCILS,
    CONSULTATION_MODEL,
    SPECIALIST_MODEL,
    DELIBERATION_MODEL,
    LEAD_ADVISOR_MODEL,
    CHAT_MODEL,
    SEARCH_MODEL,
    FAST_SPECIALIST_MODEL,
    get_council_roles,
    get_board_config,
)
from agents import (
    select_rebuttal_specialists,
    parse_specialist_output,
    parse_rebuttal_output,
    _normalize_position,
)


class TestLanguageIntelligence(unittest.TestCase):
    def test_urdu_script_detection(self):
        query = "مجھے 90 ہزار کی نوکری مل رہی ہے لیکن فری لانسنگ سے کبھی ڈیڑھ لاکھ آ جاتا ہے اور کبھی 40 ہزار۔ گھر کا خرچہ بھی ہے، کیا کروں؟"
        self.assertEqual(detect_language(query), "ur")

    def test_roman_urdu_detection(self):
        query = "yar mujhe 90k ki job mil rahi hai lekin freelancing se kabhi 150k aa jata hai kabhi 40k, ghar ka kharcha bhi hai. kya karun?"
        self.assertEqual(detect_language(query), "roman-ur")

    def test_english_detection(self):
        query = "I have a 90k job offer, but freelancing sometimes makes 150k and sometimes only 40k. What should I do?"
        self.assertEqual(detect_language(query), "en")

    def test_mixed_code_switching_detection(self):
        query = "meri salary 90k hai but startup offer risky lag rahi hai, family pressure bhi hai"
        self.assertEqual(detect_language(query), "mixed")

    def test_loanword_does_not_falsely_trigger_roman_urdu(self):
        english_with_loanword = "I really enjoyed eating biryani yesterday at the restaurant in London."
        self.assertEqual(detect_language(english_with_loanword), "en")

    def test_authoritative_frontend_priority(self):
        # 1. UI = ur, user writes English -> response MUST be ur
        lang, _ = resolve_consultation_language("ur", "I want to start an online store")
        self.assertEqual(lang, "ur")

        # 2. UI = roman-ur, user writes Urdu script -> response MUST be roman-ur
        lang, _ = resolve_consultation_language("roman-ur", "کیا مجھے یہ نوکری چھوڑ دینی چاہیے؟")
        self.assertEqual(lang, "roman-ur")

        # 3. UI = en, user writes Roman Urdu -> response MUST be en
        lang, _ = resolve_consultation_language("en", "yar mujhe samajh nahi aa raha kya karun")
        self.assertEqual(lang, "en")

        # 4. UI = None, user writes Urdu script -> response falls back to ur
        lang, _ = resolve_consultation_language(None, "مجھے 90 ہزار کی نوکری مل رہی ہے")
        self.assertEqual(lang, "ur")

        # 5. UI = None, user writes Roman Urdu -> response falls back to roman-ur
        lang, _ = resolve_consultation_language(None, "mujhe 90k ki job mil rahi hai")
        self.assertEqual(lang, "roman-ur")


class TestDomainClassificationAndCouncils(unittest.TestCase):
    def test_career_domain(self):
        query = "mujhe 90k ki job mil rahi hai aur doosri company se 120k ka offer aya hai"
        domain, _ = detect_consultation_domain(query)
        self.assertEqual(domain, "career")
        roles = get_council_roles(domain, user_text=query)
        self.assertIn("career_advisor", roles)
        self.assertIn("financial_advisor", roles)
        self.assertIn("risk_analyst", roles)

    def test_education_domain(self):
        query = "مجھے میڈیا اسٹڈیز اور سوشیالوجی میں سے ایک ڈگری چننی ہے، میرے لیے کون سی بہتر ہوگی؟"
        domain, _ = detect_consultation_domain(query)
        self.assertEqual(domain, "education")
        roles = get_council_roles(domain, user_text=query)
        self.assertIn("academic_advisor", roles)
        self.assertIn("career_advisor", roles)

    def test_business_domain(self):
        query = "mere paas 3 lakh hain, kya online clothing business start karna sahi hoga?"
        domain, _ = detect_consultation_domain(query)
        self.assertEqual(domain, "business")
        roles = get_council_roles(domain, user_text=query)
        self.assertIn("business_strategist", roles)
        self.assertIn("financial_advisor", roles)

    def test_hybrid_council_with_family_constraints(self):
        query = "mujhe Dubai ki job leni chahiye ya yahan family business continue karun? ghar walay depend karte hain"
        domain, secondaries = detect_consultation_domain(query)
        self.assertEqual(domain, "general")
        roles = get_council_roles(domain, secondary_domains=secondaries, user_text=query)
        # Contextual substitution must include family_constraint_advisor
        self.assertIn("family_constraint_advisor", roles)
        self.assertIn("career_advisor", roles)
        self.assertIn("financial_advisor", roles)
        self.assertIn("critical_challenger", roles)


class TestRoleMetadataLocalization(unittest.TestCase):
    def test_urdu_script_role_names(self):
        # Urdu locale MUST emit native Urdu script names
        for role_key in ["career_advisor", "financial_advisor", "practical_advisor", "risk_analyst", "critical_challenger", "lead_advisor", "family_constraint_advisor"]:
            meta = ROLE_METADATA[role_key]["ur"]
            name = meta["name"]
            # Must NOT contain Roman Urdu words like "Mashir" in Latin script
            self.assertFalse(any(c.isalpha() and ord(c) < 128 for c in name), f"Role {role_key} has non-Urdu script in Urdu name: {name}")

        self.assertEqual(ROLE_METADATA["career_advisor"]["ur"]["name"], "کیریئر مشیر")
        self.assertEqual(ROLE_METADATA["financial_advisor"]["ur"]["name"], "مالی مشیر")
        self.assertEqual(ROLE_METADATA["critical_challenger"]["ur"]["name"], "مخالف نقطۂ نظر")
        self.assertEqual(ROLE_METADATA["lead_advisor"]["ur"]["name"], "مرکزی مشیر")
        self.assertEqual(ROLE_METADATA["family_constraint_advisor"]["ur"]["name"], "خاندانی اور عملی مشیر")

    def test_roman_urdu_role_names(self):
        self.assertEqual(ROLE_METADATA["career_advisor"]["roman-ur"]["name"], "Career Musheer")
        self.assertEqual(ROLE_METADATA["financial_advisor"]["roman-ur"]["name"], "Financial Musheer")
        self.assertEqual(ROLE_METADATA["critical_challenger"]["roman-ur"]["name"], "Mukhalif Raaye")
        self.assertEqual(ROLE_METADATA["lead_advisor"]["roman-ur"]["name"], "Lead Musheer")
        self.assertEqual(ROLE_METADATA["family_constraint_advisor"]["roman-ur"]["name"], "Family & Practical Musheer")

    def test_english_role_names(self):
        self.assertEqual(ROLE_METADATA["career_advisor"]["en"]["name"], "Career Advisor")
        self.assertEqual(ROLE_METADATA["financial_advisor"]["en"]["name"], "Financial Advisor")
        self.assertEqual(ROLE_METADATA["critical_challenger"]["en"]["name"], "Critical Challenger")
        self.assertEqual(ROLE_METADATA["lead_advisor"]["en"]["name"], "Lead Advisor")

    def test_legacy_role_mapping(self):
        # Old role keys from BoardroomAI must map to semantic new roles
        self.assertEqual(LEGACY_ROLE_MAP["CEO"], "business_strategist")
        self.assertEqual(LEGACY_ROLE_MAP["CFO"], "financial_advisor")
        self.assertEqual(LEGACY_ROLE_MAP["CTO"], "technology_advisor")
        self.assertEqual(LEGACY_ROLE_MAP["CMO"], "market_advisor")
        self.assertEqual(LEGACY_ROLE_MAP["Risk"], "risk_analyst")
        self.assertEqual(LEGACY_ROLE_MAP["Devil"], "critical_challenger")
        self.assertEqual(LEGACY_ROLE_MAP["Moderator"], "lead_advisor")


class TestSelectiveRound2AndVoting(unittest.TestCase):
    def test_rebuttal_selection_with_disagreement(self):
        # If specialists have opposing positions, select 2-3 for Round 2
        round1_mock = {
            "career_advisor": {"position": "support", "confidence": 85},
            "financial_advisor": {"position": "oppose", "confidence": 80},
            "market_advisor": {"position": "support", "confidence": 70},
            "practical_advisor": {"position": "uncertain", "confidence": 50},
            "risk_analyst": {"position": "oppose", "confidence": 75},
            "critical_challenger": {"position": "oppose", "confidence": 85},
        }
        rebuttal_specialists = select_rebuttal_specialists(round1_mock)
        self.assertTrue(2 <= len(rebuttal_specialists) <= 3)
        self.assertIn("career_advisor", rebuttal_specialists)  # Top supporter
        self.assertTrue("financial_advisor" in rebuttal_specialists or "critical_challenger" in rebuttal_specialists)  # Opposer

    def test_rebuttal_skipped_on_consensus(self):
        # If all 6 agree (unanimous consensus), Round 2 is skipped (returns empty list)
        round1_consensus = {
            "career_advisor": {"position": "support", "confidence": 90},
            "financial_advisor": {"position": "support", "confidence": 85},
            "market_advisor": {"position": "support", "confidence": 88},
            "practical_advisor": {"position": "support", "confidence": 80},
            "risk_analyst": {"position": "support", "confidence": 75},
            "critical_challenger": {"position": "support", "confidence": 70},
        }
        rebuttal_specialists = select_rebuttal_specialists(round1_consensus)
        self.assertEqual(rebuttal_specialists, [])

    def test_specialist_output_parsing(self):
        sample_model_response = """
        Is situation mein 90k ki job zyada mehfooz lagti hai. Freelancing mein cash flow uncertain hai.
        
        ```json
        {
          "position": "support",
          "confidence": 78,
          "rationale": [
            "Fixed salary covers ghar ka kharcha",
            "Freelancing can be done on weekends"
          ],
          "key_concern": "Burnout agar dono saath karein",
          "assumptions": ["Job timings are 9 to 5"],
          "question_that_matters": "Can you sustain on 40k during a dry freelancing month?"
        }
        ```
        """
        parsed = parse_specialist_output(sample_model_response)
        self.assertEqual(parsed["position"], "support")
        self.assertEqual(parsed["confidence"], 78)
        self.assertEqual(len(parsed["rationale"]), 2)
        self.assertIn("Burnout", parsed["key_concern"])
        self.assertIn("Is situation mein", parsed["clean_text"])
        self.assertNotIn("```json", parsed["clean_text"])

    def test_rebuttal_vote_replacement_and_preservation(self):
        # Round 1 initial state
        round1_votes = {
            "career_advisor": {"vote": "YES", "confidence": 80},
            "financial_advisor": {"vote": "NO", "confidence": 75},
            "risk_analyst": {"vote": "NO", "confidence": 70},
        }
        
        # Financial advisor participates in rebuttal and revises view
        rebuttal_output = """
        Maine Career Musheer ki baat suni hai ke long-term skills barh rahi hain. Lekin kharche kam nahi ho sakte.
        ```json
        {
          "challenge_to": "career_advisor",
          "rebuttal": "Ghar ka kharcha 70k hai, dry months mein saving khatam ho jayegi",
          "changed_mind_on": "Acknowledge growth potential",
          "final_position": "uncertain",
          "final_confidence": 60
        }
        ```
        """
        parsed_reb = parse_rebuttal_output(rebuttal_output, "oppose", 75)
        self.assertEqual(parsed_reb["final_position"], "uncertain")
        self.assertEqual(parsed_reb["final_confidence"], 60)

        # Update votes: participating specialist updates, non-participating retains Round 1 vote
        final_votes = dict(round1_votes)
        final_votes["financial_advisor"] = {
            "vote": "DEFER",
            "confidence": parsed_reb["final_confidence"],
            "position": parsed_reb["final_position"]
        }

        # Non-participating specialists preserve Round 1 vote
        self.assertEqual(final_votes["career_advisor"]["vote"], "YES")
        self.assertEqual(final_votes["risk_analyst"]["vote"], "NO")
        # Participating specialist has revised vote
        self.assertEqual(final_votes["financial_advisor"]["vote"], "DEFER")


class TestModelRouting(unittest.TestCase):
    def test_model_constants(self):
        self.assertEqual(CONSULTATION_MODEL, "gemini-3.5-flash-lite")
        self.assertEqual(SPECIALIST_MODEL, "gemini-3.5-flash-lite")
        self.assertEqual(DELIBERATION_MODEL, "gemini-3.5-flash-lite")
        self.assertEqual(LEAD_ADVISOR_MODEL, "gemini-3.5-flash-lite")
        self.assertEqual(FAST_SPECIALIST_MODEL, "gemini-3.5-flash-lite")

        self.assertEqual(CHAT_MODEL, "gemini-3.1-flash-lite")
        self.assertEqual(SEARCH_MODEL, "gemini-3.1-flash-lite")

    def test_board_config_model_assignments(self):
        for domain in ["career", "education", "freelance", "business", "technology", "general"]:
            cfg = get_board_config(domain)
            for role in cfg["roles"]:
                self.assertEqual(role["model"], "gemini-3.5-flash-lite")
                self.assertNotIn("gemma", role["model"].lower())
            self.assertEqual(cfg["moderator"]["model"], "gemini-3.5-flash-lite")
            self.assertNotIn("gemma", cfg["moderator"]["model"].lower())


if __name__ == "__main__":
    unittest.main()
