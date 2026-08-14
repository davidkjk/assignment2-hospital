#!/usr/bin/env python3
"""색인 커버리지 검산 — 결정로그의 결정 번호가 색인 3개에 모두 반영됐는지 기계로 확인.

세 번 감사해도 사람·AI 판단은 빈틈이 날 수 있다. 이 스크립트는 판단 없이
"로그에 있는 결정 번호"와 "색인이 참조한 번호"를 집합 뺄셈해, 색인이 안 건드린
번호를 그대로 뽑는다. 스펙·플랜 재작성 전/중에 돌려서 빈곳을 원천 차단한다.

사용:  python3 docs/design/spec-index/coverage-check.py
종료코드: 빠진 번호가 있으면 1, 없으면 0 (CI에도 걸 수 있음).

⚠️ 아래 WHITELIST는 "색인에 라벨이 없어도 괜찮은 것"이다 — 감사 진행기록·조사
차단표식·다른 라벨로 커버된 결정. 새로 추가할 때는 반드시 근거를 주석으로 남길 것.
"""
import re, sys, glob, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOG = os.path.join(ROOT, "superpowers/specs/2026-07-31-ui-design-decisions.md")
IDXDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))

# 색인에 문자열이 없어도 커버로 인정하는 항목 (근거 필수)
WHITELIST = {
    "AD-013": "#23(챗봇 유입비율)의 근거로 인용된 옛 AD. #23이 색인에 있어 커버.",
    "AD-040": "보존기간 법조사가 law.go.kr 403으로 막힌 '조사 차단 표식'. 결정 아님.",
    "AD-042": "보존기간 결정. ai-chatbot 색인 SD-09/G-03 §7로 내용 커버(라벨만 다름).",
    # AD-052~061 = 감사 사이클 진행기록(착수/판정/워커모델/작업본 배정). 스펙 영향 없음.
    **{f"AD-0{n}": "감사 사이클 진행기록 — 스펙 영향 없음(active-ledger.md:113~132)."
       for n in list(range(52, 62))},
    "역대조-4B": "색인이 '역대조-4·4B'(patient-app:86, ai-chatbot:248)로 축약 표기 — 커버됨.",
}

def load(path):
    return open(path, encoding="utf-8").read()

def gap_nums(text):
    """기능 갭 #NN — 단일과 범위(#A~#B)를 모두 편다."""
    s = set()
    for m in re.findall(r'#(\d{1,3})\b', text):
        s.add(int(m))
    for a, b in re.findall(r'#(\d{1,3})\s*[~\-]\s*#?(\d{1,3})', text):
        a, b = int(a), int(b)
        if a <= b <= 200:
            s.update(range(a, b + 1))
    return {n for n in s if 1 <= n <= 200}

def label_set(text, pat):
    """AD-0NN / MR2-NN / 역대조-N 등 라벨 집합. 범위 표기(AD-052~061)도 편다."""
    s = set(re.findall(pat, text))
    return s

def main():
    log = load(LOG)
    idx = "\n".join(load(f) for f in sorted(glob.glob(os.path.join(IDXDIR, "SPECINDEX-*.md"))))
    problems = []

    # ① 기능 갭 번호
    miss_gap = sorted(gap_nums(log) - gap_nums(idx))
    if miss_gap:
        problems.append(("기능 갭", [f"#{n}" for n in miss_gap]))
    print(f"① 기능 갭: 로그 {len(gap_nums(log))} / 색인 {len(gap_nums(idx))} "
          f"→ 빠진 것 {['#'+str(n) for n in miss_gap] if miss_gap else '없음 ✅'}")

    # ② 라벨 계열
    classes = {
        "AD":     r'AD-0\d{2}',
        "MR2":    r'MR2-\d{2}',
        "역대조": r'역대조-\d[A-Z]?',
        "R2":     r'R2-\d[A-Z]?',
        "SD":     r'SD-\d{2}',
    }
    for name, pat in classes.items():
        miss = sorted(label_set(log, pat) - label_set(idx, pat))
        miss = [m for m in miss if m not in WHITELIST]
        if miss:
            problems.append((name, miss))
        wl = [m for m in sorted(label_set(log, pat) - label_set(idx, pat)) if m in WHITELIST]
        note = f" (화이트리스트 제외: {wl})" if wl else ""
        print(f"② {name}: 빠진 것 {miss if miss else '없음 ✅'}{note}")

    print()
    if problems:
        print("❌ 색인이 빠뜨린 결정이 있다 — 아래를 색인에 반영하거나, 근거와 함께 WHITELIST에 등록:")
        for name, items in problems:
            print(f"   [{name}] {', '.join(items)}")
        sys.exit(1)
    print("✅ 모든 결정 번호가 색인 3개에 반영됨(화이트리스트 예외 제외).")
    sys.exit(0)

if __name__ == "__main__":
    main()
