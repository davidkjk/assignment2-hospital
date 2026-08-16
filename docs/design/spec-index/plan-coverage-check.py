#!/usr/bin/env python3
"""플랜 커버리지 검산 — 색인의 결정과 screen-behaviors 규칙이 재작성 플랜에 다 들어갔는지 기계로 확인.

`coverage-check.py`가 [결정로그 → 색인]을 검산한다면, 이 스크립트는 그 다음 칸인
[색인 + 규칙 → 플랜]을 검산한다. 둘을 이어 붙이면 결정로그의 결정이 플랜까지
빠짐없이 도달했음을 사람 판단 없이 증명할 수 있다.

⑤ 플랜 재작성의 지킬 조건 2("writing-plans 스킬만 돌리면 규칙이 증발한다")를 막는 장치다.
재작성 전에 돌리면 그 출력이 곧 할 일 목록이고, 재작성 후에 돌려서 0이 되면 완료 증거다.

검산 두 갈래:
  ① 결정 라벨(기능 갭 #NN·AD-0NN·MR2-NN·SD-NN·역대조-N·R2-N)
     → 플랜 3개의 **합집합** 기준. 색인은 다른 영역 주담당 번호도 접점으로 적기
       때문에, 한 색인의 번호를 그 플랜에만 요구하면 거짓 실패가 난다.
  ② 규칙 ID(screen-behaviors.md)
     → **영역별** 기준. 영역 경계가 플랜 3개와 1:1로 대응한다.

사용:  python3 docs/design/spec-index/plan-coverage-check.py
       python3 docs/design/spec-index/plan-coverage-check.py --area staff-web   # 한 영역만
       python3 docs/design/spec-index/plan-coverage-check.py --list-missing-rules staff-web
종료코드: 빠진 것이 있으면 1, 없으면 0 (CI에도 걸 수 있음).
"""
import re, sys, os, argparse

IDXDIR = os.path.dirname(os.path.abspath(__file__))
# 리포지토리 루트 = docs/design/spec-index 에서 네 단계 위.
# (자매 스크립트 coverage-check.py는 ROOT를 docs/ 로 잡으므로 경로 접두어가 다르다.)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(IDXDIR)))
BEHAVIORS = os.path.join(ROOT, "docs/design/screen-behaviors.md")

# screen-behaviors.md의 영역 경계. 절 제목으로 찾아 줄번호 하드코딩을 피한다.
AREA_MARKERS = {
    "staff-web":   ("# 화면 동작 명세서",                    "# 환자 앱"),
    "patient-app": ("# 환자 앱",                             "## 상담봇 (chatbot)"),
    "ai-chatbot":  ("## 상담봇 (chatbot)",                   None),
}

# 검산 대상 = **재작성본**. 옛 플랜(2026-07-27-*)은 재작성의 입력일 뿐 정본이 아니므로
# 세지 않는다. 한 영역의 재작성본이 생길 때마다 여기를 새 경로로 바꾼다.
PLANS = {
    "staff-web":   "docs/superpowers/plans/2026-08-15-staff-web.md",
    "patient-app": "docs/superpowers/plans/2026-07-27-patient-app.md",   # 재작성 대기
    "ai-chatbot":  "docs/superpowers/plans/2026-07-27-ai-chatbot.md",    # 재작성 대기
}
INDEXES = {a: os.path.join(IDXDIR, f"SPECINDEX-{a}.md") for a in PLANS}

# 플랜에 없어도 커버로 인정하는 항목 (근거 필수)
LABEL_WHITELIST = {
    # 예: "AD-040": "법조사 차단 표식 — 결정 아님.",
}
RULE_WHITELIST = {
    # 예: "SHELL-NAV-03": "AD-069로 폐기된 규칙.",
}

RULE_RE = r'[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-[0-9]{2}'
# 규칙 정의는 표 첫 칸에 온다. 본문 인용과 구분해 '정의된 규칙'만 집는다.
RULE_DEF_RE = re.compile(r'^\| ?`?(' + RULE_RE + r')`?')

# ⚠️ 플랜 쪽을 셀 때는 **범위 표기의 시작**을 빼야 한다.
#    `TODAY-RESCHED-01~11`을 그냥 찾으면 `TODAY-RESCHED-01`이 매치돼
#    「그 규칙이 플랜에 있다」로 세어진다. 그런데 범위 표기가 실제로 쓰이는 자리는
#    **태스크의 「근거 원문」 줄**(= 참고 문헌)이고, 거기 적혔다는 것은
#    **그 규칙을 구현했다는 뜻이 아니다.** 심지어 규칙을 소유한 태스크가 아니라
#    **남의 태스크**의 참고 문헌일 수도 있다.
#    실제 사고: `TODAY-RESCHED-01`이 Task 19의 참고 문헌 `TODAY-RESCHED-01~11`에 걸려
#    ✅로 나왔지만, 정작 그 규칙을 구현할 **Task 8에는 없었다**(2026-08-16 발견).
#    ⭐ 그래서 범위는 **펼치지 않고 통째로 안 센다** — 펼치면 참고 문헌 한 줄이
#    규칙 11개를 한꺼번에 ✅로 만들어 사고가 11배가 된다.
#    ⑤ 플랜의 지킬 조건 2(*"각 태스크에 `test('[규칙ID] …')` 문장을 직접 넣는다"*)와도 같은 방향.
RULE_MENTION_RE = RULE_RE + r'(?!~)'
# ⚠️ 검사기 결함 4번째(2026-08-16 발견) — 갭 번호를 `#\d{1,3}\b`로 찾으면
#    **`갭 #127이 나왔다`를 못 센다.** 파이썬 `\b`는 유니코드 기준이라 한글도 「글자」이고,
#    `7`과 `이` 사이에는 경계가 없기 때문이다. 한국어 문서에서는 번호 뒤에 조사가 바로
#    붙는 것이 오히려 정상이므로, 이 규칙은 **문서를 검사기에 맞춰 쓰게 만드는 함정**이었다.
#    실제 사고: 색인에 `#127`을 적었는데 라벨 수가 84 그대로여서 「안 적힌 것」으로 보였다.
#    ⭐ 고친 방법: 경계 대신 **「뒤에 숫자나 16진수 글자가 오지 않는다」**를 본다.
#    ⚠️ 숫자만 막으면 안 된다 — 플랜에는 **색상 코드**가 있어서 `#5A6C7B`가 **갭 `#5`로** 세어진다
#       (`\b`를 쓰던 때는 우연히 안 걸렸다). `A~F`까지 막아야 `#0B6E70`·`#10243A`가 조용해진다.
LABEL_CLASSES = {
    "기능 갭": r'#\d{1,3}(?![\dA-Fa-f])',
    "AD":      r'AD-0\d{2}',
    "MR2":     r'MR2-\d{2}',
    "SD":      r'SD-\d{2}',
    "역대조":  r'역대조-\d[A-Z]?',
    "R2":      r'R2-\d[A-Z]?',
}


