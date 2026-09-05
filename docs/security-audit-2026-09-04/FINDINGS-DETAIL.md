# 보안 발견 상세 흐름 — 2026-09-04

## F-01 — 직원 철회 가족 접근 복구

### 데이터 흐름

1. `supabase/migrations/00017_patient_identity_rls.sql:49-50` — 환자는 자기 계정의 비활성 link 행과 ID도 읽을 수 있다.
2. `supabase/migrations/00018_patient_family_link_rpcs.sql:30-37,49` — 모든 `authenticated` 호출자가 link ID를 RPC에 넣을 수 있고, 함수는 account가 호출자 소유인지만 확인한다.
3. 같은 파일 `:38-41` — link를 활성화하고 직원의 해제 시각·행위자·사유를 지운다.
4. `supabase/migrations/00017_patient_identity_rls.sql:24-32` — 활성 link가 다시 `patient_owns(family_patient_id)`를 만족시킨다.
5. 대체 경로는 `POST /family` → `backend/app/services/patient_family_service.py:23-48`이다. 서비스 역할 연결이 demographics로 비활성 link를 찾아 같은 복구를 수행한다.

### 요청

```http
POST /rest/v1/rpc/relink_family_link_self HTTP/1.1
Host: <project>.supabase.co
apikey: <public-anon-key>
Authorization: Bearer <patient-jwt>
Content-Type: application/json

{"p_link_id":"<staff-revoked-link-uuid>"}
```

또는:

```http
POST /family HTTP/1.1
Host: <backend>
Authorization: Bearer <patient-jwt>
Content-Type: application/json

{"name":"<family-name>","birth_date":"1950-01-01","gender":"F","relation":"부모"}
```

### 확인 결과와 조건

활성 환자 계정과 그 계정이 소유한 비활성 가족 link가 필요하다. 첫 경로에서는 RLS로 읽을 수 있는 link UUID, 둘째 경로에서는 기존 demographics가 필요하다. 성공하면 `is_active=true`, 직원 철회 세 필드가 `NULL`이 되고 가족 데이터 접근이 복원된다.

### 비교 기준

환자 포털의 대리/가족 접근은 철회가 즉시 효력을 가져야 하며, 재위임은 새 검증 이벤트다. 사용자 편의용 undo가 직원의 접근 철회와 감사 이벤트를 덮어쓰면 안 된다.

## F-02 — 문진 이동 RPC IDOR

### 데이터 흐름

1. `supabase/migrations/00005_appointments.sql:257-262` — receptionist/admin은 예약 ID를 정상적으로 읽는다.
2. `supabase/migrations/00020_booking_idempotency.sql:28-40` — `SECURITY DEFINER` 함수는 old/new 예약이 같은 account/for patient인지 비교한다.
3. 같은 파일 `:42-48` — 호출자나 실제 reschedule 관계를 확인하지 않고 문진의 `appointment_id`를 바꾸며, 모든 authenticated에 실행 권한을 준다.
4. `supabase/migrations/00035_questionnaire_admin_rls.sql:10-17` — 문진 읽기 권한은 변경된 목적지 예약의 담당의를 따른다.

### 요청

```http
POST /rest/v1/rpc/move_questionnaire_response HTTP/1.1
Host: <project>.supabase.co
apikey: <public-anon-key>
Authorization: Bearer <receptionist-or-admin-jwt>
Content-Type: application/json

{"p_old_appointment_id":"<appointment-with-response>","p_new_appointment_id":"<same-patient-other-appointment>"}
```

### 확인 결과와 조건

old 예약에 문진이 있고, new 예약에는 unique 제약 때문에 문진이 없어야 하며, 두 예약의 account/for patient가 같아야 한다. 공격자는 두 ID를 알아야 한다. 성공하면 문진이 무관한 예약으로 이동하며 목적지 의사가 이를 읽을 수 있다.

### 비교 기준

의료 시스템에서 임상 문서의 encounter 귀속 변경은 일반 CRUD가 아니라 제한된 감사 작업이다. 정상 재예약 트랜잭션 내부에서만 서버가 수행하고, 외부 authenticated RPC로 노출하지 않는 것이 기준이다.

## F-03 — 서명 없는 알림 상태 콜백

### 데이터 흐름

1. `backend/app/routers/messages.py:28-55` — 인증 dependency와 서명 검증 없이 세 문자열을 받는다.
2. `backend/app/services/message_service.py:358-374` — 원시 서비스 역할 연결로 attacker-controlled provider ID를 조회한다.
3. 같은 파일 `:375-380` — `delivered` 외의 모든 status를 실패 경로로 보낸다.
4. `backend/app/services/dispatch_service.py:99-129` — 실패 상태/재시도를 기록하고 특정 code는 환자의 `sms_dead=true`를 쓴다.

### 요청

```http
POST /messages/status-callback HTTP/1.1
Host: <backend>
Content-Type: application/json

{"provider_message_id":"<known-id>","status":"failed","failure_code":"invalid_number"}
```

