import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath("backend"))

from main import (
    is_arabic_response,
    build_standard_chat_system_prompt,
    resolve_canonical_dilemma,
    START_MASHWARA_TOOL,
)

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
    test_anti_arabic_detection()
    test_canonical_dilemma_resolution()
    test_system_prompt()
    test_tool_declaration()
    print("\nALL BACKEND LOCK POLISH TESTS PASSED SUCCESSFULLY!")
