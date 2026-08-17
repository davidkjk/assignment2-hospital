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
        return None, [], 0, {}             # ⚠️ 반환 개수를 부르는 쪽과 맞춘다(3개면 터진다)
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


# ─────────────────────────────────────────────────────────────────────────────
# 🏷 플랜의 SQL이 **이름으로 가리키는 기존 DB 객체**가 실제로 있나
#
#    왜 필요한가
#    -----------
#    `drop policy if exists "없는_이름" on t`는 **오류를 내지 않는다.** 조용히 통과한다.
#    그런데 RLS 정책은 여러 개가 OR로 합쳐지므로, 지우려던 옛 정책이 살아남으면
#    새 정책을 아무리 좁게 만들어도 **권한이 그대로 열려 있다.**
#
#    실제 사례(2026-08-16): Task 1이 `staff_can_read_questionnaire_responses`를 지우려 했는데
#    00007의 진짜 이름은 `assigned_doctor_can_read_responses`였다. 마이그레이션은 성공하고,
#    테스트도 「관리자가 못 읽는다」를 확인하지만 — 그 테스트가 없었다면 **관리자가 문진 답변을
#    계속 읽는 상태로 배포됐다.** 결정 #14/AD-050(USER-FINAL)이 통째로 무력화된다.
#
#    ⚠️ **이름 없이 선언된 제약은 PostgreSQL이 이름을 지어준다** — 그래서 마이그레이션 파일을
#    문자열로 훑는 것만으로는 「없다」는 오판이 난다. 자동 생성 규칙을 계산해서 함께 본다:
#       `unique (a, b)`  →  `{테이블}_{a}_{b}_key`
#       컬럼의 `check (…)` →  `{테이블}_{컬럼}_check`
#       `primary key`     →  `{테이블}_pkey`
DROP_TARGET_RE = re.compile(
    r"drop\s+(policy|constraint|trigger|index)\s+(if\s+exists\s+)?"
    r'"?([a-z_][a-z0-9_]*)"?',
    re.I,
)
CREATE_TABLE_RE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\((.*?)\n\);",
    re.I | re.S,
)


def _autogenerated_names(sql: str) -> set[str]:
    """PostgreSQL이 스스로 붙였을 제약 이름들을 계산한다."""
    names: set[str] = set()
    for table, body in CREATE_TABLE_RE.findall(sql):
        names.add(f"{table}_pkey")
        for line in body.split("\n"):
            line = line.strip().rstrip(",")
            if not line:
                continue
            # 표 수준 제약: `unique (a, b)`
            m = re.match(r"unique\s*\(([^)]*)\)", line, re.I)
            if m:
                cols = "_".join(c.strip() for c in m.group(1).split(","))
                names.add(f"{table}_{cols}_key")
                continue
            # 컬럼 수준: `col type ... check (...)` / `... unique`
            m = re.match(r"([a-z_][a-z0-9_]*)\s+\w", line, re.I)
            if m:
                col = m.group(1)
                if re.search(r"\bcheck\s*\(", line, re.I):
                    names.add(f"{table}_{col}_check")
                if re.search(r"\bunique\b", line, re.I):
                    names.add(f"{table}_{col}_key")
    return names


def sql_target_gaps(plan_text: str, root):
    """플랜이 지우려는 이름 중 **어디에서도 근거를 찾을 수 없는 것.**

    근거로 인정하는 것 셋: ①실제 마이그레이션 파일에 그 이름이 적혀 있다
    ②마이그레이션의 이름 없는 제약에서 자동 생성될 이름이다 ③플랜 자신이 앞서 만든다.
    """
    mig_dir = root / "supabase" / "migrations"
    if not mig_dir.is_dir():
        return []
    applied = "\n".join(f.read_text() for f in sorted(mig_dir.glob("*.sql")))
    known = set(re.findall(r"[a-z_][a-z0-9_]{6,}", applied)) | _autogenerated_names(applied)

    out = []
    for kind, if_exists, name in DROP_TARGET_RE.findall(plan_text):
        if name in ("if", "exists") or name in known:
            continue
        # 플랜 자신이 만드는 것인가
        if re.search(
            r'(create\s+(policy|trigger|index|unique\s+index)\s+"?' + re.escape(name)
            + r'|add\s+constraint\s+' + re.escape(name) + r')',
            plan_text, re.I,
        ):
            continue
        out.append((kind.lower(), name, bool(if_exists)))
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


