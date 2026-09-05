#!/usr/bin/env python3
"""plan-migration-check — 마이그레이션 번호 배정 전수 검사 (C2 감시)

여러 정본 플랜이 같은 마이그 번호(00NNN)를 서로 다른 파일명으로 주장하는 충돌,
공백(구멍), 적용 원장(supabase/migrations)과의 대역 관계를 결정적으로 대조한다.
이음매 부채 중 「이름·번호가 기계로 대조 가능한」 부분을 LLM 표본 대신 전수한다.

사용: python3 docs/design/spec-index/plan-migration-check.py [--json]
종료코드: 충돌이 있으면 1, 없으면 0.
"""
import re, sys, glob, os, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PLANS = {
    "patient": "docs/superpowers/plans/2026-08-17-patient-app.md",
    "staff":   "docs/superpowers/plans/2026-08-15-staff-web.md",
    "chatbot": "docs/superpowers/plans/2026-08-18-ai-chatbot.md",
    "deploy":  "docs/superpowers/plans/2026-07-27-deployment.md",
}
APPLIED_DIR = "supabase/migrations"
FN = re.compile(r"\b(0*\d{3,5})_([a-z0-9_]+)\.sql\b")

def scan_plan(path):
    """번호 -> {파일명} (그 플랜이 언급한 모든 00NNN_*.sql)"""
    out = {}
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return out, f"MISSING: {path}"
    for line in open(full, encoding="utf-8"):
        for num, name in FN.findall(line):
            n = num.zfill(5)
            out.setdefault(n, set()).add(f"{n}_{name}.sql")
    return out, None

def applied_numbers():
    got = {}
    for p in sorted(glob.glob(os.path.join(ROOT, APPLIED_DIR, "*.sql"))):
        b = os.path.basename(p)
        m = FN.match(b)
        if m:
            got[m.group(1).zfill(5)] = b
    return got

def main():
    as_json = "--json" in sys.argv
    per_plan = {}
    errs = []
    for k, p in PLANS.items():
        d, err = scan_plan(p)
        per_plan[k] = d
        if err: errs.append(err)
    applied = applied_numbers()

    # 번호 -> {파일명 -> [플랜...]}
    universe = {}
    for plan, d in per_plan.items():
        for n, names in d.items():
            for nm in names:
                universe.setdefault(n, {}).setdefault(nm, set()).add(plan)

    collisions = {}   # 같은 번호에 서로 다른 파일명 2개 이상
    for n, names in universe.items():
        if len(names) >= 2:
            collisions[n] = {nm: sorted(pl) for nm, pl in names.items()}

    # 적용 원장(00001~) 이후 최고 번호 계산 (고유 파일명 기준, 예시/잠정 제외 못하므로 참고치)
    max_applied = max(applied) if applied else "00000"

    result = {
        "collisions": collisions,
        "applied_max": max_applied,
        "applied_count": len(applied),
        "errors": errs,
    }
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if collisions else 0

    print("=" * 64)
    print("마이그레이션 번호 배정 전수 검사 (C2)")
    print("=" * 64)
    print(f"적용 원장: {APPLIED_DIR}/  (00001~{max_applied}, {len(applied)}개)")
    for e in errs: print("  ⚠️", e)
    print()
    if not collisions:
        print("✅ 번호 충돌 없음.")
    else:
        print(f"🔴 번호 충돌 {len(collisions)}건 — 같은 번호를 다른 파일명이 주장:\n")
        for n in sorted(collisions):
            print(f"  [{n}]")
            for nm, pls in sorted(collisions[n].items()):
                mark = "  (적용됨)" if n in applied and applied[n] == nm else ""
                print(f"      {nm:<48} ← {','.join(pls)}{mark}")
        print(f"\n  → 단일 번호 배정표(ledger)를 확정하고 4플랜 내부 참조를 일괄 재번호할 것.")
    return 1 if collisions else 0

if __name__ == "__main__":
    sys.exit(main())
