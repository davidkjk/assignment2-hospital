#!/usr/bin/env python3
"""플랜의 「배정 표」와 「태스크 본문」을 대조한다.

왜 필요한가
-----------
플랜 앞머리의 두 표(「활성 route 정본」·「File Structure」)는 태스크마다 담당 규칙
접두어를 적어 둔다. 그런데 본문을 쓸 때 그 접두어가 실제로 반영됐는지 확인하는
단계가 없어서, 표에는 있고 본문에는 없는 접두어가 조용히 생긴다.

실제 사고(2026-08-15): `PICK-*`(목록에서 여러 명 고르기)가 Task 9 칸에 적혀 있었지만
본문에 한 줄도 안 들어갔다. 그 안에 요구사항 원문(`고객요구사항.txt:226` — "현재 보고
있는 목록을 엑셀에서 열 수 있는 파일로 내려받을 수 있어야")인 `[⬇ 내려받기]`가 있었다.

왜 하필 그것만 빠졌나
--------------------
`PICK-*`은 **전역 규칙**(`screen-behaviors.md:302`)인데 **화면 태스크**(Task 9)에
배정돼 있었다. 화면 태스크를 쓸 때는 그 화면 절만 펼치므로, 문서 다른 곳에 있는
전역 규칙은 시야에 안 들어온다. 같은 구조로 배정된 전역 규칙은 공용 부품 태스크
(4·5·6·7)에 있던 것들이고, 그것들은 전부 반영됐다.

  ⭐ 교훈: 전역 규칙은 **공용 부품 태스크가 소유**하고 화면은 소비만 하게 배정한다.
     화면 태스크에 배정된 전역 규칙이 있으면 이 검사가 잡는다.

사용법
------
    python3 docs/design/spec-index/plan-prefix-check.py [플랜파일]

기본 대상은 `docs/superpowers/plans/2026-08-15-staff-web.md`.
종료 코드: 누락이 있으면 1, 없으면 0.
"""
import re
import sys
import pathlib

DEFAULT_PLAN = "docs/superpowers/plans/2026-08-15-staff-web.md"
BEHAVIORS = "docs/design/screen-behaviors.md"
PREFIX_RE = re.compile(r"`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-\*`")


def task_spans(lines):
    """`## Task N:` 헤딩으로 본문 경계를 잡는다."""
    starts = [(int(m.group(1)), i)
              for i, l in enumerate(lines)
              if (m := re.match(r"^## Task (\d+):", l))]
    starts.sort(key=lambda x: x[1])
    return {t: (s, starts[i + 1][1] if i + 1 < len(starts) else len(lines))
            for i, (t, s) in enumerate(starts)}


def assignments(lines, first_task_line):
    """두 배정 표에서 태스크별 접두어를 모은다.

    표 형식이 다르므로 섞어 파싱하면 안 된다:
      - 활성 route 정본: | # | route | 규칙 접두어 | 담당 태스크 |   ← 태스크는 4번째 칸
      - File Structure : | 태스크 | 무엇 | 규칙 접두어 | 상태 |      ← 태스크는 1번째 칸
    """
    def section(header):
        return next((i for i, l in enumerate(lines) if l.startswith(header)), None)

    i_route, i_fs = section("## 활성 route"), section("## File Structure")
    out = {}

    def add(task, cell):
        for p in PREFIX_RE.findall(cell):
            out.setdefault(task, set()).add(p)

    def cells(line):
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        return c if len(c) == 4 else None

    if i_route is not None and i_fs is not None:
        for l in lines[i_route:i_fs]:
            if (c := cells(l)) and re.match(r"^\*{0,2}\d+", c[0]):
                if m := re.search(r"Task (\d+)", c[3]):
                    add(int(m.group(1)), c[2])

    if i_fs is not None:
        for l in lines[i_fs:first_task_line]:
            if (c := cells(l)) and re.match(r"^\*{0,2}\d+\*{0,2}$", c[0]):
                add(int(c[0].strip("*")), c[2])

    return out


def global_rule_prefixes(root):
    """규칙 문서에서 「전역 규칙」으로 선언된 절의 접두어."""
    path = root / BEHAVIORS
    if not path.exists():
        return set()
    out = set()
    for l in path.read_text().split("\n"):
        if l.startswith("## ") and "전역 규칙" in l:
            out.update(PREFIX_RE.findall(l))
    return out


def main():
    root = pathlib.Path(__file__).resolve().parents[3]
    plan = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / DEFAULT_PLAN
    lines = plan.read_text().split("\n")

    spans = task_spans(lines)
    if not spans:
        print(f"태스크 본문을 못 찾았다: {plan}")
        return 1

    assigned = assignments(lines, min(s for s, _ in spans.values()))
    globals_ = global_rule_prefixes(root)

    missing, pending = {}, {}
    for task in sorted(assigned):
        if task not in spans:                      # 아직 안 쓴 태스크
            risky = sorted(assigned[task] & globals_)
            if risky:
                pending[task] = risky
            continue
        start, end = spans[task]
        body = "\n".join(lines[start:end])
        gaps = [p for p in sorted(assigned[task]) if f"{p}-" not in body]
        if gaps:
            missing[task] = gaps

    print(f"플랜: {plan.name} · 작성된 태스크 {len(spans)}개 · 배정된 태스크 {len(assigned)}개\n")

    if missing:
        print("❌ 표에는 있는데 본문에 없는 접두어:")
        for t, ps in sorted(missing.items()):
            mark = " ⭐전역규칙" if set(ps) & globals_ else ""
            print(f"   Task {t:<3} {', '.join(ps)}{mark}")
    else:
        print("✅ 배정된 접두어가 모두 본문에 있다.")

    if pending:
        print("\n⚠️  아직 안 쓴 태스크에 배정된 **전역 규칙** — 쓸 때 빠지기 쉽다:")
        for t, ps in sorted(pending.items()):
            print(f"   Task {t:<3} {', '.join(ps)}")
        print("   → 전역 규칙은 공용 부품 태스크가 소유하고 화면은 소비만 하게 배정할 것.")

    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