def phantom_prefixes(root, assigned):
    """🔎 배정 표에 적혀 있는데 **규칙 문서에 규칙이 0개**인 접두어.

    왜 필요한가
    -----------
    바로 위 `unassigned_prefixes`는 **규칙 → 표** 방향이다. 그 반대 방향
    (**표 → 규칙**)은 지금까지 아무도 안 봤다. 그래서 표에 **지어낸 이름**을
    적어둬도 초록불이 그대로 켜져 있다.

    실제 사례(2026-08-16): 배정 표의 Task 23 칸에 `SCHED-OFF-*`라고 적혀 있었는데
    그런 접두어는 **규칙 문서·요구사항 어디에도 없었다**(0개). 옛 플랜의 태스크
    제목(*"정기 휴진 슬롯 생성"*)을 보고 **접두어를 지어내 적은 것**이다.

    ⚠️ 이게 왜 위험한가 — 그 태스크를 쓰려고 앉은 사람이 `SCHED-OFF-*`를 찾다가
       **0건이 나오면 「할 일이 없구나」로 읽는다.** 실제로는 요구사항 3.7의
       「휴진일」이 서버 층에서 통째로 빠져 있었다(`is_day_off`를 읽는 곳이 0곳).
    """
    path = root / BEHAVIORS
    if not path.exists():
        return []
    defined = set()
    for l in path.read_text().split("\n"):
        if m := DEFINED_RE.match(l):
            defined.add(m.group(1))
    out = []
    for task, prefixes in assigned.items():
        for p in sorted(prefixes):
            # 짧게 적은 것(`CAL-*`)은 하위 계열(`CAL-SLOT`)이 있으면 실재한다
            if not any(d == p or d.startswith(f"{p}-") for d in defined):
                out.append((task, p))
    return sorted(out)


COLUMN_RE = re.compile(
    r"alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+"
    r"add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)",
    re.I,
)


def unread_columns(root, plan_text):
    """🧱 마이그레이션이 **나중에 덧붙인 칸** 중, 플랜에도 코드에도 **읽는 곳이 없는** 것.

    왜 필요한가
    -----------
    규칙 커버리지 검사기는 **규칙 문서에 있는 것**만 센다. 그래서 요구사항이
    **화면 규칙으로만** 옮겨졌고 **서버 층 규칙이 없으면**, 그 기능이 통째로
    빠져도 **100% 초록불**이 나온다.

    실제 사례(2026-08-16): `00009`가 `doctor_schedule_rules.is_day_off`(정기 휴진)를
    만들어 뒀는데 **읽는 곳이 한 곳도 없었다.** 규칙(`SCHED-WEEK-04`)은 화면 층
    ("스위치를 끄면 그 줄이 잠긴다")만 있어서 커버리지는 초록불이었고, 서버는
    **휴진 요일에도 예약 자리를 계속 만들고 있었다** — 환자가 쉬는 날에 예약을 잡는다.

    ⭐ 「나중에 덧붙인 칸」만 보는 이유: `create table`의 칸까지 세면 수백 개라
       경고가 소음이 된다. `alter table … add column`은 **기존 것에 새 개념을
       얹은 것**이라 **읽는 곳이 반드시 있어야 한다** — 없으면 그게 곧 미완성이다.
    """
    mig_dir = root / "supabase" / "migrations"
    if not mig_dir.is_dir():
        return []
    added = []                                  # (표, 칸, 마이그레이션)
    for f in sorted(mig_dir.glob("*.sql")):
        for table, col in COLUMN_RE.findall(f.read_text()):
            added.append((table, col, f.name))

    haystack = [plan_text]
    for d in ("backend/app", "frontend/src"):
        p = root / d
        if p.is_dir():
            for f in list(p.rglob("*.py")) + list(p.rglob("*.ts")) + list(p.rglob("*.tsx")):
                haystack.append(f.read_text(errors="ignore"))
    # 마이그레이션 자신은 근거가 아니다 — 만든 곳이지 읽는 곳이 아니다
    blob = "\n".join(haystack)
    return [(t, c, m) for t, c, m in added if c not in blob]


