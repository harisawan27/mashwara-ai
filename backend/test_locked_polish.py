import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath("backend"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import (
    is_arabic_response,
    build_standard_chat_system_prompt,
    resolve_canonical_dilemma,
    START_MASHWARA_TOOL,
    build_consultation_chat_summary,
    CHAT_TOKENS,
)
from agents.board_config import (
    SPECIALIST_TOKENS,
    REBUTTAL_TOKENS,
    LEAD_ADVISOR_TOKENS,
)

def test_token_budgets():
    assert SPECIALIST_TOKENS == 1536, f"Expected 1536, got {SPECIALIST_TOKENS}"
    assert REBUTTAL_TOKENS == 1024, f"Expected 1024, got {REBUTTAL_TOKENS}"
    assert LEAD_ADVISOR_TOKENS == 3072, f"Expected 3072, got {LEAD_ADVISOR_TOKENS}"
    assert CHAT_TOKENS == 2048, f"Expected 2048, got {CHAT_TOKENS}"
    print("[PASS] Token budgets verification passed.")

def test_consultation_chat_summary():
    mock_report = {
        "decision": "APPROVED",
        "final_decision": "APPROVE WITH CAUTION",
        "confidence_score": 85,
        "debate_summary": "All specialists agreed the expansion has high potential but cautioned on cashflow.",
        "agreement": "High market demand in tier-2 cities.",
        "disagreement": "Whether to hire full-time or use contractors initially.",
        "key_risks": [
            "Cash flow deficit during the first 3 months",
            "Supplier delays in inventory delivery"
        ],
        "recommended_actions": [
            "Secure a 3-month credit line with bank",
            "Start with 2 contract sales leads before hiring full-time"
        ]
    }

    # 1. Test Urdu summary
    ur_summary = build_consultation_chat_summary(mock_report, "ur")
    assert "مشورہ مکمل ہو گیا" in ur_summary
    assert "حتمی مشورہ" in ur_summary
    assert "85%" in ur_summary
    assert "اہم خطرات:" in ur_summary
    assert "اگلے عملی اقدامات:" in ur_summary
    assert "مشورے کی رپورٹ" in ur_summary

    # 2. Test Roman Urdu summary
    roman_summary = build_consultation_chat_summary(mock_report, "roman-ur")
    assert "Mashwara mukammal ho gaya" in roman_summary
    assert "Final Mashwara" in roman_summary
    assert "85%" in roman_summary
    assert "Aham Khatray:" in roman_summary
    assert "Aglay Qadam:" in roman_summary

    # 3. Test English summary
    en_summary = build_consultation_chat_summary(mock_report, "en")
    assert "Consultation complete" in en_summary
    assert "Final Recommendation" in en_summary
    assert "85%" in en_summary
    assert "Key Risks:" in en_summary
    assert "Recommended Next Steps:" in en_summary

    print("[PASS] Consultation companion chat summary tests passed.")

def test_anti_arabic_detection():
    # 1. High confidence Arabic phrases
    arabic_samples = [
        "إليك ملخص القرار الاستشاري ويسعدنا تقديم المساعدة",
        "نحيطكم علماً بأن كافة التفاصيل قد تم تدقيقها",
        "سنوافيكم بالرد في أقرب وقت بناءً على طلبكم",
        "هذا القرار يعتمد على البيانات المتوفرة في السوق",
    ]
    for s in arabic_samples:
        assert is_arabic_response(s), f"Failed to detect Arabic in: {s}"

    # 2. Natural Pakistani Urdu phrases
    urdu_samples = [
        "ہمیں یہ دیکھنا چاہیے کہ اس فیصلے کا آپ کے کیریئر پر کیا اثر ہوگا اور بجٹ کتنا ہے۔",
        "کیا آپ چاہتے ہیں کہ ہم اس معاملے پر مکمل مشورہ کونسل تشکیل دیں؟",
        "یہ ایک اہم فیصلہ ہے جس میں مارکیٹ کے حالات اور تنخواہ کا فرق دیکھنا پڑے گا۔",
        "جی بالکل، میں آپ کی رہنمائی کر سکتا ہوں۔ آپ بتائیں کہ اصل مسئلہ کیا ہے؟",
    ]
    for s in urdu_samples:
        assert not is_arabic_response(s), f"False positive Arabic detection for Urdu: {s}"

    print("[PASS] Anti-Arabic detection tests passed.")

def test_canonical_dilemma_resolution():
    history = [
        {"role": "user", "content": "Should I quit my job in Lahore to do full-time freelancing on Upwork?"},
        {"role": "assistant", "content": "That is a major career decision. How much runway do you have?"},
        {"role": "user", "content": "I have 6 months of savings in PKR."},
        {"role": "assistant", "content": "Understood. Would you like me to convene the Mashwara Council?"},
    ]

    # Test confirmation in Urdu
    resolved_ur = resolve_canonical_dilemma("", history, "ہاں شروع کرو")
    assert resolved_ur == "I have 6 months of savings in PKR.", f"Expected savings message, got: {resolved_ur}"

    # Test confirmation with empty prompt from history
    resolved_dilemma = resolve_canonical_dilemma("", history[:2], "haan start karo")
    assert resolved_dilemma == "Should I quit my job in Lahore to do full-time freelancing on Upwork?", f"Got: {resolved_dilemma}"

    # Test explicit tool prompt preserved if valid
    resolved_explicit = resolve_canonical_dilemma("Launch a new SaaS product in Karachi", history, "haan shuru karo")
    assert resolved_explicit == "Launch a new SaaS product in Karachi"

    print("[PASS] Canonical dilemma resolution tests passed.")

def test_system_prompt():
    prompt_ur = build_standard_chat_system_prompt("ur")
    assert "جواب صرف قدرتی پاکستانی اردو میں دیں" in prompt_ur
    assert "عربی زبان میں جواب ہرگز نہ دیں" in prompt_ur
    assert "start_mashwara" in prompt_ur

    print("[PASS] System prompt verification passed.")

def test_tool_declaration():
    assert START_MASHWARA_TOOL.function_declarations[0].name == "start_mashwara"
    params = START_MASHWARA_TOOL.function_declarations[0].parameters
    assert "decision_prompt" in params.properties
    assert "decision_prompt" in params.required

    print("[PASS] Tool declaration verification passed.")

if __name__ == "__main__":
    test_token_budgets()
    test_consultation_chat_summary()
    test_anti_arabic_detection()
    test_canonical_dilemma_resolution()
    test_system_prompt()
    test_tool_declaration()
    print("\nALL BACKEND LOCK POLISH & CONTENT DEPTH TESTS PASSED SUCCESSFULLY!")
