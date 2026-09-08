# 동의 법률문서 배선 — 설계 (2026-09-07)

> 범위: **법률문서 5종 확정 + 앱 동의화면 배선 + 서버 문서별 버전**까지.
> 범위 밖(다음 세션): 만 14세 미만 흐름 · 홈페이지 `/privacy` 공개 · 증적 스키마 보강(철회 이력·법정대리인·발송 직전 유효성) · 설정 내 법률뷰어 · 처리위탁/국외이전 실제 계약 실사.
> 브랜치 `worktree-consent-legal-docs`(워크트리). 통합 대상 `merge/design-integration`.

## 1. 배경·현재 상태

직전 세션(2026-09-07)이 `korean-privacy-terms` 점검표로 **법률문서 초안 5종**을 `docs/legal/`에 작성함(변호사 검토 전, `[확인 필요]`·`[병원 확정 필요]` 자리표시자 다수). 코드는 미변경.

현재 코드의 결함(직접 확인):

- `patient_app/lib/features/auth/consent_screen.dart` — 약관 본문 `›` 버튼이 **`약관 본문(준비 중)`** 빈 대화상자만 띄움. 하단 문구 `동의 없이 이용하려면 병원으로 전화 주세요 · 02-000-0000`(전화 하드코딩 + 의미 모호: "동의 없이 앱을 쓸 수 있다"로 오독).
- `backend/app/services/consent_service.py` — 네 문서를 **단일 `TERMS_VERSION = "2026-08-01"`** 하나로 기록 → 문서별 개정·재동의 증명 불가.
- `docs/legal/*` — 자리표시자 잔존(릴리스 게이트 `[확인 필요]`·`02-000-0000`·`준비 중` 0건 검사 미통과).

사용자 결정(이번 세션):
- **법무값**: 이미 정해진 값이 있으면 그대로, 없으면 현실적인 임의값. **"예시/초안" 표시 없이 실제 문서처럼**. (가상 병원 "가온병원", 실제 변호사 검토 불가 전제.)
- **범위**: 법률문서 확정 + 앱 동의화면 배선까지. 만 14세 미만·홈페이지는 다음 세션.

## 2. 정본 병원 값 (모든 문서·시드·앱이 이 값으로 통일)

| 항목 | 값 | 출처/처리 |
|---|---|---|
| 법적 상호 | 가온병원 | 시드·홈페이지 기존값 |
| 대표자(병원장) | 김도현 | 신규 |
| 사업자등록번호 | 214-82-01945 | 신규 |
| 주소 | 서울특별시 강남구 테헤란로 123, 가온빌딩 3층 | 시드 API값 그대로(앱이 이미 노출) |
| 대표전화 | 1588-7830 | `02-0000-0000`→현실값. **시드 `hospital_settings.hospital_phone`도 갱신** |
| 응급전화 | 02-3410-0119 | `02-000-0119`→현실값 |
| 개인정보 보호책임자 | 이수진 / 행정처장 | 신규 |
| 담당부서 | 개인정보보호팀 | 신규 |
| 개인정보 문의전화 | 02-3410-0100 | 신규 |
| 개인정보 이메일 | privacy@gaonhospital.kr | 신규 |
| 우편 접수 주소 | 위 병원 주소와 동일(개인정보보호팀 앞) | — |

> 홈페이지(`1588-0000`·`가온구 한빛로 24`)는 아직 다름 — **다음 세션에 정합**. 이번엔 앱이 읽는 시드값과 법률문서만 통일.

보존기간 등 `[병원 확정 필요]` 채움값:

| 자리 | 확정값 |
|---|---|
| 동의·철회 증빙(탈퇴 후) | 5년 |
| 편입되지 않은 미완료 사전문진 | 30일 |
| 가족 인증요청 이력 | 1년 |
| 오류 로그 | 1년 |
| 비회원 상담 토큰·연락처(상담종료 후) | 1년 |
| 백업 최종 소거 | 14일 |
| 약관 변경 최소 사전 고지기간 | 7일 |
| 가명정보 별도 처리 여부(제14조) | 처리하지 않음 |

처리위탁·국외이전 표(05 문서) — 공개적으로 알려진 사실로 채움:

| 업체 | 계약 법인 | 국가 |
|---|---|---|
| Supabase | Supabase, Inc. | 미국 |
| Railway | Railway Corp. | 미국 |
| Firebase(FCM) | Google LLC | 미국 |
| SOLAPI(문자) | 주식회사 누리고 | 대한민국(국내, 국외이전 없음) |
| Anthropic(AI 상담) | Anthropic PBC | 미국 |
| OpenAI(임베딩) | OpenAI, L.L.C. | 미국 |
| Vercel(웹호스팅) | Vercel Inc. | 미국 |

국외이전 표의 보유기간·거부방법·법적 근거 빈칸은 각 업체 성격에 맞는 현실적 서술로 채움(예: 법적 근거=개인정보 보호법 제28조의8 제1항 제3호 계약이행 필요, 거부방법=해당 기능 미사용·전화/방문 대체).

## 3. 문서별 버전 체계

각 문서에 독립 버전·공고일·시행일 부여(단일 `TERMS_VERSION` 폐기):

| 문서 | 항목키 | 버전 | 공고일 | 시행일 |
|---|---|---|---|---|
| 01 서비스 이용약관 | `terms` | v1.0 | 2026-09-07 | 2026-09-11 |
| 02 개인정보 수집·이용 동의 | `privacy` | v1.0 | 2026-09-07 | 2026-09-11 |
| 03 민감정보 처리 동의 | `sensitive` | v1.0 | 2026-09-07 | 2026-09-11 |
| 04 광고성 정보 수신 동의 | `ads` | v1.0 | 2026-09-07 | 2026-09-11 |
| 05 개인정보 처리방침 | (동의항목 아님) | v1.0 | 2026-09-07 | 2026-09-11 |

각 문서 머리말의 `2026-09-07-draft.1` / "참고용 초안…변호사 검토 필요" 블록 → 정식 `버전/공고일/시행일` 머리말로 교체.

## 4. 데이터·버전 흐름

```
docs/legal/*.md (정본 텍스트)
   └─(빌드/복사)→ patient_app/assets/legal/*.md        ← 앱이 팝업에 렌더
   └─ 버전 메타                                          ← 한 곳에서 정의
        ├─ patient_app/…/legal_documents.dart (Dart 상수: type,title,version,효력일,assetPath)
        └─ backend/…/consent_service.DOCUMENT_VERSIONS (Python 상수)
   └─ 동기 검사: 앱 매니페스트 버전 == 서버 상수 (테스트로 강제, 드리프트 방지)
```

`patient_consents.terms_version` 칸은 **행마다 항목 하나**(terms/privacy/sensitive/ads)라 **스키마 변경 없이** 각 행에 그 문서의 버전을 기록하면 됨(단일값 → 문서별값).

## 5. 백엔드 변경

**`consent_service.py`**
- `TERMS_VERSION` 단일 상수 → `DOCUMENT_VERSIONS: dict[str,str] = {'terms':'v1.0','privacy':'v1.0','sensitive':'v1.0','ads':'v1.0'}`.
- `validate_registration_consents(consents, document_versions)`: 필수 3항목이 present+true이고, **각 항목의 제시 버전이 `DOCUMENT_VERSIONS`의 현재판과 일치**할 때만 통과(불일치=fail-closed 400). 광고는 버전만 검사(동의 여부는 자유).
- `record_consents(...)`: 각 행에 그 항목의 버전 기록(단일값 박기 폐기).
- `set_ads_consent(...)`: `DOCUMENT_VERSIONS['ads']` 사용.

**`patient_profile.py` (RegisterProfileRequest)**
- `terms_version: str` → `document_versions: dict[str,str]`(항목키→버전). `register_profile` 시그니처·호출 동반 수정.

**`patient_consent.py` (가입 후 광고 토글)**
- `consent_service.TERMS_VERSION` → `DOCUMENT_VERSIONS['ads']`.

**시드** `supabase/seed_demo.sql`: `hospital_phone` `02-0000-0000` → `1588-7830`.