재시도 유도 payload는 `failure_code`를 `rate_limited`로 바꾼다.

### 확인 결과와 조건

인증은 필요 없지만 DB에 존재하는 provider message ID가 필요하다. 유효 ID면 `{"status":"ok"}`, 무효면 `{"status":"ignored"}`가 반환된다. `invalid_number`는 즉시 배달 실패와 환자 문자불가 상태를 만든다. 실제 재발송에는 worker와 provider 활성화가 필요하다. 최소 FastAPI harness에서 인증 없는 payload가 그대로 handler에 전달되고 200이 되는 것을 실행 확인했다.

### 비교 기준

현재 사용 중인 Solapi는 webhook secret에서 계산한 `X-Solapi-Secret`과 `SINGLE-REPORT` payload를 규정한다. 전용 adapter가 해당 header와 실제 event 형식을 검증하고 replay를 멱등 처리한 뒤 내부 상태를 바꿔야 한다. 단순히 외부 ID가 비밀일 것이라고 가정하지 않는다. 기준: [Solapi webhook 문서](https://solapi.com/developers/api/webhook).

## F-04 — 광고 동의 무시

### 데이터 흐름

1. `backend/app/routers/messages.py:95-103` — receptionist/admin이 예약 광고 요청을 만든다.
2. `backend/app/services/message_service.py:100-112` — `kind`를 받지만 쓰지 않고 모든 활성 환자를 선택한다.
3. 같은 파일 `:146-161` — 광고 여부와 무관하게 환자 ID를 예약 수신자 표에 고정한다.
4. 같은 파일 `:194-216` — due worker가 현재 동의를 다시 읽지 않고 notification log와 발송을 생성한다.
5. `backend/app/services/dispatch_service.py:77-84,145-176` — SMS/푸시 자격에는 광고 동의가 없다.

### 요청

```http
POST /messages HTTP/1.1
Host: <backend>
Authorization: Bearer <receptionist-or-admin-jwt>
Content-Type: application/json

{"kind":"marketing","recipients_spec":{"all":true},"channel":"sms","body":"검진 행사","scheduled_at":"2026-09-05T14:00:00+09:00"}
```

### 확인 결과와 조건

`ads_consent=false`인 활성 환자, 살아있는 전화번호, 병원 SMS 활성화, due worker와 provider가 필요하다. 수신자 명단에는 동의 여부와 무관하게 포함되고 발송 시점에도 제외되지 않는다. 검증 harness는 false 동의 환자의 due 광고가 fake SMS provider까지 도달함을 확인했다.

### 비교 기준

환자 커뮤니케이션 시스템은 transactional과 marketing을 분리하고, 광고는 queue 생성과 실제 전송 사이에 동의가 철회될 수 있으므로 send-time current consent를 최종 권한으로 사용한다.

## F-05 — 필수 동의 우회 및 거짓 기록

### 데이터 흐름

1. `backend/app/routers/patient_profile.py:16-28` — 유효 JWT만 요구하며 필수 동의 assertion이 없는 프로필 본문을 받는다.
2. `backend/app/services/patient_profile_service.py:18-35` — 서비스 역할로 환자 행을 만들고 consent 기록 함수를 호출한다.
3. `backend/app/services/consent_service.py:14-25` — terms/privacy/sensitive를 무조건 true로 기록한다.
4. `backend/app/core/patient_security.py:33-40` — 이후 권한은 활성 환자 행의 존재만 확인한다.
5. 별도 직접 경로인 `supabase/migrations/00017_patient_identity_rls.sql:37-44`는 authenticated가 자기 `auth_user_id`로 환자 행을 삽입하도록 허용하며 consent 불변식을 요구하지 않는다.

### 요청

```http
POST /patient HTTP/1.1
Host: <backend>
Authorization: Bearer <new-auth-user-jwt>
Content-Type: application/json

{"name":"동의안함","birth_date":"1980-05-05","gender":"F","ads_agreed":false}
```

직접 RLS 경로:

```http
POST /rest/v1/patients HTTP/1.1
Host: <project>.supabase.co
apikey: <public-anon-key>
Authorization: Bearer <new-auth-user-jwt>
Content-Type: application/json

{"auth_user_id":"<jwt-sub>","name":"동의안함","birth_date":"1980-05-05","gender":"F"}
```

### 확인 결과와 조건

유효 Supabase JWT와 아직 연결된 환자 행이 없는 subject가 필요하다. 백엔드 경로는 세 개의 `agreed=true` 증적을 만들고, 직접 RLS 경로는 동의 행 없이 활성 프로필을 만든다. 두 경우 모두 이후 환자 권한 gate를 통과한다.

### 비교 기준

의료 포털의 민감정보 동의는 클라이언트 UI 상태가 아니라 서버측 등록 불변식이다. 서버가 제공한 정책 버전과 사용자의 명시적 assertion을 원자적으로 저장하고, 우회 가능한 두 번째 환자 생성 경로를 두지 않는다.
