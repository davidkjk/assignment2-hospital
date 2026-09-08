# 동의 법률문서 배선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 법률문서 5종을 정본값으로 확정하고, 앱 동의화면이 각 문서 전문을 열람하며, 서버가 단일 약관 버전 대신 문서별 버전을 검증·기록하도록 배선한다.

**Architecture:** 세 층을 하나의 문서별 버전 체계로 통일한다 — (1) `docs/legal/*.md` 정본 텍스트를 `patient_app/assets/legal/*.md`로 복사해 앱이 무의존 마크다운 서브셋 렌더러로 팝업에 렌더, (2) 앱 매니페스트 `legal_documents.dart`와 백엔드 `consent_service.DOCUMENT_VERSIONS`가 같은 버전을 선언(드리프트 방지 테스트로 강제), (3) 서버가 가입 요청의 문서별 버전 맵을 현재판과 대조해 fail-closed 검증. 스키마 마이그레이션 없음(`patient_consents.terms_version` 칼럼 재사용, 행마다 그 문서의 버전 기록).

**Tech Stack:** Flutter(Dart, riverpod, go_router) · FastAPI(Python, asyncpg, pydantic) · pytest · flutter_test(golden) · Supabase SQL 시드

**Spec:** `docs/superpowers/specs/2026-09-07-consent-legal-docs-design.md`

## Global Constraints

이 절의 값은 모든 태스크의 요구사항에 암묵 포함된다. 문서·시드·앱·서버가 **정확히 이 값**으로 통일된다.

**범위 밖(이번 세션에서 하지 말 것):** 만 14세 미만 연령 게이트·법정대리인 동의 흐름(앱/서버 로직) · 홈페이지 `/privacy` 공개 · 증적 스키마 보강(철회 이력·법정대리인 증빙·발송 직전 유효성) · 설정 내 법률뷰어 · 처리위탁/국외이전 실제 계약 실사. (문서 텍스트 안의 만 14세 미만 조항은 그대로 두되, 앱/서버 분기는 만들지 않는다.)

**정본 병원 값(spec §2):**

| 항목 | 값 |
|---|---|
| 법적 상호 | 가온병원 |
| 대표자(병원장) | 김도현 |
| 사업자등록번호 | 214-82-01945 |
| 주소 | 서울특별시 강남구 테헤란로 123, 가온빌딩 3층 |
| 대표전화 | 1588-7830 |
| 응급전화 | 02-3410-0119 |
| 개인정보 보호책임자 | 이수진 / 행정처장 |
| 담당부서 | 개인정보보호팀 |
| 개인정보 문의전화 | 02-3410-0100 |
| 개인정보 이메일 | privacy@gaonhospital.kr |
| 우편 접수 주소 | 위 병원 주소와 동일(개인정보보호팀 앞) |

**보존기간 확정값(spec §2):** 동의·철회 증빙(탈퇴 후) 5년 · 미완료 사전문진 30일 · 가족 인증요청 이력 1년 · 오류 로그 1년 · 비회원 상담 토큰·연락처(상담종료 후) 1년 · 백업 최종 소거 14일 · 약관 변경 최소 사전 고지기간 7일 · 가명정보 별도 처리 여부(제14조) 처리하지 않음. 법정대리인 본인확인 방법 = `휴대전화 본인인증(법령상 허용되는 확인방법)`.

**처리위탁·국외이전(spec §2, doc 05):** Supabase=Supabase, Inc.(미국) · Railway=Railway Corp.(미국) · Firebase(FCM)=Google LLC(미국) · SOLAPI(문자)=주식회사 누리고(대한민국, 국외이전 없음) · Anthropic(AI 상담)=Anthropic PBC(미국) · OpenAI(임베딩)=OpenAI, L.L.C.(미국) · Vercel(웹호스팅)=Vercel Inc.(미국). 국외이전 빈칸(보유기간·거부방법·법적근거)은 현실적 서술 — 법적근거=`개인정보 보호법 제28조의8 제1항 제3호(계약 이행에 필요)`, 거부방법=`해당 기능 미사용·전화/방문 대체`, 보유기간=`위탁 목적 달성 또는 계약 종료 시까지`.

**문서별 버전 체계(spec §3) — 앱·서버가 공유하는 정본:**

| 문서 | 항목키 | 버전 | 공고일 | 시행일 |
|---|---|---|---|---|
| 01 서비스 이용약관 | `terms` | v1.0 | 2026-09-07 | 2026-09-11 |
| 02 개인정보 수집·이용 동의 | `privacy` | v1.0 | 2026-09-07 | 2026-09-11 |
| 03 민감정보 처리 동의 | `sensitive` | v1.0 | 2026-09-07 | 2026-09-11 |
| 04 광고성 정보 수신 동의 | `ads` | v1.0 | 2026-09-07 | 2026-09-11 |
| 05 개인정보 처리방침 | (동의항목 아님) | v1.0 | 2026-09-07 | 2026-09-11 |

**릴리스 게이트 토큰(0건이어야 함):** `[확인 필요]` · `[병원 확정 필요]` · `준비 중` · `02-000-0000` · `02-0000-0000`. (`[법정대리인 입력]`·`[가입 과정에서 입력]`·`[서버 자동 기록]`·`[ ] 동의함` 같은 서명 양식 빈칸은 게이트 대상 아님 — 유지.)

**규율:** 태스크마다 커밋(구현 단계). 색 하드코딩 금지(`AppTokens` 경유). 마크다운 렌더러는 외부 패키지 무추가(골든 결정성). 백엔드 로컬 pytest는 `db_conn`(트랜잭션 롤백) 기반 파일만 지정 실행 — 전체 스위트/reset 금지(공용 로컬 DB 시드 보호).

**작업 위치:** 워크트리 `.claude/worktrees/consent-legal-docs`(브랜치 `worktree-consent-legal-docs`). 통합 대상 `merge/design-integration`.

**교차 언어 wire 계약(가입 요청):** 앱→서버 요청 본문에 `document_versions: {"terms":"v1.0","privacy":"v1.0","sensitive":"v1.0","ads":"v1.0"}` 맵을 싣는다(단일 `terms_version` 문자열 폐기). 서버는 필수 3항목 + ads 각각의 제시 버전이 `DOCUMENT_VERSIONS`와 일치할 때만 통과.

---

### Task 1: 백엔드 `consent_service` — 문서별 버전 상수·검증·기록

**Files:**
- Modify: `backend/app/services/consent_service.py`
- Test: `backend/tests/test_consent_service.py`

**Interfaces:**
- Consumes: 없음(순수 서비스 함수)
- Produces:
  - `DOCUMENT_VERSIONS: dict[str, str]` = `{'terms':'v1.0','privacy':'v1.0','sensitive':'v1.0','ads':'v1.0'}`
  - `validate_registration_consents(consents: dict, document_versions: dict) -> None`
  - `record_consents(conn, patient_id, *, mandatory: dict, ads_agreed: bool, document_versions: dict) -> None`
  - `set_ads_consent(conn, patient_id, *, agreed: bool) -> None` (버전 인자 제거 — 내부에서 `DOCUMENT_VERSIONS['ads']`)
  - `can_send_ads(*, ads_consent, now)` (변경 없음)

- [ ] **Step 1: Write failing tests (validate — 순수, DB 불필요)**

`backend/tests/test_consent_service.py` 상단 `TV = '2026-08-01'`를 지우고 아래를 추가한다:

```python
CUR = {'terms': 'v1.0', 'privacy': 'v1.0', 'sensitive': 'v1.0', 'ads': 'v1.0'}
OK_CONSENTS = {'terms': True, 'privacy': True, 'sensitive': True}


def test_validate_passes_when_all_true_and_versions_match():
    # F-05v1 — 필수 3개 present+true이고 문서별 버전이 현재판과 일치하면 통과
    consent_service.validate_registration_consents(OK_CONSENTS, CUR)


def test_validate_rejects_missing_required():
    # 필수 항목 하나라도 false/누락이면 400
    with pytest.raises(Exception):
        consent_service.validate_registration_consents(
            {'terms': True, 'privacy': True, 'sensitive': False}, CUR)


def test_validate_rejects_stale_version():
    # 어느 문서든 제시 버전이 현재판과 다르면 fail-closed 400(옛 약관 둔갑 차단)
    stale = {**CUR, 'privacy': 'v0.9'}
    with pytest.raises(Exception):
        consent_service.validate_registration_consents(OK_CONSENTS, stale)


def test_validate_rejects_stale_ads_version():
    stale = {**CUR, 'ads': 'v0.9'}
    with pytest.raises(Exception):
        consent_service.validate_registration_consents(OK_CONSENTS, stale)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_consent_service.py -k "validate" -v`
Expected: FAIL (validate 시그니처가 `terms_version: str`라 dict 인자 대조 실패 / 새 함수 동작 없음)

- [ ] **Step 3: Implement in `consent_service.py`**

`TERMS_VERSION` 단일 상수를 아래로 교체하고 세 함수를 문서별 버전으로 바꾼다:

```python
# 문서별 정본 버전 — 병원이 특정 문서를 개정하면 그 항목만 올린다(단일 TERMS_VERSION 폐기).
# 앱 매니페스트(legal_documents.dart)와 반드시 일치(Task 11 드리프트 테스트가 강제).
DOCUMENT_VERSIONS: dict[str, str] = {
    'terms': 'v1.0', 'privacy': 'v1.0', 'sensitive': 'v1.0', 'ads': 'v1.0',
}


def validate_registration_consents(consents: dict, document_versions: dict) -> None:
    """[보안 F-05 벡터1] 서버측 가입 불변식 — 필수 동의가 실제 present+true이고
    각 문서의 제시 버전이 현재판과 일치할 때만 통과. 아니면 fail-closed 400."""
    for item in REQUIRED_ITEMS:
        if consents.get(item) is not True:
            raise AppError("필수 항목에 모두 동의해야 가입할 수 있습니다.", status_code=400)
    for item, current in DOCUMENT_VERSIONS.items():
        if document_versions.get(item) != current:
            # 앱이 옛 약관을 보여줬을 수 있다 — 최신판 동의로 둔갑시키지 않고 막는다.
            raise AppError(
                "약관 버전이 올바르지 않습니다. 앱을 최신 버전으로 업데이트해 주세요.",
                status_code=400)


async def record_consents(conn, patient_id, *, mandatory: dict, ads_agreed: bool,
                          document_versions: dict) -> None:
    """CONSENT-LOG-01 — 각 행에 그 문서의 버전을 기록한다(행마다 항목 하나라 스키마 변경 없음)."""
    rows = [(patient_id, item, bool(mandatory.get(item)), document_versions[item])
            for item in REQUIRED_ITEMS]
    rows.append((patient_id, 'ads', ads_agreed, document_versions['ads']))
    await conn.executemany(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, $2, $3, $4)",
        rows,
    )
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", ads_agreed, patient_id)


async def set_ads_consent(conn, patient_id, *, agreed: bool) -> None:
    """CONSENT-LATER-01 — 가입 뒤 [선택] 광고 동의만 켜고 끈다. 버전은 정본 상수에서 읽는다."""
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", agreed, patient_id)
    await conn.execute(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, 'ads', $2, $3)",
        patient_id, agreed, DOCUMENT_VERSIONS['ads'],
    )
```

- [ ] **Step 4: Update the existing DB-touching tests to new signatures**

`test_record_consents_writes_four_rows`·`test_record_consents_sets_current_ads_flag`의 `terms_version=TV` → `document_versions=CUR`. `test_set_ads_consent_toggles_and_logs`의 `set_ads_consent(db_conn, pid, agreed=True, terms_version=TV)` → `set_ads_consent(db_conn, pid, agreed=True)`. `test_no_service_path_to_toggle_required_consents`·`test_can_send_ads_*`는 그대로.

- [ ] **Step 5: Run the full file to verify pass**

Run: `cd backend && python -m pytest tests/test_consent_service.py -v`
Expected: PASS (validate 4건 순수 + record/set_ads DB 3건 롤백 + 회귀 2건)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/consent_service.py backend/tests/test_consent_service.py
git commit -m "feat(consent): 문서별 버전 상수·검증·기록으로 전환 (단일 TERMS_VERSION 폐기)"
```

---

### Task 2: 백엔드 라우터·서비스 — `document_versions` 맵 배선

**Files:**
- Modify: `backend/app/routers/patient_profile.py`
- Modify: `backend/app/routers/patient_consent.py`
- Modify: `backend/app/services/patient_profile_service.py:10-40`
- Test: `backend/tests/test_patient_profile_service.py`

**Interfaces:**
- Consumes: Task 1의 `DOCUMENT_VERSIONS`, `validate_registration_consents(consents, document_versions)`, `record_consents(..., document_versions=)`, `set_ads_consent(conn, patient_id, *, agreed)`
- Produces:
  - `RegisterProfileRequest.document_versions: dict[str, str]` (기존 `terms_version: str` 대체)
  - `register_profile(auth_user_id, name, birth_date, gender, *, consents, ads_agreed=False, document_versions: dict)` (service 시그니처)

- [ ] **Step 1: Write failing test (service — 순수, register 검증 분기만)**

`backend/tests/test_patient_profile_service.py`에 추가(DB 없이 validate 거절을 확인 — validate가 실제 DB 접근 전에 raise):

```python
import pytest
from app.services import patient_profile_service
from app.core.errors import AppError

@pytest.mark.asyncio
async def test_register_rejects_stale_document_version():
    # 문서별 버전이 현재판과 다르면 patients 행을 만들기 전에 거절(우회 가입 차단)
    with pytest.raises(AppError):
        await patient_profile_service.register_profile(
            "00000000-0000-0000-0000-000000000000", "김테스트", __import__('datetime').date(1990,1,1), "M",
            consents={'terms': True, 'privacy': True, 'sensitive': True},
            document_versions={'terms':'v0.1','privacy':'v1.0','sensitive':'v1.0','ads':'v1.0'})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && python -m pytest tests/test_patient_profile_service.py::test_register_rejects_stale_document_version -v`
Expected: FAIL (시그니처가 `terms_version`이라 `document_versions` 키워드 거부 → TypeError)

- [ ] **Step 3: Update `patient_profile_service.register_profile`**

`backend/app/services/patient_profile_service.py:10-15`:

```python
async def register_profile(auth_user_id: UUID, name: str, birth_date: date, gender: str,
                           *, consents: dict, ads_agreed: bool = False,
                           document_versions: dict) -> UUID:
    # [보안 F-05 벡터1] 필수 동의 present+true + 문서별 버전 일치를 강제한다(거짓 증적·우회 차단).
    consent_service.validate_registration_consents(consents, document_versions)
```

그리고 `:37-39` 호출을 `document_versions=document_versions`로:

```python
            await consent_service.record_consents(
                conn, patient_id, mandatory=consents, ads_agreed=ads_agreed,
                document_versions=document_versions)
```

(`from app.services import consent_service` 유지. `terms_version` 기본값 인자 삭제됨.)

- [ ] **Step 4: Update `patient_profile.py` router**

`RegisterProfileRequest`의 `terms_version: str` 줄을 삭제하고 `document_versions: dict[str, str]` 추가, `register_profile` 호출을 갱신:

```python
class RegisterProfileRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    consents: ConsentAssertions          # [F-05 v1] 필수 동의 단언
    document_versions: dict[str, str]     # 항목키→제시 버전(terms/privacy/sensitive/ads) — 현재판과 일치해야 통과
    ads_agreed: bool = False
```

```python
    patient_id = await patient_profile_service.register_profile(
        auth_user_id, body.name, body.birth_date, body.gender,
        consents=body.consents.model_dump(), ads_agreed=body.ads_agreed,
        document_versions=body.document_versions)
