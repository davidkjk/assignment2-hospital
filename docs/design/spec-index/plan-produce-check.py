#!/usr/bin/env python3
"""plan-produce-check — Consumes↔Produces 죽은 참조 전수 검사 (C1·C5 감시)

한 플랜의 `Consumes:` 목록이 가리키는 「백엔드 서비스/함수 심볼」이,
어느 정본 플랜에서도 `Produces:`로 선언되지도, 코드펜스에서 정의(def/function)되지도
않으면 = **죽은 참조**(생산자 없는 소비 → ⑦에서 배선 불가). 대표 사례:
  chat_notification_service.dispatch_pending_batches (C1-1: 소비만·생산자 없음).

⚠️ 범위: 이 검사기는 「이름이 아예 없는」 죽은 참조만 잡는다.
   이름은 맞는데 본문이 비었거나(KB 4함수)·DTO 필드가 어긋나거나·Produces 표기가
   허위(send_correction 등)인 것은 이름 대조로 못 본다 → ⑦ TDD/리뷰 몫(C5 상당수).
   UI 컴포넌트·라우트 문자열·규칙ID·설정경로·외부 라이브러리는 대상에서 제외한다.

사용: python3 docs/design/spec-index/plan-produce-check.py [--json]
종료코드: 죽은 참조 후보가 있으면 1, 없으면 0.
"""
import re, sys, os, json
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PLANS = {
    "foundation": "docs/superpowers/plans/2026-08-14-foundation-migrations-00010-shared-data-model.md",
    "staff":      "docs/superpowers/plans/2026-08-15-staff-web.md",
    "patient":    "docs/superpowers/plans/2026-08-17-patient-app.md",
    "chatbot":    "docs/superpowers/plans/2026-08-18-ai-chatbot.md",
    "deploy":     "docs/superpowers/plans/2026-07-27-deployment.md",
}

BT = re.compile(r"`([^`]+)`")

# 서비스 심볼로 볼 것: 점 경로(app.services.x.method / x_service.method) 또는
# 단독 *_service·SQL/파이썬 함수형 이름. 최종 호출명(마지막 세그먼트)으로 정규화.
# 점경로의 설정/코어 접두어 — 소비 대상(서비스 호출)이 아니라 상수/기반이라 제외
CONFIG_PREFIXES = ("settings", "config", "env")
SERVICE_SUFFIXES = ("_service", "_builder", "_client", "_repo", "_worker")

def service_symbols(token, *, as_consume):
    """토큰에서 '서비스 호출 심볼'을 뽑는다. 소비측(as_consume)은 고정밀 규칙,
    생산측은 넓게(정의된 이름은 다 생산으로 인정) 뽑는다."""
    t = token.strip()
    if t.startswith(("/", "<", "@", "--", "?", ".", "http")):
        return set()
    if re.match(r"^[A-Z]", t):                            # UI 컴포넌트·규칙ID·PascalCase
        return set()
    if re.match(r"^0*\d{3,5}$", t):
        return set()
    head = re.split(r"[\s(→]", t)[0].rstrip(",")
    segs = [s for s in head.split(".") if s]
    if not segs:
        return set()
    if not as_consume:
        # 생산측: 점경로의 모든 세그먼트를 생산 이름으로 인정(모듈·메서드 둘 다)
        out = set()
        for s in segs:
            if re.match(r"^[a-z][a-z0-9_]*$", s) and len(s) >= 4:
                out.add(s)
        return out
    # 소비측 고정밀: (a) 점경로의 메서드 호출(≥2세그·설정접두 아님) → 마지막 세그먼트
    #               (b) 단독이라도 *_service 계열 이름
    last = segs[-1]
    if not re.match(r"^[a-z][a-z0-9_]*$", last) or len(last) < 4:
        return set()
    if len(segs) >= 2:
        if segs[0] in CONFIG_PREFIXES or "settings" in segs or "config" in segs:
            return set()                                  # 상수 참조 제외
        # 테이블.칼럼(둘 다 순수 snake, 서비스 아님)도 여기 걸린다 → 생산우주에 표가 있으면 자동 정리됨
        return {last}
    if any(last.endswith(sfx) for sfx in SERVICE_SUFFIXES) or last in ("orchestrator",):
        return {last}
    return set()

# 2026-08-20 원문 대조로 "죽은 참조 아님" 확인된 후보(=베이스라인 허용).
# 이유를 옆에 남긴다. 새 참조가 이 밖에서 뜨면 게이트가 잡는다.
KNOWN_OK = {
    # 챗봇 서비스 객체 — 메서드는 Produces에 있고 모듈은 코드펜스에서 인스턴스로 쓰인다(파서 사각지대)
    "ai_session_service", "ticket_service", "card_builder", "orchestrator",
    # 1단계/공용 테이블·함수·설정 칸(00003~00009)
    "book_slot", "department_id", "cancellation_deadline_hours", "slot_duration_minutes",
    # 파서 잡음(일반 명사)
    "client", "dart",
}
# 플랜이 스스로 "선언 계약(생산자 없음, ⑦ 배선)"이라 문서화한 심볼 — 의도된 소비, 죽은 참조로 세지 않음.
DECLARED_CONTRACT = {
    "dispatch_pending_batches",   # deploy: 디스패처 공유 다리(C1-1). ⑤ 반입 완료·⑦ 배선.
}