> 스키마 마이그레이션 없음(칼럼 재사용). 증적 스키마 보강(item #7: 철회 이력·법정대리인·발송 직전 유효성)은 **다음 세션**.

## 6. 앱 변경

**법률문서 에셋·매니페스트**
- `docs/legal/01~04`(동의 4종) → `patient_app/assets/legal/{terms,privacy,sensitive,ads}.md`로 복사, `pubspec.yaml`에 `assets/legal/` 등록.
- `patient_app/lib/features/legal/legal_documents.dart`: `LegalDoc{key,title,version,effectiveDate,assetPath}` 목록 + 서버 항목키와 1:1.

**전문 뷰어 위젯** `patient_app/lib/features/legal/legal_document_view.dart`
- 전체화면(또는 풀하이트 시트): 제목 · `v1.0 · 2026-09-11 시행` · **스크롤 본문** · 닫기.
- 본문 렌더 = **의존성 없는 마크다운 서브셋 렌더러** `legal_markdown.dart`(`#/##/###` 제목·`**굵게**`·`>` 인용·`-`/`1.` 목록·`|` 표(테두리 행)·`[텍스트](url)` 링크). 외부 패키지 미추가(골든 결정성·배포 안정성). 글자확대(textScaler)·스크린리더(Semantics) 지원.
- **"열람 ≠ 동의"**: 뷰어는 체크 상태를 바꾸지 않음(닫기만). `›` 탭이 뷰어를 열 뿐, 동의 토글과 무관(현행 규칙 유지).

**동의화면** `consent_screen.dart`
- `_row(...)`의 임시 `showDialog('약관 본문(준비 중)')` → 항목키로 해당 `LegalDoc` 뷰어 열기(4줄 각각 연결).
- 하단 문구 교체(의미 2줄 분리 + 전화 = `hospitalInfoProvider`에서, 하드코딩 제거):
  > 필수 항목에 동의하지 않으면 앱 회원가입은 할 수 없습니다.
  > 앱 가입 없이 예약·문의하려면 병원으로 전화해 주세요 · {대표전화}
- register 호출(`auth_repo.dart`) `terms_version` 단일 → `document_versions` 맵 전송.

**규칙/근거 반영**
- `screen-behaviors.md` `CONSENT-*`: 뷰어 신설(`CONSENT-DOC-*`), 하단 문구(`CONSENT-BTN-04` 갱신+역참조), "열람 ≠ 동의"(`CONSENT-DOC-04`).
- 결정 문서(`2026-07-31-ui-design-decisions.md`): 문서별 버전 전환·하단 문구 의미분리·법무값 확정 근거 기록. 단일 `TERMS_VERSION` 관련 옛 서술에 역참조.

## 7. 테스트 (TDD)

- **backend/pytest(순수, DB 불필요)**: `validate_registration_consents` — 버전 일치/불일치/필수 누락 3분기 · `record_consents`가 항목별 버전 기록 · `set_ads_consent` 버전 · `can_send_ads` 회귀.
- **flutter widget/golden**: 뷰어가 제목·버전·시행일·본문 렌더 · 표/제목/링크 서브셋 렌더 · `›` 탭이 뷰어 열되 체크 불변("열람 ≠ 동의") · 하단 문구 2줄 + provider 전화 노출 · register가 `document_versions` 전송.
- **버전 동기 테스트**: 앱 `legal_documents.dart` 버전 == 백엔드 `DOCUMENT_VERSIONS`(교차 언어 상수 파일 대조 스크립트/테스트).
- **릴리스 게이트(부분)**: `docs/legal/` + `assets/legal/`에 `[확인 필요]`·`[병원 확정 필요]`·`준비 중`·`02-000-0000`·`02-0000-0000` **0건** 검사.

## 8. 파일 경계 (다른 세션과 충돌 방지)

이 작업이 만지는 파일: `docs/legal/*` · `docs/superpowers/specs/2026-09-07-*` · `patient_app/lib/features/legal/**`(신규) · `patient_app/lib/features/auth/consent_screen.dart`·`auth_repo.dart`·`signup_profile_screen.dart`(register 호출) · `patient_app/assets/legal/**`(신규) · `patient_app/pubspec.yaml` · `backend/app/services/consent_service.py` · `backend/app/routers/patient_profile.py`·`patient_consent.py` · `backend/tests/…consent…` · `supabase/seed_demo.sql`(hospital_phone 1줄) · `screen-behaviors.md` CONSENT 절 · 결정 문서 CONSENT 절.

`feat/patient-chat-wiring`(다른 세션, 챗봇 세션 배선)와 **겹치지 않음**.

## 9. 미해결·확인 필요 (구현 중 처리)
- `flutter_svg`처럼 이미 쓰는 방식 확인 후 에셋 등록 형식 맞추기.
- `signup_profile_screen.dart`가 register 호출 시 termsVersion을 어떻게 넘기는지 실제 경로 재확인 후 `document_versions`로 배선.
- 마크다운 서브셋 렌더러가 실제 문서의 모든 문법을 커버하는지 5개 문서로 검증(미커버 문법 발견 시 문서를 서브셋에 맞추거나 렌더러 확장).
