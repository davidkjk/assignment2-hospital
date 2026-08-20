#!/usr/bin/env python3
"""plan-enum-check — enum/type 문자열 집합 전수 대조 (C3·C4 감시)

같은 논리적 enum(알림 종류·예약 상태·요청 종류·유입원 등)이 여러 정본 플랜에서
서로 다른 문자열로 갈라지는 것을 결정적으로 잡는다. 두 가지 신호:
  1) 한/영 혼용  — 같은 family 안에 한글값과 ASCII값이 함께 존재(변환기 없으면 비교 실패).
  2) 정본 밖 값  — canonical(정본) 집합 밖의 형제값이 등장(이름 3분열 등).

각 family의 「어휘 전체」는 사람이 선언하고(FINAL-SYNTHESIS·grep 근거),
검사기는 그 어휘가 어느 플랜에 실제로 쓰였는지 기계로 대조·플래그한다.
새 값이 어휘 밖에서 조용히 들어오는 회귀는 못 잡으므로, 어휘 갱신은 수동.

사용: python3 docs/design/spec-index/plan-enum-check.py [--json]
종료코드: 한/영 혼용 또는 정본 밖 값이 있으면 1, 없으면 0.
"""
import re, sys, os, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

# 정본(현행 구현) 플랜만 본다. 2026-07-27-{patient,staff,chatbot,foundation-auth}는
# 재작성 전 옛 스펙이라 제외(낡은 값이 오탐을 낸다).
PLANS = {
    "foundation": "docs/superpowers/plans/2026-08-14-foundation-migrations-00010-shared-data-model.md",
    "staff":      "docs/superpowers/plans/2026-08-15-staff-web.md",
    "patient":    "docs/superpowers/plans/2026-08-17-patient-app.md",
    "chatbot":    "docs/superpowers/plans/2026-08-18-ai-chatbot.md",
    "deploy":     "docs/superpowers/plans/2026-07-27-deployment.md",
}

HANGUL = re.compile(r"[가-힣]")

def has_hangul(s):
    return bool(HANGUL.search(s))

# family: 한 논리적 enum. values = 그 어휘 전체(정본+갈라진 변종 모두).
# canonical = 정본 부분집합(있으면 밖의 값을 플래그). note = 사람용 설명.
FAMILIES = [
    {
        "label": "notification_type (알림 종류)",
        "values": [
            # 정본(직원웹 notification_settings CHECK 10종 + 알림 로그 확장)
            "requested", "confirmed", "reminder_day_before", "reminder_today",
            "changed", "hospital_cancelled", "cancellation_approved",
            "cancellation_rejected", "questionnaire_missing", "visit_completed",
            # 상담 답변 알림 — C3-2 3분열
            "support_answered", "chat_reply", "staff_chat_reply",
            # 옛 이름(반입 전) — 남아 있으면 잡아야 함
            "reminder_tomorrow",
        ],
        "canonical": {
            "requested", "confirmed", "reminder_day_before", "reminder_today",
            "changed", "hospital_cancelled", "cancellation_approved",
            "cancellation_rejected", "questionnaire_missing", "visit_completed",
            "support_answered",
        },
        "note": "상담답변은 support_answered로 통일해야 함(chat_reply·staff_chat_reply=분열). reminder_tomorrow=옛 이름.",
    },
    {
        "label": "appointment status (예약 상태)",
        # confirmed/requested/changed 등은 notification_type로도 정당히 쓰인다.
        # status/상태 칸을 언급한 줄로 문맥을 좁혀 오염을 막는다.
        "context": re.compile(r"\bstatus\b|상태|appointment_status"),
        "values": [
            "예약신청", "예약확정", "취소요청", "취소됨", "변경됨", "완료", "노쇼",
            "requested", "confirmed", "cancelled", "changed", "completed", "no_show",
        ],
        "canonical": {"예약신청", "예약확정", "취소요청", "취소됨", "변경됨", "완료", "노쇼"},
        "note": "DB enum은 한국어 정본. 영문 비교(status in ('confirmed'..))는 0건 오집계(C4-3).",
    },
    {
        "label": "request_type (예약요청 종류)",
        "context": re.compile(r"request_type|요청\s*종류|취소.*변경|cancel.*change|action_type"),
        "values": ["취소", "변경", "cancel", "change"],
        "canonical": {"취소", "변경"},
        "note": "DB/환자앱=한국어, 직원웹·챗봇 DTO=영문(변환기 없음, C4-5).",
    },
    {
        "label": "chat stats source (상담봇 유입원/신고 소스)",
        "values": ["app", "staff", "chatbot", "web", "realtime_report", "immediate"],
        "canonical": {"app", "staff", "chatbot", "web"},
        "note": "유입원 3~4분류가 정본. realtime_report(UI/규칙)↔immediate(Task 8 CHECK) 충돌(C3-3).",
    },
]

