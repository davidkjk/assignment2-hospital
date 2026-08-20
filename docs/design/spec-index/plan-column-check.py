#!/usr/bin/env python3
"""plan-column-check — 공유 칸 소유 + add column 가드 전수 검사 (C2-4 감시)

여러 정본 플랜이 같은 표에 같은 칸을 `alter table … add column …`으로 추가할 때,
한쪽만 `if not exists` 가드를 붙이면 적용 순서에 따라 배포가 중단된다
(선행 플랜이 칸을 만들면 후행의 무가드 add가 "column already exists"로 실패).

`alter table <T>` 문맥을 줄 단위로 추적해 뒤따르는 `add column` 들을 그 표에 귀속시키고,
(표, 칸)별로 어느 플랜이 추가하는지·가드가 붙었는지 대조한다.

사용: python3 docs/design/spec-index/plan-column-check.py [--json]
종료코드: 무가드 공유 칸(순서 의존 중단 위험)이 있으면 1, 없으면 0.
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

RE_ALTER = re.compile(r"\balter\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_.]*)", re.I)
RE_ADD   = re.compile(r"\badd\s+column\s+(if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)", re.I)

def scan_plan(text):
    """→ [(table, col, guarded_bool, lineno)]"""
    out = []
    current = None  # 진행 중인 alter table 대상
    in_sql = False
    for i, ln in enumerate(text.splitlines(), 1):
        s = ln.strip()
        low = s.lower()
        if low.startswith("```"):
            in_sql = "sql" in low  # ```sql 진입 / ``` 종료
            continue
        m = RE_ALTER.search(s)
        if m:
            current = m.group(1)
        for gm in RE_ADD.finditer(s):
            table = current
            col = gm.group(2)
            guarded = gm.group(1) is not None
            if table:
                out.append((table, col, guarded, i))
        # 세미콜론으로 문장이 끝나면 alter 문맥 종료
        if ";" in s:
            current = None
    return out

def main():
    as_json = "--json" in sys.argv
    # (table,col) -> plan -> {guarded:set(bool), lines:[...]}
    reg = defaultdict(lambda: defaultdict(lambda: {"guarded": set(), "lines": []}))
    missing = []
    for plan, p in PLANS.items():
        full = os.path.join(ROOT, p)
        if not os.path.exists(full):
            missing.append(p); continue
        for table, col, guarded, ln in scan_plan(open(full, encoding="utf-8").read()):
            e = reg[(table, col)][plan]
            e["guarded"].add(guarded)
            e["lines"].append(ln)

    shared = {}   # 2+ 플랜이 추가하는 (table,col)
    unguarded_shared = {}  # 그중 무가드 add가 하나라도 있는 것
    for key, plans in reg.items():
        if len(plans) >= 2:
            shared[key] = plans
            # 어느 플랜이든 무가드(guarded=False)가 있으면 위험
            if any(False in e["guarded"] for e in plans.values()):
                unguarded_shared[key] = plans

    def fmt_plans(plans):
        parts = []
        for pl, e in sorted(plans.items()):
            g = "가드O" if e["guarded"] == {True} else ("가드X" if e["guarded"] == {False} else "혼재")
            parts.append(f"{pl}({g}, L{','.join(map(str,e['lines']))})")
        return " · ".join(parts)

    if as_json:
        out = {
            "shared": {f"{t}.{c}": {pl: {"guarded": sorted(e["guarded"]), "lines": e["lines"]}
                                    for pl, e in pls.items()} for (t, c), pls in shared.items()},
            "unguarded_shared": [f"{t}.{c}" for (t, c) in unguarded_shared],
            "missing": missing,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 1 if unguarded_shared else 0

    print("=" * 68)
    print("공유 칸 소유 + add column 가드 전수 검사 (C2-4)")
    print("=" * 68)
    for m in missing:
        print("  ⚠️ MISSING:", m)
    print()
    if not shared:
        print("✅ 2개 이상 플랜이 같은 칸을 add 하는 경우 없음.")
        return 0

    print(f"공유 칸(2+ 플랜이 add column): {len(shared)}건\n")
    for (t, c), pls in sorted(shared.items()):
        danger = (t, c) in unguarded_shared
        mark = "🔴 무가드 있음 — 순서 의존 중단 위험" if danger else "🟡 전부 가드됨(소유만 확인)"
        print(f"  [{t}.{c}]  {mark}")
        print(f"      {fmt_plans(pls)}")
    print()
    if unguarded_shared:
        print(f"🔴 무가드 공유 칸 {len(unguarded_shared)}건 — 공유 칸의 add는 전부 `if not exists`로 통일할 것.")
    else:
        print("✅ 공유 칸이 있으나 전부 `if not exists` 가드됨.")
    return 1 if unguarded_shared else 0

if __name__ == "__main__":
    sys.exit(main())