def undefined_consumes(lines, spans):
    """🔗 태스크의 `Consumes:`에 적혔는데 **어느 태스크의 `Produces:`에도 없는** 이름.

    왜 필요한가
    -----------
    태스크는 서로를 **이름으로만** 연결한다(`Consumes:`/`Produces:`). 그런데 그
    이름이 실재하는지 대조하는 단계가 없어서, **부르는 쪽만 있고 만드는 쪽이 없는**
    함수가 조용히 생긴다. 구현자는 자기 태스크만 보므로 **그 자리에서 멈춘다.**

    ⚠️ 반대 방향(만드는 쪽은 있는데 아무도 안 부름)은 경고하지 않는다 —
       뒤 태스크가 아직 안 쓰였을 뿐인 경우가 대부분이라 소음이 된다.

    ⚠️⚠️ **오탐을 먼저 죽인다.** 처음 만들었을 때 55건이 나왔고 그 대부분이
       ①표 이름(`appointments`) ②1단계가 이미 만든 것(`acquire_as`) ③경로 조각
       (`backend/app/...`의 `backend`)이었다. **소음이 되면 아무도 안 본다** —
       그래서 근거를 셋 더 인정한다: 마이그레이션의 표·함수 · 1단계 코드 · 플랜이
       스스로 만드는 파일. 남는 것만이 **진짜로 아무 데도 없는 이름**이다.
    """
    # 백틱 안이 「이름」 또는 「이름(…)」인 것만. 경로 조각(`backend/app/x.py`)은 버린다.
    #   `resolve_day(doctor_id, date) -> DaySchedule` → resolve_day  (뒤에 서명이 붙어도 된다)
    #   `backend/app/x.py`                            → 버린다      (경로 조각)
    NAME = re.compile(r"^([a-z_][a-z0-9_]{2,})(?![a-z0-9_/.])")

    def names_in(line):
        out = set()
        for span in re.findall(r"`([^`]+)`", line):
            if m := NAME.match(span.strip()):
                out.add(m.group(1))
        return out

    produced, consumed = set(), {}
    for task, (s, e) in spans.items():
        in_produces = False
        for l in lines[s:e]:
            if l.startswith("- Produces:"):
                in_produces, _ = True, produced.update(names_in(l))
            elif l.startswith("- Consumes:"):
                in_produces = False
                consumed.setdefault(task, set()).update(names_in(l))
            elif in_produces and l.startswith("  "):      # Produces 블록의 이어지는 줄
                produced.update(names_in(l))
            elif l.strip() and not l.startswith(" "):
                in_produces = False
    return produced, consumed


def _already_exists(root, plan_text):
    """1단계 코드·마이그레이션·플랜이 만드는 것 — 「없는 이름」 판정에서 빼는 근거."""
    known = set()
    mig = root / "supabase" / "migrations"
    if mig.is_dir():
        sql = "\n".join(f.read_text() for f in sorted(mig.glob("*.sql")))
        known.update(re.findall(r"[a-z_][a-z0-9_]{2,}", sql))
    code = root / "backend" / "app"
    if code.is_dir():
        for f in code.rglob("*.py"):
            known.update(re.findall(r"[a-z_][a-z0-9_]{2,}", f.read_text(errors="ignore")))
    # 플랜이 스스로 정의하는 것(`def name(` · `const name =` · `function name(`)
    known.update(re.findall(r"(?:def|function|const|let)\s+([a-z_][a-z0-9_]{2,})", plan_text))
    # 플랜이 만드는 표(아직 파일이 없는 신설 마이그레이션)
    known.update(re.findall(r"create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]{2,})",
                            plan_text, re.I))
    # ⭐ `- Create:` 줄에 적힌 이름도 「만드는 쪽」이다 — Produces 블록에만 적으라는
    #    규칙이 없으므로 여기서 세지 않으면 오탐이 된다(실제로 `encode_cursor`가 그랬다).
    for l in plan_text.split("\n"):
        if l.startswith("- Create:") or l.startswith("- Modify:"):
            for span in re.findall(r"`([^`]+)`", l):
                if m := re.match(r"^([a-z_][a-z0-9_]{2,})(?![a-z0-9_/.])", span.strip()):
                    known.add(m.group(1))
    return known


def undefined_consumes_gaps(root, lines, spans, plan_text):
    produced, consumed = undefined_consumes(lines, spans)
    known = produced | _already_exists(root, plan_text)
    out = {}
    for task, names in consumed.items():
        gaps = sorted(n for n in names if n not in known)
        if gaps:
            out[task] = gaps
    return out