```

- [ ] **Step 5: Update `patient_consent.py` router**

`consent_service.set_ads_consent(conn, patient.id, agreed=body.agreed, terms_version=consent_service.TERMS_VERSION)` →
`consent_service.set_ads_consent(conn, patient.id, agreed=body.agreed)` (더는 `TERMS_VERSION` 참조 없음).

- [ ] **Step 6: Verify no lingering `TERMS_VERSION` / `terms_version=` references in backend**

Run: `cd backend && grep -rn "TERMS_VERSION\|terms_version=" app/`
Expected: 빈 결과(모두 `document_versions`로 전환됨). 남으면 그 줄을 고친다.

- [ ] **Step 7: Run service + integration tests**

Run: `cd backend && python -m pytest tests/test_patient_profile_service.py tests/test_patient_routers_integration.py -v`
Expected: PASS. (통합 테스트가 `terms_version`을 보내면 그 fixture/요청 본문을 `document_versions` 맵으로 갱신한다 — 실패 메시지가 가리키는 지점을 정확히 고친다.)

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/patient_profile.py backend/app/routers/patient_consent.py backend/app/services/patient_profile_service.py backend/tests/test_patient_profile_service.py backend/tests/test_patient_routers_integration.py
git commit -m "feat(consent): 라우터·서비스 register를 document_versions 맵으로 배선"
```

---

### Task 3: 시드 `hospital_phone` 정본값

**Files:**
- Modify: `supabase/seed_demo.sql`

**Interfaces:**
- Consumes: 없음
- Produces: `hospital_settings.hospital_phone = '1588-7830'`(앱 `hospitalInfoProvider`가 `/catalog/hospital`로 읽어 동의화면 하단 문구에 노출)

- [ ] **Step 1: Locate the seed value**

Run: `grep -n "02-0000-0000\|hospital_phone" supabase/seed_demo.sql`
Expected: `hospital_phone` 대입에 `02-0000-0000` 발견.

- [ ] **Step 2: Replace with canonical phone**

`02-0000-0000` → `1588-7830` (Global Constraints 대표전화). 응급전화 자리(`02-000-0119`)가 같은 시드에 있으면 `02-3410-0119`로 함께 교체.

- [ ] **Step 3: Verify no placeholder phone remains in seed**

Run: `grep -n "02-0000-0000\|02-000-0000\|02-000-0119" supabase/seed_demo.sql`
Expected: 빈 결과.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed_demo.sql
git commit -m "feat(consent): 시드 hospital_phone을 정본 대표전화(1588-7830)로"
```

> ⚠️ 이 변경은 **로컬/원격 DB에 자동 적용되지 않는다** — 재시드(`npm run seed:demo`) 또는 원격 재시드 때 반영된다(배포 몫). 지금은 파일만 고친다.

---

### Task 4: 법률문서 01~04 정본화(헤더·정본값)

**Files:**
- Modify: `docs/legal/01-service-terms-draft.md`
- Modify: `docs/legal/02-personal-information-collection-use-consent-draft.md`
- Modify: `docs/legal/03-sensitive-information-consent-draft.md`
- Modify: `docs/legal/04-marketing-consent-draft.md`

**Interfaces:**
- Consumes: Global Constraints(정본 병원 값·보존기간·버전 체계)
- Produces: 초안 표시 제거 + 문서별 정식 헤더 + 정본값으로 채워진 4개 동의문서

- [ ] **Step 1: 각 문서 머리말 교체(초안 블록 → 정식 헤더)**

각 파일 상단의 `> 문서 버전: 2026-09-07-draft.1` ~ `> 공개 전 필수 입력: …` 블록(제목 다음 `>` 인용 묶음 전체)을 아래 형식으로 교체한다(문서별 버전/시행일은 Global Constraints 표):

- 01: `> 버전 v1.0 · 공고일 2026-09-07 · 시행일 2026-09-11`
- 02·03·04 동일 형식(전부 v1.0 / 2026-09-07 / 2026-09-11).

`참고용 초안 — 법률 자문이 아닙니다…` 문장, `2026-09-07-draft`, `공개 전 필수 입력` 줄을 남기지 않는다.

- [ ] **Step 2: 정체성 자리표시자 치환(01~04 전체)**

각 문서에서 아래 대괄호 자리표시자를 Global Constraints 값으로 바꾼다(있는 것만):
`[병원 법적 상호]`→`가온병원` · `[대표자]`→`김도현` · `[사업자등록번호]`→`214-82-01945` · `[주소]`→`서울특별시 강남구 테헤란로 123, 가온빌딩 3층` · `[대표전화]`→`1588-7830` · `[이메일]`→`privacy@gaonhospital.kr` · `[시행일]`→`2026-09-11` · `[성명 또는 직책]`→`이수진(행정처장)` · `[부서명]`→`개인정보보호팀` · `[전화번호]`→`02-3410-0100`.
(서명 양식 빈칸 `[법정대리인 입력]`·`[가입 과정에서 입력]`·`[서버 자동 기록]`·`[ ] 동의함`은 유지.)

- [ ] **Step 3: `[병원 확정 필요: …]` 보존기간 치환(02·03)**

`[병원 확정 필요: 보존기간]`(가족 인증요청 이력)→`1년` · `[병원 확정 필요: 회원 탈퇴 후 동의 증빙 보존기간과 법적 근거]`→`탈퇴 후 5년(개인정보 보호법 제15조·제22조에 따른 동의 취득 증명)` · `[병원 확정 필요: 휴대전화 인증, 전자서명 또는 법령상 허용되는 확인방법]`→`휴대전화 본인인증(법령상 허용되는 확인방법)`. 03 문서에 유사 `[병원 확정 필요: …]`가 있으면 §2 보존기간 표의 해당 값으로 채운다.

- [ ] **Step 4: Verify gate tokens are 0 across 01~04**

Run: `grep -nE "\[확인 필요\]|\[병원 확정 필요\]|준비 중|02-000-0000|02-0000-0000" docs/legal/0[1-4]*.md`
Expected: 빈 결과.

- [ ] **Step 5: Commit**

```bash
git add docs/legal/01-service-terms-draft.md docs/legal/02-personal-information-collection-use-consent-draft.md docs/legal/03-sensitive-information-consent-draft.md docs/legal/04-marketing-consent-draft.md
git commit -m "docs(legal): 동의문서 01~04 정본화 — 초안표시 제거·정본값·문서별 버전 헤더"
```

---

### Task 5: 개인정보 처리방침(05) 정본화 — 위탁·국외이전 표 완성

**Files:**
- Modify: `docs/legal/05-privacy-policy-draft.md`

**Interfaces:**
- Consumes: Global Constraints(정본값·보존기간·처리위탁/국외이전 표)
- Produces: `[확인 필요]` 29건·`[병원 확정 필요]` 3건이 0이 된 완성 처리방침

- [ ] **Step 1: 머리말 교체 + 정체성 자리표시자 치환**

Task 4 Step 1·2와 동일 방식으로 05의 초안 헤더 → `> 버전 v1.0 · 공고일 2026-09-07 · 시행일 2026-09-11`, 정체성 자리표시자(`[병원 법적 상호]`·`[대표자]`·개인정보 보호책임자 `이수진 / 행정처장`·담당부서 `개인정보보호팀`·문의전화 `02-3410-0100`·이메일 `privacy@gaonhospital.kr`·주소·우편 접수처)를 정본값으로.

- [ ] **Step 2: 보유기간 `[확인 필요]`/`[병원 확정 필요]` 치환**

각 목적별 보유기간 자리표시자를 §2 보존기간 표 값으로: 동의 증빙 탈퇴 후 5년 · 미완료 사전문진 30일 · 가족 인증요청 이력 1년 · 오류 로그 1년 · 비회원 상담 토큰·연락처 상담종료 후 1년 · 백업 최종 소거 14일 · 약관 변경 최소 사전 고지 7일 · 가명정보(제14조) 처리하지 않음. 문서 맥락에 맞는 값을 고른다(예약/발송 이력 등 문서에 이미 명시된 `1년`은 유지).

- [ ] **Step 3: 제5조(처리위탁)·제6조(국외이전) 표 완성**

`[확인 필요]`가 든 위탁/국외이전 표 셀을 Global Constraints 처리위탁·국외이전 값으로 채운다(업체·계약 법인·국가). 빈 보유기간·거부방법·법적근거 셀은 Global Constraints의 현실적 서술(법적근거=보호법 제28조의8 제1항 제3호, 거부방법=해당 기능 미사용·전화/방문 대체, 보유기간=위탁 목적 달성 또는 계약 종료 시까지)로. SOLAPI는 국내이므로 국외이전 표에 `해당 없음(국내 처리)`로 표기.

- [ ] **Step 4: 남은 `[확인 필요]` 개별 치환**

Run: `grep -nE "\[확인 필요\]|\[병원 확정 필요\]" docs/legal/05-privacy-policy-draft.md`
남은 각 줄을 그 맥락에 맞는 정본값/현실 서술로 채운다(연락처·근거·기간은 위 Constraints에서, 문장형 자리는 보수적·사실 기반 서술). 추측성 수치는 쓰지 않고 이미 확정된 §2 값만 사용.

- [ ] **Step 5: Verify gate tokens are 0**

Run: `grep -nEc "\[확인 필요\]|\[병원 확정 필요\]|준비 중|02-000-0000|02-0000-0000" docs/legal/05-privacy-policy-draft.md`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add docs/legal/05-privacy-policy-draft.md
git commit -m "docs(legal): 개인정보 처리방침 정본화 — 위탁·국외이전 표 완성, 자리표시자 0"
```

