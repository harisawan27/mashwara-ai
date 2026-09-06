import requests
import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

URL = "https://mashwara-ai-api-971578232755.asia-south1.run.app/chat/stream"

payload = {
    "template": "CAREER_PIVOT",
    "prompt": "کیا مجھے لاہور میں اپنی نوکری چھوڑ کر فل ٹائم ریموٹ سافٹ ویئر ایجنسی شروع کرنی چاہیے؟ میرے پاس 6 ماہ کے اخراجات کی بچت ہے۔",
    "language": "ur"
}

print("Initiating live consultation stream on Cloud Run...")
resp = requests.post(URL, json=payload, stream=True, timeout=180)

if resp.status_code != 200:
    print(f"FAILED: Status {resp.status_code}")
    sys.exit(1)

roles = []
specialist_lengths = {}
rebuttals_count = 0
report_received = False
chat_summary_received = False
summary_text = ""

for line in resp.iter_lines(decode_unicode=True):
    if not line:
        continue
    if line.startswith("data: "):
        data_str = line[6:]
        try:
            evt = json.loads(data_str)
            etype = evt.get("type")
            if etype == "roles":
                roles = evt.get("data", [])
                print(f"[OK] Roles received: {len(roles)} experts: {[r.get('key') for r in roles]}")
            elif etype == "final":
                agent = evt.get("agent")
                text = evt.get("text", "")
                word_count = len(text.split())
                char_count = len(text)
                specialist_lengths[agent] = (word_count, char_count)
                print(f"[OK] Expert '{agent}' completed: {word_count} words ({char_count} chars)")
            elif etype == "status" and "rebuttal" in evt.get("message", "").lower():
                rebuttals_count += 1
            elif etype == "report":
                report_received = True
                rep = evt.get("data", {})
                print(f"[OK] Report received! Final Decision: {rep.get('final_decision')}, Confidence: {rep.get('confidence_score')}%")
            elif etype == "chat_summary":
                chat_summary_received = True
                summary_text = evt.get("text", "")
                print(f"[OK] Companion Chat Summary received ({len(summary_text)} chars)!")
        except Exception as e:
            pass

print("\n--- CONSULTATION AUDIT RESULTS ---")
print(f"Roles count: {len(roles)}")
print(f"Completed specialists: {len(specialist_lengths)}")
for k, (w, c) in specialist_lengths.items():
    print(f"  - {k}: {w} words, {c} characters")
print(f"Report received: {report_received}")
print(f"Chat summary received: {chat_summary_received}")

if summary_text:
    print("\n--- COMPANION SUMMARY PREVIEW ---")
    print(summary_text)

assert report_received, "Report was not received!"
assert chat_summary_received, "Chat summary was not received!"
assert len(specialist_lengths) >= 5, f"Expected >= 5 specialists, got {len(specialist_lengths)}"

print("\nALL LIVE PRODUCTION CHECKS PASSED!")