SERVER_SEG = {"SRV", "IMPL", "CALC", "SLOT", "SAVE", "LOG", "API", "DATA", "STORE", "AUDIT"}
SERVER_TEXT = re.compile(r"서버|저장|판정|트리거|마이그레이션|RLS|쿼리|정책|만들지 않|생성하지")
COL_TYPES = r"(?:uuid|text|boolean|int|integer|timestamptz|date|time|numeric|jsonb|smallint)"


def screen_only_columns(root):
    """🧩 **동작 명세가 화면 층만 적어 둔 DB 칸.**

    왜 필요한가 — ⭐ 이것이 오늘 사고들의 **뿌리**다
    -------------------------------------------------
    동작 명세는 「화면이 무엇을 보여주나」를 적는다. 그런데 어떤 규칙은 **화면 밖에
    결과가 있다** — `SCHED-WEEK-04`(*"휴진 스위치를 끄면 그 줄이 잠긴다"*)가 사실이려면
    **서버가 그 요일에 예약 자리를 만들지 않아야** 한다. 그 문장이 명세에 없으면,
    플랜은 명세를 근거로 쓰이므로 **서버 층이 통째로 빠진 채 규칙 커버리지 100%**가 된다.

    실제 사례(2026-08-16): `is_day_off`를 가리키는 규칙은 셋인데(`SCHED-GRID-04`·
    `SCHED-WEEK-04`·`SCHED-EXC-06`) **전부 화면 규칙**이었다. 그래서 재작성된 플랜
    9,480줄에 `is_day_off`가 **0회** 등장했고, 화면은 스위치를 잠그는데 서버는
    휴진 요일에도 자리를 계속 만들고 있었다.

    ⚠️ **계열 단위로는 안 잡힌다** — `SCHED`는 서버 층 규칙이 43%나 있는데도
       휴진만 빠졌다. 그래서 **칸 하나 단위**로 본다.

    📌 조인 키(`doctor_id`·`staff_id`)나 흔한 낱말(`reason`)은 오탐이다 — 눈으로 거른다.
    """
    beh = root / BEHAVIORS
    mig = root / "supabase" / "migrations"
    if not beh.exists() or not mig.is_dir():
        return []
    sql = "\n".join(f.read_text() for f in sorted(mig.glob("*.sql")))
    cols = set(re.findall(rf"^\s{{2,}}([a-z_][a-z0-9_]{{4,}})\s+{COL_TYPES}", sql, re.M))
    cols |= set(re.findall(rf"add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]{{4,}})\s+{COL_TYPES}",
                           sql, re.I))
    rows = [l for l in beh.read_text().split("\n")
            if re.match(r"^\| `[A-Z][A-Z0-9-]*-\d+[a-z]?`", l)]

    def is_server(line):
        rid = re.match(r"^\| `([A-Z][A-Z0-9-]*-\d+[a-z]?)`", line).group(1)
        return bool(set(rid.split("-")[1:-1]) & SERVER_SEG) or bool(SERVER_TEXT.search(line))

    out = []
    for c in sorted(cols):
        hits = [l for l in rows if re.search(rf"\b{c}\b", l)]
        if hits and not any(is_server(l) for l in hits):
            ids = [re.match(r"^\| `([A-Z][A-Z0-9-]*-\d+[a-z]?)`", l).group(1) for l in hits]
            out.append((c, ids))
    return out


OLD_PLANS = {                                  # 재작성본 → 그 입력이 된 옛 플랜
    "2026-08-15-staff-web.md": "2026-07-27-staff-web.md",
}