---

### Task 6: 앱 법률 에셋·매니페스트

**Files:**
- Create: `patient_app/assets/legal/terms.md` (← docs/legal/01)
- Create: `patient_app/assets/legal/privacy.md` (← docs/legal/02)
- Create: `patient_app/assets/legal/sensitive.md` (← docs/legal/03)
- Create: `patient_app/assets/legal/ads.md` (← docs/legal/04)
- Create: `patient_app/lib/features/legal/legal_documents.dart`
- Modify: `patient_app/pubspec.yaml:50-51`
- Test: `patient_app/test/features/legal/legal_documents_test.dart`

**Interfaces:**
- Consumes: Task 4의 확정 문서 01~04
- Produces:
  - `class LegalDoc { final String key, title, version, effectiveDate, assetPath; const LegalDoc(...); }`
  - `const Map<String, LegalDoc> legalDocs` (키: `terms`·`privacy`·`sensitive`·`ads`)

- [ ] **Step 1: 확정 문서를 에셋으로 복사**

```bash
mkdir -p patient_app/assets/legal
cp docs/legal/01-service-terms-draft.md patient_app/assets/legal/terms.md
cp docs/legal/02-personal-information-collection-use-consent-draft.md patient_app/assets/legal/privacy.md
cp docs/legal/03-sensitive-information-consent-draft.md patient_app/assets/legal/sensitive.md
cp docs/legal/04-marketing-consent-draft.md patient_app/assets/legal/ads.md
```

(05 처리방침은 이번 범위의 앱 동의화면에 링크되지 않으므로 복사하지 않는다 — 설정 법률뷰어는 다음 세션.)

- [ ] **Step 2: pubspec에 에셋 디렉토리 등록**

`patient_app/pubspec.yaml`의 `assets:` 목록(`- assets/icons/` 다음)에 한 줄 추가:

```yaml
  assets:
    - assets/icons/
    - assets/legal/
```

- [ ] **Step 3: Write failing test (manifest ↔ asset 일관성)**

`patient_app/test/features/legal/legal_documents_test.dart`:

```dart
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/legal/legal_documents.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('[LEGAL-DOC] 4개 동의문서가 서버 항목키와 1:1이고 v1.0/2026-09-11', () {
    expect(legalDocs.keys.toSet(), {'terms', 'privacy', 'sensitive', 'ads'});
    for (final d in legalDocs.values) {
      expect(d.version, 'v1.0');
      expect(d.effectiveDate, '2026-09-11');
    }
  });

  test('[LEGAL-DOC] 각 assetPath가 실제로 로드된다', () async {
    for (final d in legalDocs.values) {
      final body = await rootBundle.loadString(d.assetPath);
      expect(body.trim(), isNotEmpty);
    }
  });
}
```

- [ ] **Step 4: Run to verify fail**

Run: `cd patient_app && flutter test test/features/legal/legal_documents_test.dart`
Expected: FAIL (`legal_documents.dart` 없음).

- [ ] **Step 5: Create `legal_documents.dart`**

```dart
/// 법률문서 매니페스트 — 서버 consent 항목키(terms/privacy/sensitive/ads)와 1:1.
/// 버전은 백엔드 consent_service.DOCUMENT_VERSIONS와 반드시 일치(Task 11 드리프트 테스트가 강제).
class LegalDoc {
  final String key;
  final String title;
  final String version;
  final String effectiveDate;
  final String assetPath;
  const LegalDoc({
    required this.key,
    required this.title,
    required this.version,
    required this.effectiveDate,
    required this.assetPath,
  });
}

const Map<String, LegalDoc> legalDocs = {
  'terms': LegalDoc(
      key: 'terms', title: '서비스 이용약관', version: 'v1.0',
      effectiveDate: '2026-09-11', assetPath: 'assets/legal/terms.md'),
  'privacy': LegalDoc(
      key: 'privacy', title: '개인정보 수집·이용 동의', version: 'v1.0',
      effectiveDate: '2026-09-11', assetPath: 'assets/legal/privacy.md'),
  'sensitive': LegalDoc(
      key: 'sensitive', title: '민감정보(건강정보) 처리 동의', version: 'v1.0',
      effectiveDate: '2026-09-11', assetPath: 'assets/legal/sensitive.md'),
  'ads': LegalDoc(
      key: 'ads', title: '광고성 정보 수신 동의', version: 'v1.0',
      effectiveDate: '2026-09-11', assetPath: 'assets/legal/ads.md'),
};
```

- [ ] **Step 6: Run to verify pass**

Run: `cd patient_app && flutter test test/features/legal/legal_documents_test.dart`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add patient_app/assets/legal patient_app/lib/features/legal/legal_documents.dart patient_app/pubspec.yaml patient_app/test/features/legal/legal_documents_test.dart
git commit -m "feat(legal): 앱 법률 에셋 4종 + 매니페스트(legal_documents.dart)"
```

---

### Task 7: 무의존 마크다운 서브셋 렌더러

**Files:**
- Create: `patient_app/lib/features/legal/legal_markdown.dart`
- Test: `patient_app/test/features/legal/legal_markdown_test.dart`

**Interfaces:**
- Consumes: 없음(순수 파서/위젯)
- Produces: `Widget buildLegalMarkdown(String source)` — `Column`(crossAxisAlignment.start)으로 블록을 쌓는다. 지원 문법: `#`/`##`/`###` 제목 · `**굵게**` · `` `코드` `` · `[텍스트](url)` 링크 · `> ` 인용 · `-` 및 `1.` 목록 · `|` 표(구분행 `|---|` 스킵). 미지원 줄은 본문 단락으로 렌더. 외부 패키지 없음.

- [ ] **Step 1: Write failing tests**

