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


def _coverage():
    """규칙 「정의·언급」 판정은 `plan-coverage-check.py`가 원본이다.

    같은 정규식을 두 파일에 복사하면 한쪽만 고쳐져 숫자가 갈라진다 —
    실제로 범위 표기(`ID~NN`) 오탐이 그런 모양이었다(2026-08-16). 그래서
    복사하지 않고 그 파일을 그대로 불러 쓴다(파일명에 `-`가 있어 import 불가).
    """
    import importlib.util
    path = pathlib.Path(__file__).with_name("plan-coverage-check.py")
    spec = importlib.util.spec_from_file_location("plan_coverage_check", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def rule_debt(plan, plan_text, spans, assigned):
    """**이미 쓴** 태스크가 빠뜨린 규칙 = 빚.

    왜 따로 세나
    -----------
    `plan-coverage-check.py`는 전체 숫자 하나(*"빠진 것 503개"*)만 말한다. 그 안에는
    **아직 안 쓴 태스크 것**(정상)과 **이미 쓴 태스크가 빠뜨린 것**(빚)이 섞여 있어,
    방금 쓴 태스크가 무엇을 흘렸는지 화면에 절대 안 보인다. 매 태스크마다 검사기를
    돌려도 늘 큰 숫자만 보이니 아무도 몰랐다.

    실제 사고(2026-08-16 발견): 핸드오프가 *"남은 유일한 빚 7개"*라고 적어 둔 사이
    이미 쓴 태스크 9개의 빚이 **101개**였다. 초기 태스크(7~10)에 몰려 있고 최근
    태스크(14·15·18)는 0 — 즉 **뒤로 갈수록 나아졌는데 앞의 것이 안 갚혔다.**

    소유 태스크는 **가장 구체적인 접두어가 이긴다**(`NAV-QUEUE-*` > `NAV-*`).
    이 규칙을 코드에 박아 둬야 세는 사람마다 숫자가 달라지지 않는다.

    ⭐⭐ **「그 태스크 본문 안에」 있는지를 본다** — 플랜 전체에서 찾으면 안 된다.
    ---------------------------------------------------------------------------
    플랜 전체를 한 덩어리로 놓고 글자를 찾으면, **남의 태스크가 인용만 해도 갚은 것으로
    세어진다.** 실제로 이 검사를 처음 붙인 날, Task 12 주석에 `TODAY-WAIT-01`을 근거로
    인용했더니 **Task 8의 빚이 저절로 줄었다**(2026-08-16). 인용은 구현이 아니다.

    같은 이유로 `TODAY-RESCHED-01`이 Task 19의 참고 문헌에 걸려 ✅로 나왔던 것이므로,
    범위 표기를 안 세는 것만으로는 절반만 막은 셈이었다. **소유 태스크의 본문 범위로
    잘라서** 봐야 끝난다.
    """
    cov = _coverage()
    area = next((a for a, p in cov.PLANS.items()
                 if pathlib.Path(p).name == plan.name), None)
    if area is None:                       # 재작성본이 아닌 플랜 — 셀 기준이 없다
        return None, [], []
    defined = cov.defined_rules(cov.area_text(cov.load(cov.BEHAVIORS), area))
    lines = plan_text.split("\n")
    body = {t: "\n".join(lines[s:e]) for t, (s, e) in spans.items()}
    mention_re = re.compile(cov.RULE_MENTION_RE)
    said = {t: set(mention_re.findall(txt)) for t, txt in body.items()}

    debt, orphan, later, elsewhere = {}, [], 0, {}
    anywhere = {r for s in said.values() for r in s}
    for rid in sorted(defined - set(cov.RULE_WHITELIST)):
        best = None
        for task, prefixes in assigned.items():
            for p in prefixes:
                if rid.startswith(f"{p}-") and (best is None or len(p) > best[1]):
                    best = (task, len(p))
        if best is None:
            # 어느 배정 표에도 안 걸린 낱개 규칙. 어딘가에 쓰였으면 넘어가고,
            # 아무 데도 없으면 「아무도 안 찾는」 것이라 따로 알린다.
            if rid not in anywhere:
                orphan.append(rid)
        elif rid in anywhere and rid not in said.get(best[0], ()):
            # ⚠️ 오탐을 만들지 않으려고 **셋째 칸**을 둔다.
            #    배정 표는 접두어 단위(`CAL-COLOR-*`)인데 실제 분담은 규칙 단위인 일이 흔하다 —
            #    플랜이 *"칠하는 쪽(CAL-COLOR-04·05·14)은 Task 14"*처럼 대놓고 나눈 경우가 있다.
            #    이걸 빚으로 세면 「없는 누락」이 쌓여 검사기를 아무도 안 믿게 된다.
            #    그렇다고 조용히 넘기면 진짜 오배정이 숨으므로, **눈으로 볼 목록**으로 남긴다.
            elsewhere.setdefault(best[0], []).append((rid, sorted(t for t in said if rid in said[t])))
        elif best[0] not in spans:
            if rid not in anywhere:
                later += 1                 # 아직 안 쓴 태스크 것 — 빚이 아니다
        elif rid not in said[best[0]]:
            debt.setdefault(best[0], []).append(rid)
    return debt, orphan, later, elsewhere


# ⚠️⚠️ 검사기 결함 6번째(2026-08-16) — **미결 경고 97건 중 44건이 오탐이었다.**
#    앞서 `확인 필요(?!한)`으로 「확인 필요한 예약」 하나만 막아 뒀는데 **너무 좁았다.**
#    「확인 필요」는 이 프로젝트에서 **두 가지 뜻**으로 쓰인다:
#      ① 진짜 미결 표시 — 상담봇 절의 「확인 필요」 71건(의도적 이월)
#      ② **화면에 찍는 라벨·본문의 뜻** — `조회 불가 \`확인 필요\`` · *"확인 필요 큐"* ·
#         *"의사 화면에 확인 필요 표시"* · *"계약 확인 필요"*
#    ②를 미결로 세면 **경고가 소음이 되고, 소음이 되면 아무도 안 본다** — 실제로
#    Task 21의 「미결 3건」은 셋 다 ②였다(`MERGE-COMPARE-02·05`·`MERGE-REVIEW-02`).
#    ⭐ 셋으로 가른다. 셋 다 **의미로** 가르는 것이지 문자열을 더 막는 것이 아니다:
#      (a) 취소선 `~~PROVISIONAL~~` = **이미 해소된 표시** — 세지 않는다
#      (b) 「확인 필요」가 **백틱 안에만** 있으면 화면 문구다(`\`확인 필요\``)
#      (c) 같은 줄에 **`FINAL`**이 있으면 그 줄의 상태는 확정이다 — 「확인 필요」는 본문의 뜻
#    ⛔ `PROVISIONAL`·`⏳`에는 (b)를 적용하지 않는다 — 그것들은 **백틱 안에 쓰는 것이 정상**이다.
STATUS_MARKER_RE = re.compile(r"PROVISIONAL|NEEDS-USER-DECISION|UNKNOWN|⏳")
LABEL_MARKER_RE = re.compile(r"확인 필요(?!한)")
BACKTICKED_RE = re.compile(r"`[^`]*`")
STRUCK_RE = re.compile(r"~~.*?~~")
RULE_ID_RE = re.compile(r"`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d+[a-z]?)`")


def line_is_unresolved(line):
    """이 규칙 행이 **아직 안 정해진** 것인가. (a)(b)(c)는 위 주석 참고."""
    live = STRUCK_RE.sub("", line)                       # (a) 취소선 = 해소됨
    if STATUS_MARKER_RE.search(live):
        return True
    if re.search(r"`FINAL`", live):                      # (c) 확정 표시가 이기다
        return False
    return bool(LABEL_MARKER_RE.search(BACKTICKED_RE.sub("", live)))  # (b) 백틱 밖에서만


def unresolved_rules(root):
    """미결 표시가 붙은 규칙 행에서 규칙 ID를 뽑는다.

    왜 필요한가
    -----------
    `PROVISIONAL`·`확인 필요` 같은 표시는 "나중에 정한다"는 뜻인데, **그 나중이
    바로 이 플랜을 쓰는 시점**이다. 그런데 화면 절을 펼쳐 규칙을 옮길 때 표시를
    못 보고 지나가면, 잠정이던 것이 확정인 양 테스트 문장이 된다.

    반대 방향의 사고도 있다: 표시가 **낡아서** 이미 해소됐는데 남아 있는 경우다.
    실제 사례 — `STAFF-*` 9건의 `PROVISIONAL` 근거가 "화면 그릇 배치가 사용자
    검토 때 뒤집힐 수 있음"인데, 그 목업(79-admin-staff.html)이 이미 2칸 구조로
    그려져 있었다. 즉 **검토가 끝났는데 표시만 남은 것**이다.

    어느 쪽이든 **태스크를 쓸 때 그 규칙 ID를 한 번은 손에 쥐어야** 한다.
    이 검사는 "쥐었는지"를 본다 — 본문에 그 ID가 나오면 통과다.
    """
    path = root / BEHAVIORS
    if not path.exists():
        return {}
    out = []
    for line in path.read_text().split("\n"):
        if not line.startswith("|") or not line_is_unresolved(line):
            continue
        if ids := RULE_ID_RE.findall(line):
            out.append(ids[0])                        # 행의 첫 ID가 그 행의 주인
    return sorted(set(out))


HANDOVERS = "docs/design/spec-index/HANDOVERS.md"
PLANS_DIR = "docs/superpowers/plans"


# ⭐⭐ 「값을 만들거나 자르는 코드」에는 **예시 테스트만으로 부족하다** (2026-08-16 신설)
#
#    갭 #127이 이렇게 나왔다 — `generate_booking_code()`가 6자리 미만을 8.7% 발급하는데,
#    **정합성 검토를 통과했고 1단계 테스트 123개도 통과**했다. 예시 하나씩 확인하는
#    테스트는 *"AB34CD가 나온다"*를 보지 *"항상 6자리인가"*를 못 본다.
#    실제로 2만 번 돌리니 5자리 8.3%, 100만 번 돌리니 **3자리까지 74개** 나왔다.
#
#    ⭐ 이럴 때 쓰는 것이 **속성 테스트**(property-based test) — 예시를 적는 대신
#    *"언제나 성립해야 하는 성질"*을 정하고 **무작위로 많이 던져** 깨지는지 본다.
#    비싸지 않다: 2만 번이 0.2초, 100만 번이 5초다.
#
#    ⛔ 아무 코드에나 하는 게 아니다. **입력이 무한히 많아 사람이 다 못 적는 것**만이다:
#       ✅ 무작위로 값 생성 · 반올림/버림/나눗셈 · 글자 자르기(마스킹·형식)
#       ❌ 권한 규칙 · 상태 전이 · 화면 동작 — 경우의 수가 손에 꼽혀 예시가 더 정확하다
VALUE_GEN_RE = re.compile(r"random\(|random\.|::int|floor\(|\bround\(|ceil\(|trunc\(|\bmask_\w+|padStart")
PROPERTY_TEST_RE = re.compile(r"generate_series\(1,\s*\d{4,}|range\(\s*\d{4,}|@given|속성 테스트")


#    ⛔ **`Consumes:` 줄은 세지 않는다** — 거기 적힌 것은 이 태스크가 *만드는* 것이
#       아니라 **남이 만든 것을 부른다**는 선언이다. 속성 테스트를 질 곳은 만든 쪽이다.
#       (실제로 `mask_phone`을 Task 6이 만들고 13·21이 부르기만 하는데 셋 다 경고가 떴다.)
CONSUMES_LINE_RE = re.compile(r"^\s*[-*]?\s*(Consumes|소비)\s*:")


def property_test_gaps(lines, spans):
    """값을 만들거나 자르는 코드를 가진 태스크 중 **속성 테스트가 없는** 것.

    빚으로 세지 않고 ⚠️ 경고로만 낸다 — 신호가 소비(남의 함수를 부르기만)일 수도
    있어서 사람이 한 번 봐야 한다. 다만 **보긴 봐야 한다**: 이 검사가 없으면
    "값을 만드는 코드였다"는 사실 자체가 태스크를 쓰고 나면 사라진다.
    """
    out = {}
    for task, (start, end) in spans.items():
        owned = [ln for ln in lines[start:end] if not CONSUMES_LINE_RE.match(ln)]
        body = "\n".join(owned)
        signals = sorted(set(VALUE_GEN_RE.findall(body)))
        if signals and not PROPERTY_TEST_RE.search(body):
            out[task] = signals
    return out


def pending_handovers(root):
    """다른 플랜으로 넘긴 미결 중, **받을 플랜에 아직 안 들어간 것**.

    왜 필요한가
    -----------
    한 플랜을 쓰다가 "이건 저쪽 플랜에서 정하는 게 맞다"고 넘기는 순간,
    그 규칙은 **아무 검사기의 시야에도 없는 상태**가 된다. 넘긴 쪽 플랜은
    이미 다 썼으니 안 보고, 받을 쪽 플랜은 아직 안 썼으니 모른다.

    실제 사고(2026-08-15): `SUPPORT-CAL-*` 14개가 어느 배정 표에도 없었다.
    접두어가 `CAL-`이 아니라 배정 표의 `CAL-*`에 안 걸렸고, 규칙 문서상
    위치가 상담봇 절이라 staff-web 커버리지도 세지 않았다. 그런데 그리는
    화면은 `/calendar`였다.

      ⭐ 교훈: 넘긴 것은 **원장에 적고 기계가 회수**한다. 문서에 적은 약속은
         읽는 사람이 없으면 없는 것과 같다.

    받을 플랜에 그 규칙 ID가 나타나면 자동으로 조용해진다.
    """
    path = root / HANDOVERS
    if not path.exists():
        return []
    out = []
    for line in path.read_text().split("\n"):
        if not line.startswith("|"):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) < 4 or not re.match(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d+[a-z]?$", c[0]):
            continue
        rule_id, came_from, target, what = c[0], c[1], c[2], c[3]
        # ⚠️ 파일 이름으로 잡으면 재작성 때 낡는다(`2026-07-27-*` → `2026-08-15-*`).
        #    영역 이름으로 glob해 **그 영역의 모든 플랜**을 본다.
        plans = sorted((root / PLANS_DIR).glob(f"*{target}*.md"))
        if any(rule_id in p.read_text() for p in plans):
            continue                                   # 받았다 — 조용해진다
        out.append((rule_id, came_from, target, what, bool(plans)))
    return out


AREA_SPAN = {                                  # 영역 경계(절 제목). plan-coverage-check와 같은 기준
    "staff-web": ("# 화면 동작 명세서", "# 환자 앱"),
}
DEFINED_RE = re.compile(r"^\| `([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)-\d+[a-z]?`")


def unassigned_prefixes(root, assigned, plan_text, area="staff-web"):
    """규칙 문서에 **정의된** 접두어 중, 어느 태스크에도 배정되지 않은 것.

    왜 필요한가
    -----------
    앞의 `missing` 검사는 "배정 표에 있는데 본문에 없는 것"을 잡는다. 그런데
    **배정 표에 아예 없는** 접두어는 그 검사의 시야 밖이다 — 아무도 안 찾는다.

    실제 사고 2회(2026-08-15):
      - `SUPPORT-CAL-*` 14개 — 접두어가 `CAL-`이 아니라 배정 표의 `CAL-*`에 안 걸렸다.
      - `SCHED-SAVE-*`·`SCHED-EXC-*`·`SCHED-SLOT-*` 35개 — 표에는 `SCHED-TAB/GRID/WEEK-*`와
        `SCHED-DEPT-*`만 적혀 있어 나머지 세 계열이 통째로 무주공산이었다.

      ⭐ 교훈: 「배정 표에 적는 것」 자체를 사람이 빠뜨린다. 규칙 문서를 기준으로
         역방향 대조해야 잡힌다.
    """
    path = root / BEHAVIORS
    if not path.exists() or area not in AREA_SPAN:
        return []
    lines = path.read_text().split("\n")
    start_mark, end_mark = AREA_SPAN[area]
    s = next((i for i, l in enumerate(lines) if l.startswith(start_mark)), 0)
    e = next((i for i, l in enumerate(lines) if i > s and l.startswith(end_mark)), len(lines))

    defined = {}                                   # 접두어 → 정의된 규칙 수
    for l in lines[s:e]:
        if m := DEFINED_RE.match(l):
            defined[m.group(1)] = defined.get(m.group(1), 0) + 1

    all_assigned = {p for ps in assigned.values() for p in ps}
    # 배정 표가 `CAL-*`처럼 짧게 적혀 있어도 `CAL-SLOT`은 덮인 것으로 본다.
    def covered(prefix):
        return any(prefix == a or prefix.startswith(f"{a}-") for a in all_assigned)

    # ⚠️ 표에 없어도 **어느 태스크 본문이 이미 쓰고 있으면** 위험이 아니다(표기 정리 대상일 뿐).
    #    진짜 위험은 「표에도 없고 본문 어디에도 없는」 것 — 그건 아무도 손대지 않았다는 뜻이다.
    return sorted(((p, n) for p, n in defined.items()
                   if not covered(p) and f"{p}-" not in plan_text),
                  key=lambda x: -x[1])


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
    unresolved = unresolved_rules(root)

    missing, pending, untouched = {}, {}, {}
    for task in sorted(assigned):
        if task not in spans:                      # 아직 안 쓴 태스크
            risky = sorted(assigned[task] & globals_)
            ahead = [rid for rid in unresolved
                     if any(rid.startswith(f"{p}-") for p in assigned[task])]
            if risky or ahead:
                pending[task] = (risky, sorted(set(ahead)))
            continue
        start, end = spans[task]
        body = "\n".join(lines[start:end])
        gaps = [p for p in sorted(assigned[task]) if f"{p}-" not in body]
        if gaps:
            missing[task] = gaps
        # 이 태스크가 담당하는 접두어의 미결 규칙 중, 본문이 한 번도 안 짚은 것
        skipped = [rid for rid in unresolved
                   if any(rid.startswith(f"{p}-") for p in assigned[task])
                   and rid not in body]
        if skipped:
            untouched[task] = sorted(set(skipped))

    print(f"플랜: {plan.name} · 작성된 태스크 {len(spans)}개 · 배정된 태스크 {len(assigned)}개\n")

    if missing:
        print("❌ 표에는 있는데 본문에 없는 접두어:")
        for t, ps in sorted(missing.items()):
            mark = " ⭐전역규칙" if set(ps) & globals_ else ""
            print(f"   Task {t:<3} {', '.join(ps)}{mark}")
    else:
        print("✅ 배정된 접두어가 모두 본문에 있다.")

    if untouched:
        print("\n⚠️  담당 절에 **미결 표시**가 붙은 규칙인데 본문이 한 번도 안 짚었다:")
        for t, ids in sorted(untouched.items()):
            head = ", ".join(ids[:6]) + (f" 외 {len(ids) - 6}건" if len(ids) > 6 else "")
            print(f"   Task {t:<3} {len(ids):>2}건 — {head}")
        print("   → 「나중에 정한다」의 그 나중이 지금이다. 각각 ①지금 정할 것 ②이미 해소돼")
        print("     표시만 낡은 것 ③진짜 이월할 것 중 무엇인지 태스크 본문에 적을 것.")
        print("     ⭐ 근거가 「목업/검토 때 뒤집힐 수 있음」이면 그 목업이 있는지 먼저 볼 것 —")
        print("       있으면 낡은 표시다(실제 사례: STAFF-* 9건 ↔ 목업 79).")

    debt, loose, later, elsewhere = rule_debt(plan, "\n".join(lines), spans, assigned)
    if debt:
        total = sum(len(v) for v in debt.values())
        print(f"\n💸 **이미 쓴 태스크가 빠뜨린 규칙 {total}개** (태스크 {len(debt)}개) "
              f"— 아직 안 쓴 태스크 몫 {later}개는 뺀 수다:")
        for t, ids in sorted(debt.items(), key=lambda kv: -len(kv[1])):
            head = ", ".join(ids[:5]) + (f" 외 {len(ids) - 5}건" if len(ids) > 5 else "")
            print(f"   Task {t:<3} {len(ids):>3}개 — {head}")
        print("   → 태스크 본문에 `test('[규칙ID] …')`로 넣으면 사라진다.")
        print("     ⚠️ 「근거 원문」 줄에 적는 것은 구현이 아니다 — 그래서 이 수에 남아 있다.")
    elif debt is not None:
        print("\n✅ 이미 쓴 태스크가 빠뜨린 규칙이 없다.")
    if elsewhere:
        total = sum(len(v) for v in elsewhere.values())
        print(f"\n🔀 배정 표의 주인과 **다른 태스크 본문**에 적힌 규칙 {total}개 — 대부분 의도한 분담이다:")
        for t, items in sorted(elsewhere.items(), key=lambda kv: -len(kv[1])):
            head = ", ".join(f"{r}→T{'·'.join(map(str, w))}" for r, w in items[:4])
            print(f"   표상 주인 Task {t:<3} {len(items):>3}개 — {head}"
                  + (f" 외 {len(items) - 4}건" if len(items) > 4 else ""))
        print("   → 배정 표가 접두어 단위(`CAL-COLOR-*`)라 규칙 단위 분담은 못 담는다.")
        print("     빚으로 세면 「없는 누락」이 쌓이므로 세지 않되, **오배정이 숨을 수 있어** 눈으로 볼 것.")

    if loose:
        print(f"\n🕳  **어느 배정 표에도 없는 낱개 규칙 {len(loose)}개** — 접두어 단위 검사의 시야 밖이다:")
        print("   " + ", ".join(loose[:20]) + (f" 외 {len(loose) - 20}건" if len(loose) > 20 else ""))

    if prop := property_test_gaps(lines, spans):
        print(f"\n🎲 **값을 만들거나 자르는 코드인데 속성 테스트가 없는 태스크 {len(prop)}개**:")
        for t, sig in sorted(prop.items(), key=lambda kv: int(kv[0])):
            print(f"   Task {t:<3} 신호: {', '.join(sig)}")
        print("   → 예시 하나씩 확인하는 테스트는 「이 입력에서 맞다」를 볼 뿐 **「항상 맞다」를 못 본다.**")
        print("     갭 #127이 그렇게 샜다 — 정합성 검토도 테스트 123개도 통과했는데")
        print("     2만 번 돌리니 8.7%가 규격 미달이었다(0.2초 걸렸다).")
        print("     ⚠️ 남의 함수를 **부르기만** 하는 태스크면 경고를 무시해도 된다. 눈으로 한 번 볼 것.")

    if pending:
        print("\n📋 아직 안 쓴 태스크 — 쓰기 전에 알고 있어야 할 것:")
        for t, (risky, ahead) in sorted(pending.items()):
            bits = []
            if risky:
                bits.append(f"⭐전역규칙 {', '.join(risky)}(빠지기 쉬움)")
            if ahead:
                head = ", ".join(ahead[:4]) + (f" 외 {len(ahead) - 4}건" if len(ahead) > 4 else "")
                bits.append(f"미결 {len(ahead)}건 — {head}")
            print(f"   Task {t:<3} " + " · ".join(bits))
        print("   → 전역 규칙은 공용 부품 태스크가 소유하고 화면은 소비만 하게 배정할 것.")
        print("   → 미결은 「나중에 정한다」의 그 나중이 지금이다. ①지금 정할 것 ②이미 해소돼")
        print("     표시만 낡은 것 ③진짜 이월할 것으로 갈라 본문에 적을 것. 근거가 「목업 검토 때")
        print("     뒤집힐 수 있음」이면 그 목업이 있는지 먼저 볼 것(있으면 낡은 표시다).")

    if orphans := unassigned_prefixes(root, assigned, "\n".join(lines)):
        total = sum(n for _, n in orphans)
        print(f"\n🕳  **표에도 본문에도 없는 접두어** {len(orphans)}계열 · 규칙 {total}개 — 아무도 안 건드렸다:")
        for p, n in orphans[:12]:
            print(f"   {p + '-*':<24} {n:>3}개")
        if len(orphans) > 12:
            print(f"   … 외 {len(orphans) - 12}계열")
        print("   → 배정 표에 없으면 위 「본문에 없는 접두어」 검사의 시야 밖이라 **아무도 안 찾는다.**")
        print("     실제로 SUPPORT-CAL-*(14개)·SCHED-SAVE/EXC/SLOT-*(35개)이 이렇게 빠져 있었다.")
        print("     담당 태스크를 정해 「활성 route 정본」·「File Structure」 표에 적을 것.")

    if handovers := pending_handovers(root):
        print("\n📦 다른 플랜으로 **넘긴 미결** — 받을 플랜에 아직 안 들어갔다:")
        for rule_id, came_from, target, what, plan_exists in handovers:
            mark = "" if plan_exists else "  ⚠️ 그 영역 플랜 파일이 아직 없다"
            print(f"   {rule_id:<22} {came_from} → {target}{mark}")
            print(f"      정할 것: {what[:96]}{'…' if len(what) > 96 else ''}")
        print("   → 원장은 `docs/design/spec-index/HANDOVERS.md`. 받을 플랜을 쓸 때 이 규칙을")
        print("     본문에 넣으면 이 경고가 저절로 사라진다. **원장에서 지우지 말 것** —")
        print("     지우면 「넘겼다는 사실」이 사라져 다음 사람이 처음부터 다시 발견해야 한다.")

    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