# 2026-08-16 전수 대조 결과 — 옛 이름 → 재작성본에서 그 일을 맡은 것.
# ⭐ 이름이 바뀐 것까지 매번 출력하면 **소음이 되어 아무도 안 본다.** 한 번 눈으로
#    확인한 것은 여기 적어 재우고, **새로 생긴 손실만** 화면에 남긴다.
# ⚠️ 여기 적는 것은 「확인했다」는 뜻이다 — 후계자 이름을 **실제로 새 플랜에서 보고** 적을 것.
RENAMED_IN_REWRITE = {
    "_desired_slots_for_range": "regenerate_slots",
    "create_phrase": "Task 3 진료문구 서비스",
    "create_schedule_exception": "upsert_doctor_exception",
    "list_schedule_exceptions": "resolve_day · upsert_doctor_exception",
    "list_schedule_rules": "list_week_rules",
    "preview_rule_change": "regenerate_slots(dry_run) · list_affected_appointments",
    "list_active_doctors": "GET /doctors (Task 19·17)",
    "list_calendar_slots": "GET /calendar (Task 13 — 2026-08-16 신설)",
    "get_queue_today": "GET /queue (Task 13)",
    "get_patient_detail": "GET /patients/{id} (Task 13)",
    "get_patient_medical_history": "GET /patients/{id}/medical-records (Task 13)",
    "get_appointment_questionnaire": "GET /appointments/{id}/questionnaire (Task 13)",
    "questionnaire_history": "GET /admin/questionnaires/versions/{id} (Task 22)",
    "get_template": "GET /admin/questionnaires/{department_id} (Task 22)",
    "list_templates": "〃",
    "upsert_template": "Task 22 불변 버전 저장(00030)",
    "patient_phone": "GET /patients/{id}/contact (Task 6 — phone_reveal 기록)",
    # ⛔ 아래 둘은 **일부러 없앤 것** — Task 16(/cancellation-requests) 화면 폐지(갭 #113)
    "approve_cancellation_request": "⛔ 폐기(Task 16 결번)",
    "list_cancellation_requests": "⛔ 폐기(Task 16 결번)",
    "reject_cancellation_request": "⛔ 폐기(Task 16 결번)",
}


