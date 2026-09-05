# 보안 감사 보고서 — 2026-09-04

## 결론

**Request changes.** Task ⑦을 제외한 인증·권한·RLS·비밀정보·공격 경로를 감사한 결과, Critical은 없고 High 2건과 Medium 3건을 확인했다. JWT 검증, 역할별 FastAPI guard, 광범위한 RLS, 매개변수 SQL 같은 기반은 견고하지만, RLS를 우회하는 `SECURITY DEFINER`/서비스 역할 경로에서 호출자 소유권과 철회 상태를 다시 확인하지 않는 문제가 있다. 그 결과 가족 접근 철회가 복구되고 문진 기록이 다른 예약으로 이동할 수 있다. 알림 제공자 콜백 서명, 광고 동의, 필수 동의도 신뢰 경계가 서버에서 닫히지 않았다.

## 범위와 방법

- 제외: 커밋 `a441752`, `5f8b39d`, `/chat/attribute`, `/chat/cards/revalidate`, `/chat/cards/execute` 및 직접 배선·테스트(Task ⑦)
- 검토: FastAPI route/dependency, JWT, 직원/환자 역할, Supabase grant/RLS/`SECURITY DEFINER`, 원시 서비스 역할 연결, SMS/푸시, 가입·동의·가족·문진 흐름, 배포 및 비밀정보
- 검증: 각 후보를 독립 검증자가 반증 관점에서 재검토했다. 공개 콜백은 DB를 대체한 최소 FastAPI harness로 인증 없는 입력 전달을 실행 확인했다.
- 한계: 로컬 Supabase `localhost:54322`가 감사 중 안정적으로 응답하지 않아 DB 변경 PoC는 실행하지 않았다. 해당 항목은 마이그레이션의 확정적 grant/RLS/함수 흐름과 기존 테스트를 교차검증했다.
- 독립 확인: F-01~F-03은 구조화 결과 작성 뒤 별도 검증자가 다시 확인하고 행 번호, 실행 전제, Solapi 규격을 교정했다. F-04/F-05의 최종 별도 세션은 제품 사용량 제한으로 실행되지 않아 앞 단계의 독립 반증 검증과 본 에이전트의 재대조를 사용했다.
- 상세한 시스템 맵: [architecture.md](architecture.md)

## 발견 요약

| ID | 심각도 | 제목 | 결과 |
|---|---|---|---|
| F-01 | High | 직원이 철회한 가족 접근을 환자가 복구 | 가족 데이터 접근 재개 + 철회 감사기록 삭제 |
| F-02 | High | 범용 `SECURITY DEFINER` 문진 이동 RPC의 IDOR | 임상 문진의 예약 귀속 변조 및 다른 의사에게 노출 |
| F-03 | Medium | 서명 없는 알림 상태 콜백 | 배달 상태·재시도·환자 `sms_dead` 원격 변조 |
| F-04 | Medium | 예약 광고 발송이 수신 동의를 무시 | `ads_consent=false` 환자에게 광고 전송 |
| F-05 | Medium | 필수 동의를 클라이언트만 강제 | 미동의 가입 허용 및 거짓 동의 증적 생성 |

## F-01 — High: 직원이 철회한 가족 접근을 환자가 복구

위치: `supabase/migrations/00018_patient_family_link_rpcs.sql:30-41,49`, `backend/app/services/patient_family_service.py:23-48`

공격 시나리오: 가족 접근이 직원에 의해 사유와 실행자를 남기며 해제된 뒤, 해당 계정의 인증 환자가 자신에게 보이는 비활성 link ID로 `relink_family_link_self`를 직접 호출한다. 함수는 계정 소유권만 확인하고 링크를 다시 활성화하며 `unlinked_at`, `unlinked_by`, `unlink_reason`까지 지운다. 또는 같은 환자가 `/family`에 기존 가족의 이름·생년월일·성별을 보내면 서비스 역할 경로가 같은 동작을 한다.

영향: `patient_owns()`가 다시 참이 되어 대상 가족의 환자 정보, 예약, 문진 등 가족 소유권에 기대는 데이터 접근이 재개된다. 직원의 명시적 철회 결정과 감사 흔적도 함께 사라진다.

권고: 환자 자가해제와 직원 철회를 서로 다른 상태로 보존하고, 환자 재활성화는 자가해제 건에만 허용한다. 직원 철회 건은 새 OTP 또는 직원 확인을 요구한다. 철회 감사 이벤트는 별도 append-only 원장에 보존하고 재연결 시 삭제하지 않는다.

## F-02 — High: 범용 `SECURITY DEFINER` 문진 이동 RPC의 IDOR