`patient_app/test/features/legal/legal_markdown_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/legal/legal_markdown.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  testWidgets('제목·단락·목록·인용을 텍스트로 렌더한다', (t) async {
    await t.pumpWidget(_host(buildLegalMarkdown(
        '# 제목1\n\n본문 단락\n\n- 첫 항목\n1. 번호 항목\n\n> 인용 줄')));
    expect(find.text('제목1'), findsOneWidget);
    expect(find.text('본문 단락'), findsOneWidget);
    expect(find.textContaining('첫 항목'), findsOneWidget);
    expect(find.textContaining('번호 항목'), findsOneWidget);
    expect(find.textContaining('인용 줄'), findsOneWidget);
  });

  testWidgets('표 구분행(|---|)은 렌더하지 않고 셀만 렌더한다', (t) async {
    await t.pumpWidget(_host(buildLegalMarkdown(
        '| 항목 | 값 |\n|---|---|\n| 대표전화 | 1588-7830 |')));
    expect(find.textContaining('대표전화'), findsOneWidget);
    expect(find.textContaining('1588-7830'), findsOneWidget);
    expect(find.textContaining('---'), findsNothing);
  });

  testWidgets('**굵게**와 `코드`의 마커는 본문에 남지 않는다', (t) async {
    await t.pumpWidget(_host(buildLegalMarkdown('**중요** 그리고 `terms_version` 값')));
    expect(find.textContaining('중요'), findsOneWidget);
    expect(find.textContaining('terms_version'), findsOneWidget);
    expect(find.textContaining('**'), findsNothing);
    expect(find.textContaining('`'), findsNothing);
  });
}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd patient_app && flutter test test/features/legal/legal_markdown_test.dart`
Expected: FAIL (`legal_markdown.dart` 없음).

- [ ] **Step 3: Implement the renderer**

줄 단위로 파싱해 블록 위젯 리스트를 만든다. 인라인(`**`·`` ` ``·`[..](..)`)은 정규식으로 `TextSpan` 조각으로 나눈다. 표는 연속된 `|…|` 줄을 모아 렌더하고 `|---|` 구분행은 스킵. `AppTokens`로 색을 쓴다.

```dart
import 'package:flutter/material.dart';
import '../../core/tokens.dart';

/// 외부 패키지 없이 법률문서 마크다운 서브셋을 렌더한다(골든 결정성·배포 안정성).
/// 글자확대(MediaQuery textScaler 자동)·스크린리더(기본 Text Semantics)를 그대로 탄다.
Widget buildLegalMarkdown(String source) {
  final blocks = <Widget>[];
  final lines = source.replaceAll('\r\n', '\n').split('\n');
  final table = <List<String>>[];

  void flushTable() {
    if (table.isEmpty) return;
    blocks.add(_table(List.of(table)));
    table.clear();
  }

  for (final raw in lines) {
    final line = raw.trimRight();
    final t = line.trim();
    // 표: |a|b| 형태를 모은다(구분행 |---| 은 버린다).
    if (t.startsWith('|') && t.endsWith('|')) {
      final cells = t.substring(1, t.length - 1).split('|').map((c) => c.trim()).toList();
      final isDivider = cells.every((c) => RegExp(r'^:?-{1,}:?$').hasMatch(c) || c.isEmpty);
      if (!isDivider) table.add(cells);
      continue;
    }
    flushTable();
    if (t.isEmpty) {
      blocks.add(const SizedBox(height: 8));
    } else if (t.startsWith('### ')) {
      blocks.add(_heading(t.substring(4), 15));
    } else if (t.startsWith('## ')) {
      blocks.add(_heading(t.substring(3), 17));
    } else if (t.startsWith('# ')) {
      blocks.add(_heading(t.substring(2), 20));
    } else if (t.startsWith('> ')) {
      blocks.add(_quote(t.substring(2)));
    } else if (t.startsWith('- ')) {
      blocks.add(_bullet('•', t.substring(2)));
    } else if (RegExp(r'^\d+\.\s').hasMatch(t)) {
      final m = RegExp(r'^(\d+)\.\s(.*)').firstMatch(t)!;
      blocks.add(_bullet('${m.group(1)}.', m.group(2)!));
    } else {
      blocks.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: _inline(t, const TextStyle(fontSize: 14, height: 1.5)),
      ));
    }
  }
  flushTable();
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: blocks);
}

Widget _heading(String text, double size) => Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: _inline(text, TextStyle(fontSize: size, fontWeight: FontWeight.bold)),
    );

Widget _quote(String text) => Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
      decoration: BoxDecoration(
        color: AppTokens.surface,
        border: Border(left: BorderSide(color: AppTokens.border, width: 3)),
      ),
      child: _inline(text, const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
    );

Widget _bullet(String marker, String text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 22, child: Text(marker, style: const TextStyle(fontSize: 14))),
        Expanded(child: _inline(text, const TextStyle(fontSize: 14, height: 1.5))),
      ]),
    );

Widget _table(List<List<String>> rows) => Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(border: Border.all(color: AppTokens.border)),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final cell in rows[i])
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(border: Border.all(color: AppTokens.border, width: 0.5)),
                      padding: const EdgeInsets.all(6),
                      child: _inline(cell, TextStyle(
                          fontSize: 12,
                          fontWeight: i == 0 ? FontWeight.bold : FontWeight.normal)),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );

/// 인라인 마커를 TextSpan 조각으로 나눈다: **굵게**, `코드`, [텍스트](url).
Widget _inline(String text, TextStyle base) {
  final spans = <TextSpan>[];
  final re = RegExp(r'\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)');
  var idx = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > idx) spans.add(TextSpan(text: text.substring(idx, m.start), style: base));
    if (m.group(1) != null) {
      spans.add(TextSpan(text: m.group(1), style: base.copyWith(fontWeight: FontWeight.bold)));
    } else if (m.group(2) != null) {
      spans.add(TextSpan(
          text: m.group(2),
          style: base.copyWith(fontFamily: 'monospace', color: AppTokens.primary)));
    } else {
      // 링크: 데모/뷰어 맥락에선 텍스트만 강조(탭 동작은 범위 밖 — 밑줄만).
      spans.add(TextSpan(
          text: m.group(3),
          style: base.copyWith(
              color: AppTokens.primary, decoration: TextDecoration.underline)));
    }
    idx = m.end;
  }
  if (idx < text.length) spans.add(TextSpan(text: text.substring(idx), style: base));
  return Text.rich(TextSpan(children: spans.isEmpty ? [TextSpan(text: text, style: base)] : spans));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd patient_app && flutter test test/features/legal/legal_markdown_test.dart`
Expected: PASS.

- [ ] **Step 5: 실제 4개 문서로 렌더러 커버리지 확인**

Run: `cd patient_app && flutter test test/features/legal/`
실제 에셋을 파서에 통과시키는 스모크(Task 8 뷰어 테스트가 실문서를 로드해 확인)를 함께 돌려, 미커버 문법(렌더 안 되는 마커 잔존)이 없는지 본다. 미커버 발견 시 렌더러를 확장하거나(간단하면) 문서 문법을 서브셋에 맞춘다.

- [ ] **Step 6: Commit**

```bash
git add patient_app/lib/features/legal/legal_markdown.dart patient_app/test/features/legal/legal_markdown_test.dart
git commit -m "feat(legal): 무의존 마크다운 서브셋 렌더러 + 파서 테스트"
```

---

### Task 8: 법률문서 전문 뷰어 위젯

**Files:**
- Create: `patient_app/lib/features/legal/legal_document_view.dart`
- Test: `patient_app/test/features/legal/legal_document_view_test.dart`
- Test(golden): `patient_app/test/features/legal/goldens/legal-terms-view.png`(생성)

**Interfaces:**
- Consumes: `LegalDoc`(Task 6), `buildLegalMarkdown`(Task 7)
- Produces: `class LegalDocumentView extends StatelessWidget { const LegalDocumentView({required this.doc}); final LegalDoc doc; }` — 전체화면 라우트로 push. 제목 · `v1.0 · 2026-09-11 시행` 부제 · 스크롤 본문(에셋 rootBundle 로드) · 닫기(AppBar 뒤로). 체크 상태를 바꾸지 않는다.