# 값이 '문자열'·"문자열" 리터럴로 등장하는지(단어 경계 포함)
def literal_re(v):
    return re.compile(r"['\"]" + re.escape(v) + r"['\"]")

def scan():
    # plan -> full text
    texts = {}
    missing = []
    for k, p in PLANS.items():
        full = os.path.join(ROOT, p)
        if not os.path.exists(full):
            missing.append(p); continue
        texts[k] = open(full, encoding="utf-8").read()

    families = []
    for fam in FAMILIES:
        ctx = fam.get("context")
        used = {}  # value -> [plan,...]
        for v in fam["values"]:
            rx = literal_re(v)
            plans_hit = []
            for k, t in texts.items():
                if ctx is None:
                    if rx.search(t):
                        plans_hit.append(k)
                else:
                    # 문맥(context)을 언급한 줄에서만 값 리터럴을 센다
                    if any(rx.search(ln) and ctx.search(ln) for ln in t.splitlines()):
                        plans_hit.append(k)
            if plans_hit:
                used[v] = sorted(plans_hit)
        present = list(used.keys())
        korean = [v for v in present if has_hangul(v)]
        ascii_ = [v for v in present if not has_hangul(v)]
        mixed = bool(korean) and bool(ascii_)
        off = []
        if fam.get("canonical") is not None:
            off = [v for v in present if v not in fam["canonical"]]
        families.append({
            "label": fam["label"], "note": fam["note"],
            "used": used, "korean": korean, "ascii": ascii_,
            "mixed": mixed, "off_canonical": off,
        })
    return families, missing

def main():
    as_json = "--json" in sys.argv
    families, missing = scan()

    problems = sum(1 for f in families if f["mixed"] or f["off_canonical"])

    if as_json:
        print(json.dumps({"families": families, "missing": missing,
                          "problem_families": problems}, ensure_ascii=False, indent=2))
        return 1 if problems else 0

    print("=" * 68)
    print("enum/type 문자열 집합 전수 대조 (C3·C4)")
    print("=" * 68)
    for m in missing:
        print("  ⚠️ MISSING:", m)
    print()
    for f in families:
        flags = []
        if f["mixed"]: flags.append("🔴 한/영 혼용")
        if f["off_canonical"]: flags.append("🟠 정본 밖 값")
        head = "✅" if not flags else " ".join(flags)
        print(f"[{f['label']}]  {head}")
        print(f"   {f['note']}")
        for v, pls in sorted(f["used"].items()):
            tag = "  ⟵ 정본 밖" if v in f["off_canonical"] else ""
            print(f"      {v:<24} : {', '.join(pls)}{tag}")
        if f["mixed"]:
            print(f"      → 한글값 {f['korean']} 과 ASCII값 {f['ascii']} 공존 — 변환기 없으면 비교/집계 실패.")
        print()

    if problems:
        print(f"🔴 문제 family {problems}건 — 이름/집합을 단일 정본으로 통일하고 각 플랜 참조를 맞출 것.")
    else:
        print("✅ 모든 family 정합.")
    return 1 if problems else 0

if __name__ == "__main__":
    sys.exit(main())