위치: `supabase/migrations/00020_booking_idempotency.sql:28-48`, `supabase/migrations/00005_appointments.sql:257-262`, `supabase/migrations/00035_questionnaire_admin_rls.sql:10-17`

공격 시나리오: 접수직원 또는 관리자가 정상 조회 권한으로 같은 환자의 두 예약 ID를 얻고, 문진 제출시각 metadata 또는 환자 방문 경로로 문진이 있는 source와 비어 있는 destination을 구분한다. 이후 Supabase RPC `move_questionnaire_response(old, new)`를 직접 호출한다. 함수는 두 예약의 계정/대상 환자가 서로 같다는 것만 검사하며 호출자, 진료과, 상태, 실제 예약변경 관계를 검사하지 않는다. 모든 `authenticated` 역할에 실행 권한이 있다.

영향: 문진 답변이 무관한 예약으로 이동해 임상 기록의 귀속이 변조된다. 목적지 예약의 담당의에게 RLS 읽기 권한이 따라가므로 다른 진료과/의사에게 민감한 답변이 노출될 수 있다.

권고: 이 함수의 `authenticated` 실행 권한을 회수한다. 호출자와 old→new 변경 관계를 검증하는 원자적 예약변경 RPC 내부 helper로만 호출하고, 소유 계정·대상자 외에 진료과, 상태, 생성된 새 예약과의 lineage를 확인한다.

## F-03 — Medium: 서명 없는 알림 상태 콜백

위치: `backend/app/routers/messages.py:28-55`, `backend/app/services/message_service.py:358-380`, `backend/app/services/dispatch_service.py:99-129`

공격 시나리오: 유효한 `provider_message_id`를 알거나 개발 폴백의 고정 ID를 사용하는 공격자가 인증 헤더 없이 `/messages/status-callback`에 `status=failed`, `failure_code=invalid_number`를 보낸다. route에는 인증이나 제공자 서명 검증이 없고, 정확히 `delivered`인 경우를 제외한 모든 status가 실패 처리된다.

영향: 알림이 실패로 바뀌고 환자의 `sms_dead`가 설정되어 이후 문자가 억제될 수 있다. 임시 실패 코드를 보내면 재시도가 예약되어 실제 worker/provider 환경에서는 중복 발송과 비용을 유발할 수 있다. 공격자는 유효/무효 ID의 `ok`/`ignored` 응답 차이도 관찰할 수 있다.