- [ ] **Step 1: Write failing tests**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/legal/legal_document_view.dart';
import 'package:hospital_patient_app/features/legal/legal_documents.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('[CONSENT-DOC-01] 제목·버전·시행일·본문을 렌더한다', (t) async {
    await t.pumpWidget(MaterialApp(home: LegalDocumentView(doc: legalDocs['terms']!)));
    await t.pumpAndSettle();
    expect(find.text('서비스 이용약관'), findsWidgets);       // 앱바 제목
    expect(find.textContaining('v1.0'), findsOneWidget);
    expect(find.textContaining('2026-09-11 시행'), findsOneWidget);
    expect(find.textContaining('가온병원'), findsWidgets);    // 본문에 정본값
  });

  testWidgets('[CONSENT-DOC-04] 닫기(뒤로)가 있다 — 열람은 동의를 바꾸지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(
      body: Builder(builder: (ctx) => ElevatedButton(
        onPressed: () => Navigator.push(ctx,
            MaterialPageRoute(builder: (_) => LegalDocumentView(doc: legalDocs['ads']!))),
        child: const Text('open'),
      )),
    )));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    expect(find.byType(LegalDocumentView), findsOneWidget);
    await t.tap(find.byTooltip('뒤로'));  // AppBar 기본 back
    await t.pumpAndSettle();
    expect(find.byType(LegalDocumentView), findsNothing);  // 닫힘 — 원화면 그대로
  });
}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd patient_app && flutter test test/features/legal/legal_document_view_test.dart`
Expected: FAIL (뷰어 없음).

- [ ] **Step 3: Implement `legal_document_view.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import '../../widgets/patient_app_bar.dart';
import '../../core/tokens.dart';
import 'legal_documents.dart';
import 'legal_markdown.dart';