def lost_in_rewrite(root, plan, plan_text):
    """♻️ **옛 플랜이 만들던 것 중 재작성본에서 사라진 이름.**

    왜 필요한가
    -----------
    재작성의 근거는 **규칙 문서**다. 그런데 규칙은 **화면이 무엇을 하는가**를 적지
    **배관(서비스 함수)**을 적지 않는다. 그래서 규칙 기준으로 다시 쓰면 **화면은
    남고 배관이 조용히 빠진다** — 규칙 커버리지는 100%인 채로.

    실제 사례(2026-08-16): 옛 Task 2의 `reschedule_appointment`(예약을 **실제로 옮기는**
    함수)가 재작성본에서 통째로 사라졌다. 남아 있던 것은 도장(`action='rescheduled'`)과
    라우터(`POST /appointments/{id}/reschedule`)뿐이라, **누르면 아무 일도 안 나는
    [재예약] 버튼**이 될 뻔했다. 규칙에는 *"[재예약]은 캘린더 패널로 보낸다"*까지만
    있었기 때문이다.

    ⚠️ 「지운 것」과 「흘린 것」은 다르다 — 일부러 폐기한 것은 재작성본이 **취소선이나
       ⛔로 언급**하므로 걸리지 않는다. 이름조차 안 나오는 것만 남는다.
    """
    old_name = OLD_PLANS.get(plan.name)
    if not old_name:
        return []
    old = plan.parent / old_name
    if not old.exists():
        return []
    made = set()
    for l in old.read_text().split("\n"):
        if l.startswith("- Produces:") or l.startswith("- Interfaces:"):
            for span in re.findall(r"`([^`]+)`", l):
                # `app.services.x.reschedule_appointment(...)` → 마지막 마디를 본다
                head = span.strip().split("(")[0].split(".")[-1]
                if re.fullmatch(r"[a-z_][a-z0-9_]{5,}", head):
                    made.add(head)
    known = (set(re.findall(r"[a-z_][a-z0-9_]{5,}", plan_text))
             | _already_exists(root, plan_text)
             | set(RENAMED_IN_REWRITE))          # 한 번 눈으로 확인한 것은 재운다
    return sorted(made - known)


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

    if sqlgaps := sql_target_gaps("\n".join(lines), root):
        print(f"\n🏷 **실제 DB에 없는 이름을 지우려는 SQL {len(sqlgaps)}건**:")
        for kind, name, if_exists in sqlgaps:
            quiet = "  ⚠️ `if exists`라 **오류 없이 조용히 통과한다**" if if_exists else ""
            print(f"   drop {kind:<10} `{name}`{quiet}")
        print("   → 마이그레이션 파일에도, 자동 생성될 이름에도, 플랜이 만드는 것에도 없다.")
        print("     ⚠️ **RLS 정책은 OR로 합쳐진다** — 지우려던 옛 정책이 살아남으면 새 정책을")
        print("     아무리 좁혀도 권한이 그대로 열려 있다. 마이그레이션은 성공했다고 뜬다.")
        print("     실제 사례: Task 1이 AD-050(관리자 문진 답변 차단)을 이렇게 통째로 놓칠 뻔했다.")

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

    if phantoms := phantom_prefixes(root, assigned):
        print(f"\n🔎 **배정 표에 적혔는데 규칙이 0개인 접두어 {len(phantoms)}건** — 지어낸 이름이다:")
        for t, p in phantoms:
            print(f"   Task {t:<3} {p}-*")
        print("   → 지금까지 검사는 「규칙 → 표」 한 방향뿐이라 **반대 방향이 뚫려 있었다.**")
        print("     ⚠️ 그 태스크를 쓰려는 사람이 접두어를 찾다 0건을 보면 **「할 일이 없다」로 읽는다.**")
        print("     실제 사례: `SCHED-OFF-*`(Task 23) — 요구사항 3.7 「휴진일」의 서버 층이")
        print("     통째로 빠져 있었는데 표만 보면 담당자가 있는 것처럼 보였다.")

    if cols := unread_columns(root, "\n".join(lines)):
        print(f"\n🧱 **만들어 두고 아무도 읽지 않는 칸 {len(cols)}개** — 칸만 있고 쓰는 곳이 없다:")
        for table, col, mig in cols:
            print(f"   {table}.{col:<28} ({mig})")
        print("   → 규칙 커버리지는 **규칙 문서에 있는 것**만 센다. 요구사항이 **화면 규칙으로만**")
        print("     옮겨졌으면 서버 층이 통째로 빠져도 **100% 초록불**이다.")
        print("     실제 사례: `is_day_off`(정기 휴진) — 화면은 스위치를 잠그는데 서버는")
        print("     **휴진 요일에도 예약 자리를 계속 만들고 있었다.**")

    if uc := undefined_consumes_gaps(root, lines, spans, "\n".join(lines)):
        total = sum(len(v) for v in uc.values())
        print(f"\n🔗 **부르는 쪽만 있고 만드는 쪽이 없는 이름 {total}개**:")
        for t, names in sorted(uc.items()):
            head = ", ".join(names[:6]) + (f" 외 {len(names) - 6}건" if len(names) > 6 else "")
            print(f"   Task {t:<3} {head}")
        print("   → 구현자는 **자기 태스크만** 본다. 만드는 쪽이 없으면 그 자리에서 멈춘다.")
        print("     ⚠️ 남의 플랜(1단계·공용)이 만든 것이면 무시해도 된다. 눈으로 한 번 볼 것.")

    if soc := screen_only_columns(root):
        print(f"\n🧩 **동작 명세가 화면 층만 적어 둔 DB 칸 {len(soc)}개** — 서버 층 규칙이 0개다:")
        for c, ids in soc:
            head = ", ".join(ids[:3]) + (f" 외 {len(ids) - 3}건" if len(ids) > 3 else "")
            print(f"   {c:<26} {head}")
        print("   → ⭐ **이것이 뿌리다.** 플랜은 명세를 근거로 쓰이므로, 명세에 서버 층이 없으면")
        print("     **규칙 커버리지 100%인 채로 서버가 통째로 빠진다.**")
        print("     실제 사례: `is_day_off` — 규칙 셋이 전부 화면 규칙이라 플랜 9,480줄에 0회.")
        print("     ⚠️ 조인 키(`doctor_id`)·흔한 낱말(`reason`)은 오탐이다. 눈으로 거를 것.")

    if lost := lost_in_rewrite(root, plan, "\n".join(lines)):
        print(f"\n♻️ **옛 플랜이 만들던 것 중 재작성본에서 이름조차 사라진 것 {len(lost)}개**:")
        print("   " + ", ".join(lost[:14]) + (f" 외 {len(lost) - 14}건" if len(lost) > 14 else ""))
        print("   → 재작성의 근거는 **규칙 문서**인데, 규칙은 화면을 적지 **배관을 적지 않는다.**")
        print("     그래서 규칙 커버리지가 100%여도 서비스 함수가 조용히 빠진다.")
        print("     실제 사례: `reschedule_appointment` — 도장과 라우터만 남아 **[재예약]이")
        print("     눌러도 아무 일이 안 나는 버튼**이 될 뻔했다.")
        print("     ⚠️ 일부러 폐기한 것이면 재작성본에 취소선·⛔로 **한 번 언급**해 두면 사라진다.")

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