# 1단계·공용·외부에서 이미 제공되는(=죽은 참조 아님) 기반 심볼 화이트리스트
BASE = {
    # 1단계 코어/DB/보안
    "settings", "database_url", "public_base_url", "get_pool", "acquire_as",
    "get_admin_client", "require_role", "get_current_staff", "get_current_patient",
    "apperror", "log_error", "pool", "errors", "config", "security",
    # 공용 테이블/보안함수(1단계·foundation)
    "patients", "staff", "appointments", "appointment_status_history",
    "access_audit_log", "notification_log", "questionnaire_responses",
    "hospital_settings", "departments", "current_patient_id", "current_staff_id",
    "patient_owns", "is_active_staff", "is_admin", "current_date",
    # 테스트 픽스처
    "db_conn", "set_session_auth", "seed_staff", "seed_patient", "seed_chat_thread",
    "conftest", "conftest_chat",
    # 외부/런타임
    "supabase", "pgvector", "twilio", "asyncpg", "flutter",
}

RE_DEF = re.compile(r"\b(?:async\s+def|def)\s+([a-z_][a-z0-9_]*)", re.I)
RE_FN  = re.compile(r"\bfunction\s+([a-z_][a-z0-9_]*)\s*\(", re.I)
RE_CRFN = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*)", re.I)
RE_CRTBL = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)", re.I)

def parse(text):
    """→ (consumes_symbols:set, produced_universe:set)"""
    cons = set()
    produced = set()
    lines = text.splitlines()
    in_prod = False
    prod_indent = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        # Consumes 한 줄
        if re.match(r"^[-*]?\s*Consumes:", s):
            for tok in BT.findall(s):
                cons |= service_symbols(tok, as_consume=True)
            in_prod = False
            continue
        # Produces 블록 시작
        if re.match(r"^[-*]?\s*Produces:", s):
            in_prod = True
            prod_indent = len(ln) - len(ln.lstrip())
            for tok in BT.findall(s):
                produced |= service_symbols(tok, as_consume=False)
            continue
        if in_prod:
            # 블록 종료 판정: 빈 줄이 아니고 들여쓰기가 Produces 이하로 내려오고
            # 새 최상위 불릿(⚠️/[ ]/Consumes 등)이면 종료
            if s == "":
                continue
            indent = len(ln) - len(ln.lstrip())
            if indent <= prod_indent and (s.startswith(("- [", "- ⚠️", "- **Step", "Consumes")) or re.match(r"^#{1,6}\s", s)):
                in_prod = False
            else:
                for tok in BT.findall(s):
                    produced |= service_symbols(tok, as_consume=False)
                continue
        # 코드펜스 정의(def/function/create table)도 생산으로 인정
        for rx in (RE_DEF, RE_FN, RE_CRFN, RE_CRTBL):
            for m in rx.finditer(s):
                produced.add(m.group(1).lower())
    return cons, produced

def main():
    as_json = "--json" in sys.argv
    per_cons = {}
    all_produced = set(BASE)
    missing = []
    texts = {}
    for plan, p in PLANS.items():
        full = os.path.join(ROOT, p)
        if not os.path.exists(full):
            missing.append(p); continue
        texts[plan] = open(full, encoding="utf-8").read()

    for plan, t in texts.items():
        cons, prod = parse(t)
        per_cons[plan] = cons
        all_produced |= prod

    allow = set(all_produced) | KNOWN_OK | DECLARED_CONTRACT
    # 죽은 참조: 어느 플랜이 소비하는데 생산 우주+base+검증 allowlist에 없음
    dead = defaultdict(list)      # 새 후보(베이스라인 밖)
    baseline = defaultdict(list)  # 이미 검증/선언계약으로 허용된 것(참고 표시)
    for plan, cons in per_cons.items():
        for sym in cons:
            if sym in all_produced:
                continue
            if sym in KNOWN_OK or sym in DECLARED_CONTRACT:
                baseline[sym].append(plan)
            else:
                dead[sym].append(plan)

    if as_json:
        print(json.dumps({"dead": {k: sorted(v) for k, v in dead.items()},
                          "baseline_allowed": {k: sorted(v) for k, v in baseline.items()},
                          "produced_count": len(all_produced), "missing": missing},
                         ensure_ascii=False, indent=2))
        return 1 if dead else 0

    print("=" * 68)
    print("Consumes↔Produces 죽은 참조 전수 검사 (C1·C5)")
    print("=" * 68)
    for m in missing:
        print("  ⚠️ MISSING:", m)
    print(f"생산 우주(Produces+정의+base): {len(all_produced)}개 심볼")
    print(f"베이스라인 허용(검증된 FP·선언계약): {len(baseline)}건 — 게이트 제외\n")
    if not dead:
        print("✅ 새 죽은 참조 없음. 아래는 이미 원문 대조로 허용된 베이스라인(참고):")
        for sym, plans in sorted(baseline.items()):
            tag = "선언계약" if sym in DECLARED_CONTRACT else "검증FP"
            print(f"   ({tag}) {sym:<30} ← {', '.join(sorted(set(plans)))}")
        return 0
    print(f"🔴/🟠 새 죽은 참조 후보 {len(dead)}건 — 소비하나 어디서도 생산·정의 안 됨:\n")
    for sym, plans in sorted(dead.items()):
        print(f"   {sym:<34} ← 소비: {', '.join(sorted(set(plans)))}")
    print("\n  ⚠️ 원문 대조 후: 진짜 생산자 없음이면 소유 플랜에 Produces 추가,")
    print("     다른 스테이지/1단계 제공이면 KNOWN_OK에, 의도된 선언계약이면 DECLARED_CONTRACT에 등록.")
    return 1 if dead else 0

if __name__ == "__main__":
    sys.exit(main())