def load(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def area_text(behaviors, area):
    """영역 경계를 절 제목으로 잘라낸다."""
    start_mark, end_mark = AREA_MARKERS[area]
    start = behaviors.index(start_mark)
    end = behaviors.index(end_mark, start + len(start_mark)) if end_mark else len(behaviors)
    return behaviors[start:end]


def defined_rules(text):
    return {m.group(1) for line in text.splitlines() if (m := RULE_DEF_RE.match(line))}


def labels(text, pat):
    return set(re.findall(pat, text))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--area", choices=list(PLANS), help="한 영역만 검산")
    ap.add_argument("--list-missing-rules", choices=list(PLANS),
                    help="해당 영역에서 빠진 규칙 ID를 전부 출력(플랜 작성용 작업 목록)")
    args = ap.parse_args()

    behaviors = load(BEHAVIORS)
    areas = [args.area] if args.area else list(PLANS)

    plan_text = {}
    for a in PLANS:
        p = os.path.join(ROOT, PLANS[a])
        plan_text[a] = load(p) if os.path.exists(p) else ""
        if not plan_text[a]:
            print(f"⚠️  플랜 없음(빈 것으로 계산): {PLANS[a]}")
    all_plans = "\n".join(plan_text.values())

    if args.list_missing_rules:
        a = args.list_missing_rules
        miss = sorted(defined_rules(area_text(behaviors, a)) - labels(plan_text[a], RULE_MENTION_RE)
                      - set(RULE_WHITELIST))
        print("\n".join(miss))
        sys.exit(0 if not miss else 1)

    problems = []

    # ① 결정 라벨 — 플랜 3개 합집합 기준
    print("① 결정 라벨 (색인 → 플랜 3개 합집합)")
    for a in areas:
        idx = load(INDEXES[a])
        for name, pat in LABEL_CLASSES.items():
            miss = sorted(labels(idx, pat) - labels(all_plans, pat) - set(LABEL_WHITELIST),
                          key=lambda s: (len(s), s))
            if miss:
                problems.append((f"{a}/{name}", miss))
            shown = miss if len(miss) <= 12 else miss[:12] + [f"…외 {len(miss)-12}"]
            print(f"   {a:12s} {name:6s} 색인 {len(labels(idx, pat)):3d} / "
                  f"빠진 것 {len(miss):3d} {shown if miss else '✅'}")

    # ② 규칙 ID — 영역별 기준
    print("\n② 규칙 ID (screen-behaviors 영역 → 해당 플랜)")
    for a in areas:
        defined = defined_rules(area_text(behaviors, a))
        mentioned = labels(plan_text[a], RULE_MENTION_RE)
        miss = sorted(defined - mentioned - set(RULE_WHITELIST))
        # 범위 표기로만 적힌 규칙은 위에서 안 세므로 빠진 것에 들어온다.
        # 어느 것이 그 경우인지 짚어 준다 — 「근거 원문에 있으니 됐다」는 오해를 막는다.
        range_only = sorted(set(re.findall(RULE_RE + r'(?=~)', plan_text[a])) & set(miss))
        if range_only:
            print(f"   ⚠️  {a}: 범위 표기(`ID~NN`)로만 적힌 규칙 {len(range_only)}개는 "
                  f"「빠진 것」으로 센다 — {', '.join(range_only)}")
            print(f"       참고 문헌 줄에 범위로 적은 것은 구현이 아니다. "
                  f"소유 태스크 본문에 `test('[규칙ID] …')`로 넣을 것.")
        if miss:
            problems.append((f"{a}/규칙", [f"{len(miss)}개 (--list-missing-rules {a} 로 전체 출력)"]))
        pct = 100 * (len(defined) - len(miss)) / len(defined) if defined else 100
        print(f"   {a:12s} 정의 {len(defined):4d} / 플랜 반영 {len(defined)-len(miss):4d} "
              f"({pct:5.1f}%) / 빠진 것 {len(miss):4d} {'✅' if not miss else ''}")

    print()
    if problems:
        print("❌ 플랜이 빠뜨린 것이 있다 — 플랜에 반영하거나, 근거와 함께 WHITELIST에 등록:")
        for name, items in problems:
            print(f"   [{name}] {', '.join(str(i) for i in items)}")
        sys.exit(1)
    print("✅ 색인의 모든 결정과 영역 규칙이 플랜에 반영됨(화이트리스트 예외 제외).")
    sys.exit(0)


if __name__ == "__main__":
    main()
