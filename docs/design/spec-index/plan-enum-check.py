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
        # 예약 status는 한국어 정본(00005). 정본=한국어 e2e(2026-08-20) → 영문은 정본 밖.
        # 문맥을 '예약' status 관용구로 좁혀 다른 칸(notify_patient 인자·다른 테이블 status)을 배제한다.
        "context": re.compile(
            r"from appointments|seed_appointment|\.status\b|status\s+in\s*\(|"
            r"status\s*[=:]\s*['\"]|예약\s*상태|appointment_status"),
        # 이름만 같은 다른 테이블 status 배제(스케줄 알림·알림 로그).
        "exclude": re.compile(r"scheduled_notifications|notification_log"),
        # 실제 00005 값. 영문(confirmed/requested)은 미변환 잔여를 잡으려 남김(정본 밖).
        "values": [
            "예약신청", "예약확정", "도착", "진료대기", "진료중", "진료완료",
            "환자취소", "병원취소", "예약부도",
            "requested", "confirmed",
        ],
        "canonical": {
            "예약신청", "예약확정", "도착", "진료대기", "진료중", "진료완료",
            "환자취소", "병원취소", "예약부도",
        },
        "note": "DB enum(00005)은 한국어 정본. 정본=한국어 e2e(2026-08-20) — 영문 status in ('confirmed'..)는 0건 오집계(C4-3, 해소).",
    },
    {
        "label": "request_type (예약요청 종류)",
        "context": re.compile(r"request_type|요청\s*종류|취소.*변경|cancel.*change|action_type"),
        "values": ["취소", "변경", "cancel", "change"],
        "canonical": {"취소", "변경"},
        "note": "DB/환자앱=한국어, 직원웹·챗봇 DTO=영문(변환기 없음, C4-5).",
    },
    {
        "label": "chat inflow source (상담봇 유입원)",
        "values": ["app", "staff", "chatbot", "web"],
        "canonical": {"app", "staff", "chatbot", "web"},
        "note": "유입원 3~4분류가 정본(chat_sessions.source 계열). 신고 출처(answer_feedback.source)와는 다른 칸 — 분리 검사.",
    },
    {
        # answer_feedback.source — 오답 신고 출처. 유입원과 다른 칸이라 별도 family.
        "label": "answer_feedback source (오답 신고 출처)",
        "values": ["realtime_report", "quality_review", "immediate"],
        "canonical": {"realtime_report", "quality_review"},
        "note": "즉시 신고=realtime_report(화면 명세 정본)·정기 검토=quality_review. ~~immediate~~ 폐기(C3-3 통일 2026-08-20).",
    },
]

# 값이 '문자열'·"문자열" 리터럴로 등장하는지(단어 경계 포함)
def literal_re(v):
    return re.compile(r"['\"]" + re.escape(v) + r"['\"]")

# 그 값 '자체'가 죽은 위치에 있으면 산 값으로 세지 않는다. 죽은 위치 두 가지:
#   ① 취소선 스팬 ~~...값...~~ 안(역참조로 폐기 표시한 옛 이름)
#   ② 부재 단언 "값" not in ...(예: assert "reminder_tomorrow" not in types)
# 줄 전체를 guard로 보지 않고 '그 값의 리터럴'만 지워서 판정 → 같은 줄에 산 값과 죽은 값이 공존해도 정확.
def counts_as_live(v, line):
    line = re.sub(r"~~.*?~~", "", line)                                    # 취소선 = 죽음
    lit = r"['\"]" + re.escape(v) + r"['\"]"
    line = re.sub(lit + r"\s*not in\b", "", line)                          # "값" not in = 부재 단언
    return re.search(lit, line) is not None

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
        exc = fam.get("exclude")  # 이 정규식에 걸리는 줄은 이름만 같은 다른 칸 → 세지 않는다
        used = {}  # value -> [plan,...]
        for v in fam["values"]:
            plans_hit = []
            for k, t in texts.items():
                if ctx is None:
                    # 죽은 위치(취소선·부재 단언)의 리터럴은 산 값으로 세지 않는다
                    if any(counts_as_live(v, ln) and not (exc and exc.search(ln))
                           for ln in t.splitlines()):
                        plans_hit.append(k)
                else:
                    # 문맥(context)을 언급한 줄에서만 값 리터럴을 센다(죽은 위치·exclude 제외)
                    if any(counts_as_live(v, ln) and ctx.search(ln) and not (exc and exc.search(ln))
                           for ln in t.splitlines()):
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