권고: 현재 Solapi 연동에서는 설정된 webhook secret과 `X-Solapi-Secret`을 constant-time으로 비교하고 실제 `SINGLE-REPORT` 배열의 `messageId`/`statusCode` 형식을 파싱하는 전용 adapter를 둔다. 종결 상태 코드를 allowlist로 제한하고, replay를 멱등 처리하며, message ID를 Solapi 발송 건과 함께 매칭한다. 다른 제공자를 붙이면 그 제공자의 공식 서명 규격을 별도로 적용한다. 외부 응답은 동일하게 만들어 ID oracle을 없앤다. 제공자 규격은 [Solapi webhook 문서](https://solapi.com/developers/api/webhook)를 기준으로 검증했다.

## F-04 — Medium: 예약 광고 발송이 수신 동의를 무시

위치: `backend/app/services/message_service.py:100-112,146-161,194-216`, `backend/app/services/dispatch_service.py:77-84,145-176`, `backend/app/services/consent_service.py:40-45`

공격 시나리오: 악의적이거나 탈취된 접수직원/관리자 계정이 `kind=marketing`, `all=true`, 미래 `scheduled_at`으로 `/messages`를 호출한다. 수신자 해석은 `kind`와 `ads_consent`를 무시하고 모든 활성 환자를 고정한다. 발송 시점에도 광고 동의를 다시 읽지 않는다.

영향: 기본값이 `false`인 광고 거부 환자에게 광고 푸시/SMS가 전송된다. 환자가 예약 후 동의를 철회해도 고정된 수신자 명단에서 제거되지 않는다.

권고: 생성 시점에 `kind=marketing AND ads_consent=true`로 제한하고 제외 수를 계산한다. 더 중요한 최종 방어로 발송 직전 현재 동의를 재확인해 철회자를 제외한다. `can_send_ads()`를 모든 광고 발송이 반드시 통과하는 단일 정책 경계로 옮긴다.

## F-05 — Medium: 필수 동의를 클라이언트만 강제

위치: `backend/app/routers/patient_profile.py:16-28`, `backend/app/services/consent_service.py:14-25`, `supabase/migrations/00017_patient_identity_rls.sql:37-44`

공격 시나리오: 아직 환자 행이 없는 유효 Supabase 사용자가 약관 화면을 건너뛰고 `/patient`에 이름·생년월일·성별만 보낸다. 요청에는 terms/privacy/sensitive 동의 값이 없지만 서버는 세 항목을 모두 `agreed=true`로 기록한다. 별도로, 공개 anon key와 같은 JWT로 Supabase Data API의 `patients` INSERT 정책을 직접 사용하면 동의 행 없이 활성 환자 프로필을 만들 수 있다.

영향: 필수 이용약관, 개인정보 수집, 민감 건강정보 처리에 동의하지 않고도 정상 환자 권한을 얻는다. 백엔드 경로는 실제로 받지 않은 동의를 timestamp/version과 함께 참으로 남겨 병원의 감사·동의 증적까지 훼손한다.

권고: 서버가 제공한 정확한 약관 버전에 대한 세 개의 명시적 true assertion을 요청에 포함시키고 프로필 생성과 같은 트랜잭션에서 검증·기록한다. `patients`의 일반 authenticated INSERT를 회수하고 consent invariant를 보장하는 단일 RPC/서버 경로만 허용한다. 클라이언트 route guard는 보안 수정으로 간주하지 않는다.

## 기존 리뷰와 중복되는 항목

아래 항목은 이번 보고서에 내용을 반복하지 않고 기존 문서로만 연결한다.

- [기존 리뷰 #1 — 실제 전화번호와 고정 비밀번호 노출](../CODE_REVIEW_2026-09-04.md#1-critical--실제-전화번호와-고정-비밀번호-노출)
- [기존 리뷰 #2 — 데모 시드가 대상 DB 전체 알림 설정 변경](../CODE_REVIEW_2026-09-04.md#2-required--데모-시드가-대상-db-전체의-알림-설정을-변경)
- [기존 리뷰 #3 — 검증되지 않은 의료 지침 자동 승인](../CODE_REVIEW_2026-09-04.md#3-required--검증되지-않은-의료-지침이-자동-승인됨)

## Hardening notes

- JWT 검증에서 허용 algorithm을 명시적으로 고정하고 issuer/project를 확인하며, JWKS 응답의 HTTP 성공 여부와 key type/use도 검증한다.
- 제공자 미설정 fallback이 전화번호, 알림 본문, push token을 로그에 남긴다. 비운영 환경에서도 PII/PHI를 마스킹하고 token은 기록하지 않는다.
- 비밀번호 재설정과 OTP rate limit의 다중 instance 동작 및 reverse proxy의 실제 client IP 전달을 배포 환경에서 확인한다.
- 서비스 역할 `get_pool()`과 `SECURITY DEFINER`에 대한 허용 목록을 만들고, 새 사용마다 호출자/소유권/감사 불변식 테스트를 요구한다.

## 긍정적인 패턴

- 확인한 SQL 실행 경로는 값을 매개변수로 바인딩한다.
- 직원 역할은 route dependency와 서비스/RLS에서 중복 확인하는 경로가 많다.
- 환자 소유권은 공통 `patient_owns()`와 활성 가족 link를 중심으로 일관되게 모델링되어 있다.
- 진료기록 revision, 문진 template 불변성, 예약 상태 이력 등 중요한 무결성 제약을 DB에도 둔다.
- 전화번호 마스킹과 원문 열람 감사 경로가 분리되어 있다.
- Gitleaks로 Git 919개 커밋을 검사해 비밀정보 패턴 0건을 확인했다. 작업 트리의 실제 `.env` 파일은 ignore 및 미추적 상태다.

## 스킬 검증·설치 기록

- `security-audit`: Cloudflare 공식 저장소의 MIT 패키지, 검증 기준 commit `8bac420`. 설치 전 전체 파일을 확인했으며 9개 Markdown, JSON schema, 외부 의존성 없는 validator만 포함한다. 네트워크 전송·자격증명 수집·임의 shell 실행 코드는 없었다. 설치 후 SHA-256을 원본과 대조했다.
- 설치 위치: `/Users/kimjunkee/.codex/skills/security-audit`
- `improve-codebase-architecture`: `mattpocock/skills`의 Markdown/HTML 지침 패키지로 실행 파일이 없다. 설치 위치는 `/Users/kimjunkee/.codex/skills/improve-codebase-architecture`다.

## 검증 산출물

- 상세 공격 흐름: [FINDINGS-DETAIL.md](FINDINGS-DETAIL.md)
- 구조화 결과: [findings.json](findings.json)
- 아키텍처 맵: [architecture.md](architecture.md)