/// 법률문서 전문 뷰어(CONSENT-DOC-*). 동의 체크와 무관 — 열람은 닫기만 한다("열람 ≠ 동의").
class LegalDocumentView extends StatelessWidget {
  const LegalDocumentView({super.key, required this.doc});
  final LegalDoc doc;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PatientAppBar(title: doc.title),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
            child: Text('${doc.version} · ${doc.effectiveDate} 시행',
                style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
          ),
          const Divider(height: 1),
          Expanded(
            child: FutureBuilder<String>(
              future: rootBundle.loadString(doc.assetPath),
              builder: (ctx, snap) {
                if (!snap.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                  child: buildLegalMarkdown(snap.data!),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
```

(`PatientAppBar`가 뒤로 버튼 tooltip을 '뒤로'로 제공하는지 확인 — 다르면 테스트의 `find.byTooltip`을 실제 위젯에 맞춘다. 다르면 `find.byType(BackButton)` 사용.)

- [ ] **Step 4: Run to verify pass**

Run: `cd patient_app && flutter test test/features/legal/legal_document_view_test.dart`
Expected: PASS.

- [ ] **Step 5: 골든 추가·생성**

`legal_document_view_test.dart`에 골든 케이스 추가:

```dart
  testWidgets('[golden] terms 뷰어', (t) async {
    await t.pumpWidget(MaterialApp(home: LegalDocumentView(doc: legalDocs['terms']!)));
    await t.pumpAndSettle();
    await expectLater(find.byType(LegalDocumentView),
        matchesGoldenFile('goldens/legal-terms-view.png'));
  });
```

Run: `cd patient_app && flutter test --update-goldens test/features/legal/legal_document_view_test.dart`
그다음 `flutter test test/features/legal/legal_document_view_test.dart`로 초록 확인.

- [ ] **Step 6: Commit**

```bash
git add patient_app/lib/features/legal/legal_document_view.dart patient_app/test/features/legal/legal_document_view_test.dart patient_app/test/features/legal/goldens/legal-terms-view.png
git commit -m "feat(legal): 전문 뷰어 위젯(제목·버전·시행일·스크롤 본문) + 골든"
```

---

### Task 9: 동의화면 배선 — 뷰어 열기·하단 문구·전화 provider

**Files:**
- Modify: `patient_app/lib/features/auth/consent_screen.dart`
- Test: `patient_app/test/features/auth/consent_screen_test.dart`

**Interfaces:**
- Consumes: `legalDocs`(Task 6), `LegalDocumentView`(Task 8), `hospitalInfoProvider`(`lib/features/home/home_data.dart`)
- Produces: `consent_screen.dart`가 4줄 각각을 해당 문서 뷰어로 연결하고, 하단 2줄 문구 + provider 전화 노출

- [ ] **Step 1: Write failing tests**

`consent_screen_test.dart`에 추가(기존 테스트 유지). `hospitalInfoProvider`를 override해 전화 노출을, 뷰어 열림/체크 불변을 검증:

```dart
// 상단 import 추가
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/legal/legal_document_view.dart';
import 'package:hospital_patient_app/core/api_client.dart'; // apiClientProvider override용(있으면)

Widget _screenHost(ProviderContainer c) => UncontrolledProviderScope(
    container: c,
    child: const MaterialApp(home: ConsentScreen()));

  testWidgets('[CONSENT-DOC-02] › 탭이 전문 뷰어를 열되 동의 체크는 변하지 않는다', (t) async {
    final c = ProviderContainer(overrides: [
      hospitalInfoProvider.overrideWith((ref) async => const HospitalInfo(phone: '1588-7830')),
    ]);
    addTearDown(c.dispose);
    await t.pumpWidget(_screenHost(c));
    await t.pumpAndSettle();
    final before = c.read(consentProvider).terms;
    await t.tap(find.byIcon(AppIcons.chevron_right).first); // 첫 줄(이용약관) ›
    await t.pumpAndSettle();
    expect(find.byType(LegalDocumentView), findsOneWidget);
    expect(c.read(consentProvider).terms, before); // 열람 ≠ 동의
  });

  testWidgets('[CONSENT-BTN-04] 하단 2줄 안내 + provider 대표전화가 보인다', (t) async {
    final c = ProviderContainer(overrides: [
      hospitalInfoProvider.overrideWith((ref) async => const HospitalInfo(phone: '1588-7830')),
    ]);
    addTearDown(c.dispose);
    await t.pumpWidget(_screenHost(c));
    await t.pumpAndSettle();
    expect(find.textContaining('필수 항목에 동의하지 않으면'), findsOneWidget);
    expect(find.textContaining('전화'), findsWidgets);
    expect(find.textContaining('1588-7830'), findsOneWidget);
    expect(find.textContaining('02-000-0000'), findsNothing); // 하드코딩 제거됨
  });
```

- [ ] **Step 2: Run to verify fail**

Run: `cd patient_app && flutter test test/features/auth/consent_screen_test.dart`
Expected: FAIL (뷰어 미연결·옛 하드코딩 문구).

- [ ] **Step 3: `_row`가 항목키로 뷰어를 열게 수정**

`_row` 시그니처에 `String docKey`를 추가하고 4개 호출에 키를 넘긴다(`terms`·`privacy`·`sensitive`·`ads`). IconButton.onPressed의 `showDialog(... '약관 본문(준비 중)')`를 뷰어 라우트로 교체:

```dart
            IconButton(
              icon: const Icon(AppIcons.chevron_right, color: AppTokens.grayPending),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => LegalDocumentView(doc: legalDocs[docKey]!)),
              ), // CONSENT-DOC-02: › → 전문 뷰어(열람 ≠ 동의)
            ),
```

호출부 예: `_row(context, 'terms', '[필수] 서비스 이용약관', '서비스 이용에 필요한 약속', null, s.terms, () => n.toggle('terms'))` (나머지 3줄 동일 패턴, 키=`privacy`/`sensitive`/`ads`).
상단에 `import '../legal/legal_documents.dart';`·`import '../legal/legal_document_view.dart';` 추가.

- [ ] **Step 4: 하단 문구 2줄 분리 + provider 전화**

`build`는 이미 `WidgetRef ref`를 받으므로 `final phone = ref.watch(hospitalInfoProvider).valueOrNull?.phone ?? '';`를 상단에 추가하고, 옛 단일 `Text('동의 없이 이용하려면…02-000-0000')`를 아래로 교체:

```dart
              // CONSENT-BTN-04: 막다른 길 금지 + "동의 없이 앱을 쓸 수 있다" 오독 차단(의미 2줄 분리).
              const Text('필수 항목에 동의하지 않으면 앱 회원가입은 할 수 없습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTokens.grayPending, fontSize: 12)),
              const SizedBox(height: 2),
              Text(
                phone.isEmpty
                    ? '앱 가입 없이 예약·문의하려면 병원으로 전화해 주세요'
                    : '앱 가입 없이 예약·문의하려면 병원으로 전화해 주세요 · $phone',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppTokens.grayPending, fontSize: 12),
              ),
```

(`valueOrNull`이 없으면 `ref.watch(hospitalInfoProvider).value` 사용 — riverpod 버전에 맞춘다.)

- [ ] **Step 5: Run to verify pass (기존 테스트 포함)**

Run: `cd patient_app && flutter test test/features/auth/consent_screen_test.dart`
Expected: PASS(신규 2건 + 기존 CONSENT-* 전부).

- [ ] **Step 6: 동의화면 골든 갱신(있으면)**

`goldens/auth-signup-consent.png`가 하단 문구 변경으로 어긋나면:
Run: `cd patient_app && flutter test --update-goldens test/features/auth/consent_screen_test.dart` 후 재확인.

- [ ] **Step 7: Commit**

```bash
git add patient_app/lib/features/auth/consent_screen.dart patient_app/test/features/auth/consent_screen_test.dart patient_app/test/features/auth/goldens/auth-signup-consent.png
git commit -m "feat(consent): 4줄 전문 뷰어 연결 + 하단 2줄 안내·provider 대표전화"
```

---

### Task 10: 가입 register 호출을 `document_versions` 맵으로

**Files:**
- Modify: `patient_app/lib/features/auth/auth_repo.dart:106-133`
- Modify: `patient_app/lib/features/auth/signup_profile_screen.dart:10-55`
- Test: `patient_app/test/features/auth/signup_profile_screen_test.dart`(있으면 갱신, 없으면 생성)

**Interfaces:**
- Consumes: 서버 wire 계약(`document_versions` 맵, Task 2), `legalDocs`(Task 6)
- Produces: `createProfile(... required Map<String,String> documentVersions)` — `/patient` POST 본문에 `document_versions` 맵 전송(단일 `terms_version` 폐기)

- [ ] **Step 1: Write failing test (Fake repo가 받은 본문 검증)**

register가 문서별 버전 맵을 싣는지 확인. 기존 signup 테스트 패턴을 따르되, `SupabaseSignupProfileRepo` 대신 wire를 검증하려면 `ApiClient`를 가로채는 Fake를 쓴다. 간단히 컨트롤러 레벨에서 Fake `SignupProfileRepo`가 받은 `documentVersions`를 확인:

```dart
  test('[CONSENT-BTN-01b] register가 문서별 버전 맵을 싣는다', () async {
    late Map<String, String> captured;
    final repo = _CaptureRepo(onCreate: (dv) => captured = dv);
    final ctrl = SignupProfileController(repo);
    final err = await ctrl.submit(
      password: 'abc12345', name: '김테스트', birthDate: '1990-01-01', gender: 'M',
      consents: (terms: true, privacy: true, sensitive: true), adsAgreed: false);
    expect(err, isNull);
    expect(captured, {'terms': 'v1.0', 'privacy': 'v1.0', 'sensitive': 'v1.0', 'ads': 'v1.0'});
  });
```

`_CaptureRepo`는 `SignupProfileRepo`를 implements하고 `createProfile`에서 `documentVersions`를 콜백으로 넘긴다.

- [ ] **Step 2: Run to verify fail**

Run: `cd patient_app && flutter test test/features/auth/signup_profile_screen_test.dart`
Expected: FAIL (아직 `termsVersion` 단일 문자열 계약).

- [ ] **Step 3: `signup_profile_screen.dart` 계약 교체**

`const _termsVersion = '2026-08-01';`를 지우고, `legalDocs`에서 버전 맵을 파생하는 상수를 둔다:

```dart
import '../legal/legal_documents.dart';

/// 서버에 싣는 문서별 버전 맵 — 매니페스트에서 파생(단일 상수 폐기, 드리프트 방지).
Map<String, String> currentDocumentVersions() =>
    {for (final e in legalDocs.entries) e.key: e.value.version};
```

`SignupProfileRepo.createProfile`의 `required String termsVersion` → `required Map<String, String> documentVersions`. `SignupProfileController.submit`의 `repo.createProfile(... termsVersion: _termsVersion)` → `documentVersions: currentDocumentVersions()`.

- [ ] **Step 4: `auth_repo.dart` 전송 본문 교체**

`SupabaseSignupProfileRepo.createProfile`의 파라미터를 `required Map<String, String> documentVersions`로 바꾸고, POST 본문의 `'terms_version': termsVersion,`을 `'document_versions': documentVersions,`로 교체.

- [ ] **Step 5: Run to verify pass**

Run: `cd patient_app && flutter test test/features/auth/`
Expected: PASS(signup + consent 전부).

- [ ] **Step 6: 잔여 단일 버전 참조 확인**

Run: `cd patient_app && grep -rn "_termsVersion\|terms_version\|termsVersion" lib`
Expected: 빈 결과.

- [ ] **Step 7: Commit**

```bash
git add patient_app/lib/features/auth/auth_repo.dart patient_app/lib/features/auth/signup_profile_screen.dart patient_app/test/features/auth/signup_profile_screen_test.dart
git commit -m "feat(consent): 가입 register를 document_versions 맵 전송으로 배선"
```

---

### Task 11: 앱↔서버 버전 드리프트 방지 테스트

**Files:**
- Create: `backend/tests/test_legal_version_sync.py`

**Interfaces:**
- Consumes: `consent_service.DOCUMENT_VERSIONS`(Task 1), `patient_app/lib/features/legal/legal_documents.dart`(Task 6)
- Produces: 두 언어 상수 파일이 어긋나면 실패하는 순수 테스트

- [ ] **Step 1: Write failing/guard test**

```python
import re
from pathlib import Path
from app.services import consent_service

def test_app_manifest_versions_match_backend():
    # 앱 legal_documents.dart의 key:version 이 백엔드 DOCUMENT_VERSIONS와 정확히 일치(드리프트 방지)
    dart = (Path(__file__).resolve().parents[2]
            / 'patient_app/lib/features/legal/legal_documents.dart').read_text(encoding='utf-8')
    # LegalDoc(key: 'terms', ... version: 'v1.0', ...) 블록에서 key·version 추출
    pairs = dict(re.findall(r"key:\s*'(\w+)',.*?version:\s*'([^']+)'", dart, re.DOTALL))
    assert pairs == consent_service.DOCUMENT_VERSIONS
```

(경로 `parents[2]`는 `backend/tests/` → repo 루트 기준. 실제 깊이에 맞춰 조정하고, 정규식이 4개 키를 다 잡는지 실행으로 확인.)

- [ ] **Step 2: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_legal_version_sync.py -v`
Expected: PASS. (실패하면 정규식/경로를 실제 파일에 맞춘다 — 값 불일치가 아니라 파싱 문제일 수 있으니 추출된 `pairs`를 출력해 확인.)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_legal_version_sync.py
git commit -m "test(consent): 앱↔서버 문서 버전 드리프트 방지 테스트"
```

---

### Task 12: 릴리스 게이트(부분) — 자리표시자 0건 검사

**Files:**
- Create: `tools/legal-release-gate.sh`
- Test: 스크립트 자체가 검사(종료코드)

**Interfaces:**
- Consumes: `docs/legal/*.md`, `patient_app/assets/legal/*.md`
- Produces: 게이트 토큰이 하나라도 있으면 비영(非零) 종료

- [ ] **Step 1: Create the gate script**

```bash
#!/usr/bin/env bash
# 법률문서 릴리스 게이트(부분) — 자리표시자/가짜 전화가 0건인지 검사.
# 범위 밖(만14세·홈페이지·증적)은 다음 세션. 여기선 문서 확정만 판정한다.
set -euo pipefail
PATTERN='\[확인 필요\]|\[병원 확정 필요\]|준비 중|02-000-0000|02-0000-0000'
TARGETS=(docs/legal patient_app/assets/legal)
hits=$(grep -rnE "$PATTERN" "${TARGETS[@]}" || true)
if [ -n "$hits" ]; then
  echo "❌ 릴리스 게이트 실패 — 자리표시자 잔존:"; echo "$hits"; exit 1
fi
echo "✅ 릴리스 게이트 통과 — 자리표시자 0건"
```

- [ ] **Step 2: Run the gate**

Run: `chmod +x tools/legal-release-gate.sh && ./tools/legal-release-gate.sh`
Expected: `✅ 릴리스 게이트 통과 — 자리표시자 0건`, 종료코드 0. 실패하면 그 파일을 Task 4/5로 돌아가 채운다.

- [ ] **Step 3: Commit**

```bash
git add tools/legal-release-gate.sh
git commit -m "test(legal): 릴리스 게이트(부분) — 자리표시자 0건 검사 스크립트"
```

---

### Task 13: 규칙·결정 문서 반영 + 역참조

**Files:**
- Modify: `docs/design/screen-behaviors.md`(CONSENT 절 ~2957·2966)
- Modify: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`(CONSENT 절)

**Interfaces:**
- Consumes: 구현된 동작(뷰어·하단 문구·문서별 버전)
- Produces: `CONSENT-DOC-*` 신설 규칙 + `CONSENT-BTN-04`/`CONSENT-ITEM-05` 갱신 + 결정 근거·역참조

- [ ] **Step 1: `screen-behaviors.md` CONSENT 규칙 갱신**

- `CONSENT-ITEM-05`(줄 끝 `›`): "본문은 병원이 쓴다 · 자리표시자" 서술을 취소선 처리하고 `✅ 해소(2026-09-07)` — 전문 뷰어 연결(`LegalDocumentView`), 문서별 버전·시행일 표시로 역참조.
- `CONSENT-DOC-01~04` 신설: (01) 뷰어가 제목·`v1.0 · 2026-09-11 시행`·스크롤 본문 렌더 · (02) `›` 탭이 뷰어를 열되 동의 토글과 무관 · (03) 본문은 앱 에셋(`assets/legal/*.md`) 정본 · (04) **열람 ≠ 동의**(닫기만, 체크 불변).
- `CONSENT-BTN-04`: 옛 `동의 없이 이용하려면 병원으로 전화 주세요 · 02-000-0000`을 취소선 + `✅ 해소(2026-09-07)`로, 새 2줄 문구(필수 미동의=가입 불가 / 앱 가입 없이 전화·방문 = 별도 경로, 전화=`hospitalInfoProvider`)로 갱신. 의미 분리 근거 명시.

- [ ] **Step 2: 결정 문서에 문서별 버전 전환 기록**

`2026-07-31-ui-design-decisions.md` CONSENT 절에: (a) 단일 `TERMS_VERSION` → 문서별 `DOCUMENT_VERSIONS` 전환 결정·근거(문서별 개정·재동의 증명), (b) 하단 문구 의미분리, (c) 법무값 확정(가상병원 임의값, spec §2)을 추가. 단일 `TERMS_VERSION`을 가리키던 옛 서술에 `~~…~~ ✅ 해소(2026-09-07, 문서별 버전)` 역참조.

- [ ] **Step 3: 근거 링크 확인(검사기 있으면)**

Run: `grep -n "CONSENT-DOC-01\|CONSENT-DOC-04\|CONSENT-BTN-04" docs/design/screen-behaviors.md`
Expected: 신설/갱신 규칙이 보인다. (spec-index 검사기가 있으면 규칙ID 등록 형식을 따른다.)

- [ ] **Step 4: Commit**

```bash
git add docs/design/screen-behaviors.md docs/superpowers/specs/2026-07-31-ui-design-decisions.md
git commit -m "docs(consent): CONSENT-DOC-* 신설·CONSENT-BTN-04 갱신·문서별 버전 결정 기록"
```

---

### Task 14: 통합 검증·마무리

**Files:** (검증만 — 필요 시 소규모 수정)

- [ ] **Step 1: 백엔드 관련 테스트 그린(지정 파일만)**

Run: `cd backend && python -m pytest tests/test_consent_service.py tests/test_patient_profile_service.py tests/test_patient_routers_integration.py tests/test_marketing_consent.py tests/test_legal_version_sync.py tests/test_00024_consent_migration.py -v`
Expected: 전부 PASS. (⚠️ 전체 스위트/`--reset`은 돌리지 않는다 — 공용 로컬 DB 시드 보호. `db_conn`은 트랜잭션 롤백이라 안전.)

- [ ] **Step 2: 앱 legal + auth 테스트 그린**

Run: `cd patient_app && flutter test test/features/legal/ test/features/auth/`
Expected: 전부 PASS(골든 포함).

- [ ] **Step 3: analyze 무이슈**

Run: `cd patient_app && flutter analyze lib/features/legal lib/features/auth`
Expected: No issues.

- [ ] **Step 4: 릴리스 게이트 재실행**

Run: `./tools/legal-release-gate.sh`
Expected: 통과(0건).

- [ ] **Step 5: 잔여 단일버전 참조 전역 확인**

Run: `grep -rn "TERMS_VERSION\|'2026-08-01'\|02-000-0000" backend/app patient_app/lib supabase/seed_demo.sql`
Expected: 빈 결과(모두 전환됨).

- [ ] **Step 6: verification-before-completion 스킬로 완료 판정**

`superpowers:verification-before-completion`을 호출해 위 명령 출력을 근거로 완료를 주장한다(증거 없는 완료 주장 금지). 통합 브랜치 `merge/design-integration` 머지는 사용자 확인 후(핸드오프 갱신 포함).

---

## Self-Review

**1. Spec coverage:**
- §2 정본 병원 값 → Task 4·5(문서)·Task 3(시드) · §2 보존기간/위탁표 → Task 4·5. ✅
- §3 문서별 버전 → Task 1(상수)·Task 6(매니페스트)·Task 11(동기). ✅
- §4 데이터 흐름(에셋 복사·버전 메타 한 곳·동기 검사) → Task 6·11. ✅
- §5 백엔드(DOCUMENT_VERSIONS·validate·record·set_ads·라우터·시드) → Task 1·2·3. ✅
- §6 앱(에셋·매니페스트·렌더러·뷰어·동의화면·register·규칙) → Task 6·7·8·9·10·13. ✅
- §7 테스트(pytest 순수·flutter·버전동기·게이트) → Task 1·8·9·10·11·12. ✅
- §8 파일 경계 — 모든 태스크가 spec §8 목록 안. `feat/patient-chat-wiring`과 무겹침. ✅
- §9 미해결(에셋 등록 형식·register 실경로·렌더러 커버리지) → 실경로 확인 완료(auth_repo/signup_profile), 렌더러 커버리지 Task 7 Step 5. ✅

**2. Placeholder scan:** 각 태스크에 실제 코드/명령/치환값 포함. "적절히"류 없음. ✅

**3. Type consistency:** `DOCUMENT_VERSIONS`(dict)·`validate_registration_consents(consents, document_versions)`·`record_consents(..., document_versions=)`·`set_ads_consent(conn, pid, *, agreed)`·`document_versions: dict[str,str]`(요청)·`LegalDoc{key,title,version,effectiveDate,assetPath}`·`legalDocs`(Map)·`buildLegalMarkdown(String)`·`LegalDocumentView({required doc})`·`createProfile(... documentVersions: Map<String,String>)` — 태스크 간 이름·타입 일치 확인. ✅
