# 1단계: 기반(인증/권한 + 예약·진료상태·수정이력 데이터 모델) 설계

> 근거 문서: `고객요구사항.txt`
> 이 문서는 전체 프로젝트(웹+환자 앱+AI 상담봇, 약 6.3인월 규모)를 5단계로 나눈 것 중 **1단계**의 설계입니다.
>
> 1. **기반: 인증/권한 + 예약·진료상태·수정이력 데이터 모델 (이 문서)**
> 2. 직원용 웹 (React)
> 3. 환자 모바일 앱 (Flutter)
> 4. AI 상담봇
> 5. 통합 테스트 & 배포

## 기술 스택

| 영역 | 선택 |
|---|---|
| 백엔드 | FastAPI + Supabase (Postgres) |
| 직원용 웹 | React + TypeScript |
| 환자 앱 | Flutter |
| 푸시 알림 | Firebase Cloud Messaging |
| AI 상담봇 | Claude API (tool use) + Supabase |
| 인증 | Supabase Auth |

## 섹션 1: 인증/권한 구조

- Supabase Auth 하나를 공유하되, 도메인 테이블은 `patients`(환자)와 `staff`(직원)로 분리
- `staff.role`: `receptionist`(접수직원) / `doctor`(의사) / `admin`(관리자)
- 관리자가 초대 링크(`inviteUserByEmail`)로 직원 계정을 생성하고, 직원은 링크에서 직접 비밀번호를 설정 — 직원 자가입 불가 (요구사항 3.1)
- 세션 30분 무활동 시 자동 로그아웃 (직원 웹 기준)
- Supabase Auth가 비밀번호를 해시로만 저장하므로 관리자 포함 누구도 평문 조회 불가 (요구사항 6.5)
- 권한은 Supabase RLS 정책으로 강제:
  - 접수직원: 진료기록 **조회 가능**, **수정/삭제 불가**
  - 의사: 본인이 작성한 진료기록만 작성/수정 가능 (완료 후 수정 시 사유 필수)
  - 의사: 본인이 담당하는 예약(appointment)의 사전문진(`questionnaire_responses`)만 조회 가능, 다른 과 의사·접수직원은 조회 불가 (요구사항 6.1)
  - 관리자: 계정 관리, 진료과/일정 관리, 병원 안내 관리 화면 접근
  - 진료기록은 어떤 역할도 삭제 불가 (소프트 삭제 원칙, 요구사항 3.6/6.3)

## 섹션 2: 핵심 테이블 구조

### 조직/기준 정보

**`departments`** (진료과)
- `id`: 진료과 고유번호
- `name`: 진료과명
- `is_active`: 사용 중지 여부 (요구사항 3.7 "진료과 추가·수정·사용 중지")

**`staff`** (직원)
- `id`: 직원 고유번호
- `auth_user_id`: Supabase Auth 계정 연결
- `name`: 이름
- `role`: `receptionist` / `doctor` / `admin`
- `department_id`: 소속 진료과 (의사만 값 있음)
- `is_active`: 계정 사용 가능 여부
- `deactivated_by` / `deactivated_at`: 계정을 중지시킨 사람/시각

**`doctor_schedule_rules`** (의사 정규 진료 스케줄 — 요구사항 3.7)
- `doctor_id`: 대상 의사
- `weekday`: 요일
- `start_time` / `end_time`: 진료 시작·종료 시각
- `slot_duration_minutes`: 예약 한 칸의 기본 시간 (15/20/30분 등)
- `lunch_start` / `lunch_end`: 점심시간
- `max_daily_appointments`: 하루 최대 예약 인원
- `booking_deadline`: 예약 마감 시각
- `is_day_off`: 해당 요일 정기 휴진 여부 (기본값 `false`). `true`인 요일은 슬롯 배치 생성 시 제외 — "매주 수요일 휴진"처럼 반복되는 휴진을 매번 개별 날짜로 등록하지 않아도 되게 함 (요구사항 3.7). 특정 날짜만 예외로 쉬는 비반복 케이스는 기존 `doctor_schedule_exceptions.is_closed`로 별도 처리

**`doctor_schedule_exceptions`** (특정 날짜 예외 — 요구사항 3.7)
- `doctor_id`: 대상 의사
- `date`: 예외 날짜
- `is_closed`: 휴진 여부
- `override_start_time` / `override_end_time`: 그날만 다르게 적용할 진료시간

### 환자

**`patients`** (환자)
- `id`, `name`, `birth_date`, `phone`, `gender`: 기본정보 (요구사항 4.1)
- `is_active`: 사용 중지(숨김) 여부

**`patient_family_links`** (계정-가족 연결 — 요구사항 4.2)
- `account_patient_id`: 로그인 계정의 주인
- `family_patient_id`: 등록된 가족 구성원의 환자 id
- `relation`: 관계

### 예약

**`appointment_slots`** (예약 가능 시간 칸)
- `id`, `doctor_id`, `date`, `start_time`
- `status`: 빈시간 / 예약됨 / 휴진
- 제약: `(doctor_id, date, start_time)` unique — 같은 의사·같은 시간 중복 예약 원천 차단
- 종료시간은 저장하지 않음 (`start_time + doctor_schedule_rules.slot_duration_minutes`로 계산)
- 매일 배치로 미래 슬롯을 미리 생성. 당일 급한 환자 추가 시에는 배치 외에 즉석으로 슬롯을 추가 생성 가능 (요구사항 3.3)

**`appointments`** (예약)
- `id`
- `slot_id`: nullable — 워크인(예약 없이 방문) 환자는 슬롯 없이 등록 가능 (요구사항 3.4)
- `account_patient_id`: 예약을 신청한 계정
- `for_patient_id`: 실제 진료받을 사람 (본인 또는 가족)
- `department_id`, `doctor_id`
- `reason`: 방문 이유
- `status`: 예약신청 / 예약확정 / 도착 / 진료대기 / 진료중 / 진료완료 / 환자취소 / 병원취소 / 예약부도 (요구사항 3.4)
- `source`: `app` / `chatbot` / `staff` — 통계(3.10)와 상담봇 예약 추적(6.1)에 사용
- `queue_position`: 대기 순서 (대기 중일 때만 사용, 접수직원이 조정 가능 — 요구사항 3.4)
- `is_urgent_flag`: 응급/주의 표시. **직원만 설정 가능**하며 의학적 응급도 판정을 대신하지 않음 (요구사항 3.4)
- `created_by`: 직원이 대신 등록한 경우 그 직원
- `updated_at`: 동시 수정 충돌 방지용 (섹션 3 참고)

**`appointment_status_history`** (예약 상태 변경 이력)
- `appointment_id`, `from_status`, `to_status`, `changed_by`, `reason`, `changed_at`
- 대기 순서 변경도 이 테이블에 사유와 함께 기록 (요구사항 3.4)

### 진료기록

**`medical_records`** (진료기록 — 요구사항 3.6)
- `id`, `appointment_id`, `doctor_id`
- `symptoms` / `diagnosis` / `treatment`: 증상 / 진단 / 처치·안내사항
- `patient_visible_notes`: 환자 앱에 공개할 안내 (내부기록과 분리, 요구사항 4.6)
- `is_completed`: 완료 여부 (완료 전엔 임시저장·수정 자유)
- `updated_at`: 동시 수정 충돌 방지용

**`medical_record_revisions`** (진료기록 수정이력)
- `record_id`, `previous_content`(수정 전 전체 내용 JSON 스냅샷), `revised_by`, `revised_at`, `reason`(완료 후 수정 시 필수)

### 사전문진 (요구사항 4.4)

**`questionnaire_templates`** (진료과별 문진 양식)
- `department_id`, `questions`(JSON: 질문 텍스트/타입/필수여부)

**`questionnaire_responses`** (환자 답변)
- `appointment_id`, `template_id`
- `answers`: JSON — 질문 텍스트를 답변과 함께 그대로 저장해 자체완결(양식이 나중에 바뀌어도 과거 답변 의미가 보존됨)
- `submitted_at`

### 감사/로그

**`access_audit_log`** (열람 기록 — 요구사항 3.1)
- `staff_id`, `patient_id`, `resource_type`(환자상세/진료기록), `accessed_at`
- 환자 상세화면 진입, 진료기록 조회 시점에만 기록 (목록 스크롤 등은 제외)

**`system_error_log`** (오류 로그 — 요구사항 6.4)
- `id`, `occurred_at`, `feature`(발생 기능), `message`(오류 내용)

### 환자 부가정보

**`patient_internal_notes`** (직원 내부 메모 — 요구사항 3.5)
- `patient_id`, `staff_id`, `content`, `created_at`

### 병원 설정

**`hospital_settings`** (1행만 존재하는 싱글턴 설정 테이블)
- `cancellation_deadline_hours`: 앱에서 직접 취소 가능한 마감 기준 (요구사항 4.3 "병원이 정한 시간 이후에는 앱에서 직접 취소하지 못하고 상담으로 연결")

### 소프트 삭제 원칙 (요구사항 6.3)
`patients`, `staff` 등은 실제 delete 대신 `is_active` 플래그로 숨김 처리. 진료기록은 `medical_record_revisions`로 이전 내용을 보존.

## 섹션 3: 에러 처리·동시성 원칙

**동시성 제어**
- 슬롯 예약: `UPDATE appointment_slots SET status='예약됨' WHERE id=? AND status='빈시간'` 조건부 업데이트로 이중예약 차단
- 정보 수정 충돌: `appointments` / `medical_records` / `patients` 저장 시 클라이언트가 들고 있던 `updated_at`을 함께 전송, 서버의 현재 값과 다르면 저장 거부 후 "다른 직원이 먼저 수정했습니다, 새로고침 후 다시 시도하세요" 안내 (요구사항 6.2)
- 중복 클릭 방지: 프론트엔드 버튼 disable(1차 방어) + 슬롯 조건부 업데이트 실패 시 자동 거부(근본적 방어, 요구사항 6.2/시나리오 8)

**에러 처리**
- 사용자에게는 한글 안내 메시지만 노출, 개발자용 오류 문장 노출 금지 (요구사항 6.4)
- 저장 실패 시 반드시 명확하게 실패를 알림
- 처리되지 않은 예외는 `system_error_log`에 기록, 관리자 화면에서 조회 가능
- 핵심 기능(예약 생성, 진료기록 저장)과 외부 서비스(알림 발송, AI 상담봇 호출) 분리: 핵심 트랜잭션은 DB 저장만으로 완료되고, 알림/AI 호출은 커밋 이후 별도로(best-effort) 처리 — 실패해도 예약/진료기록 자체는 유지 (요구사항 6.4)

## 섹션 4: `00010_` 이후 추가되는 공용 데이터 모델 (2·3·4단계 공통)

> ⚠️ **이 절은 위 `00001~00009`(이미 적용·구현된 기반)와 구분되는 신설분이다.** 직원 웹·환자 앱·상담봇을 세밀하게 설계하면서 비로소 필요해진 **여러 단계가 공통으로 쓰는 테이블·컬럼**을 한곳에 모은다. 실제 DB 반영은 **`supabase/migrations/00010_*.sql`부터 순차 파일**로 이뤄지며(논리 단위로 나누면 `00011`, `00012`로 이어감), 이 절은 그 마이그레이션과 각 영역 스펙이 참조하는 **단일 계약 원본**이다.
>
> **공용의 경계**: 아래 항목은 세 채널(앱·웹·봇) 중 둘 이상이 같은 저장소를 소비해 주인이 하나로 정해지지 않는 것만 담는다. **한 채널 전용은 그 영역 스펙에 둔다** — `device_tokens`(FCM 토큰)·가입 동의(consent)는 **환자 앱 스펙**, `chat_threads`·`chat_messages`·`support_tickets` 등 상담 스키마는 **상담봇 스펙**이 주인이며 앱·웹은 참조한다. 다만 `support_tickets.appointment_id` FK는 아래 ①의 `appointments`를 가리킨다.
>
> 각 항목의 근거는 결정로그(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md`)와 기능 갭 번호로 추적한다. 화면 동작 규칙은 `docs/design/screen-behaviors.md`가 원본이며 이 절은 "화면에 안 보이는 계약"(테이블·컬럼·제약·상태)만 확정한다.

### ① `appointments` 컬럼 추가 — 마감 후 취소·변경 공통 지원 요청 (갭 #6 / E3)

- **`support_requested_at`** (timestamptz, nullable): 마감이 지나 앱에서 직접 취소·변경할 수 없을 때, 환자가 `[상담 채팅 연결]`을 **누른 즉시** 기록한다. 옛 설계의 `cancellation_requested_at` **단일 필드를 폐기하고 이것으로 대체**한다.
- **`request_type`** (`취소` / `변경`): 취소와 변경을 하나의 기록·상담 연결·배지·`/today`·캘린더 흐름으로 처리하되 직원이 둘을 구분하는 값. 별도 취소/변경 칸으로 나누면 처리 로직이 두 벌이 되어 기각.
- **희망 일시는 저장하지 않는다.** 앱에서 새 시간을 고르면 확정된 것으로 오해하므로 새 시간은 상담 대화에서 정한다.
- **소비처**: 앱(기록·배지) · 직원 `/today`·예약 캘린더(`request_type` 표시, ⚠ 아이콘) · 상담봇 티켓(`support_tickets.appointment_id`로 예약 직접 연결). 전용 `/cancellation-requests` 대기열은 **되살리지 않는다**(중복 티켓 방지).
- 근거: 결정로그 마감 후 변경·재결정 절(`:4170~4260`), E3(`:4188~4191`, `:4273~4276`).

### ② `notification_log` 확장 — 단일 발송 원장 (갭 #110·#115·#119·#120·#121)

등록 환자와 익명 상담 연락처가 **같은 dispatcher·배칭·결과/재시도 원장**을 쓴다.

- 기존 칸: `id, appointment_id, patient_id, notification_type, channel, notification_date, sent_at`.
- **`appointment_id`를 nullable로 완화** — 광고 발송은 특정 예약이 없다(#110).
- **`sender_staff_id`** (nullable): 누가 보냈나. 자동 발송은 비운다(주체가 서버). 접수직원·관리자가 전 환자에게 보낼 수 있게 되어 추적이 필요(#115).
- **`target_count`**: 대상 수(전 환자 발송의 규모 기록, #115).
- **`kind`** (`transactional`(안내) / `marketing`(광고)): 광고는 법(정보통신망법)이 따로 있어 시스템이 갈라야 한다(#110, 갭 #104).
- **자유 본문 칸**: 직원이 직접 쓴 발송 문구를 보존(#110).
- **`delivery_status`** (`발송중` / `도달` / `실패` / `재시도중`): 표 이름이 log인데 성공/실패가 없었다(#119). 실패를 `system_error_log`로 보내면 "누구에게 실패했는지"를 담을 수 없다.
- **`failure_code`**: 업체 오류 코드. 영구/일시 실패를 갈라 재시도 여부를 판정(#119).
- **`retry_count`**: 자동 재시도 횟수(#119).
- **`channel`에 실제 보낸 채널을 기록** — 상수 `'push'` 박기 금지. 토큰이 없어 문자로 폴백해도 `'push'`로 남으면 문자 비용(건수)을 나중에 검증할 수 없다(#120).
- **익명 수신자용 컬럼**: `anonymous_session_id` + `anonymous_contact_id`. `patients`에 가짜 행을 만들거나 기존 환자를 추측 매칭하지 않으면서 같은 알림 품질·멱등성을 보장(상담봇 3-A, 채널=SMS·분류=transactional).
- **부분 유니크 인덱스(partial unique)**: "같은 예약·같은 종류는 한 번만"을 유지하되 **상태가 `실패`인 줄은 제약에서 제외**한다. 그래야 안 닿은 휴진 안내를 다시 보낼 수 있다 — "닿은 것만 「보냈다」로 본다"(#121). ⛔ 자물쇠 자체를 없애지 않는다.
- **기록·발송 순서**: 기록을 발송보다 먼저 넣는 구조에서는 실제 채널·결과를 발송 뒤 갱신하도록 순서를 정리한다(#120·#121).
- 근거: 결정로그 `:3014~3170`, `:3499~3597`, `:3615~3626`; 3-A 익명 수신대상 `:4554~4651`.

### ③ `notification_preferences` (신규 표) — 발송 직전 종류별 검사 (갭 #5 / #14)

- 환자별 **(알림 종류 on/off, 문자(SMS) 여부)**를 저장한다.
- **FCM 토큰은 삭제하지 않는다** — 하나를 껐는데 토큰을 지우면 전부 안 오게 되어 종류별 설계가 무의미해진다. 토큰은 `device_tokens`(환자 앱 소유)에 유지.
- **발송 함수 한 곳에서** 보내기 직전에 검사한다(발송 지점마다 넣으면 빠뜨린다). 끈 알림은 푸시·문자·앱 알림함 **어디에도 생성하지 않는다**.
- 필수 잠금 없이 **전부 끌 수 있다**(끌 때 안내 팝업만). 병원발 변경 알림도 끌 수 있으나, 앱을 열면 카드 위에 변경 안내+`[확인]`이 뜨는 장치(갭 #17)가 이를 받쳐준다.
- 근거: 결정로그 `:777~790`, `:3241~3247`; 규칙 `screen-behaviors.md:3266~3299`.

### ④ 알림 종류별 설정표 (신규 표) — 문구·문자 여부 (갭 #125·#126)

- `hospital_settings`는 한 행짜리 싱글턴이라 담을 수 없다 → **종류마다 한 줄인 새 표**: `(notification_type, body, also_sms)`. 종류를 키로 두면 11번째가 붙을 때 **줄 하나만 추가**된다(칸을 늘리지 않는다).
- **기본 문구는 DB에 넣지 않는다** — 발송 함수의 기본 문구 표(코드)가 그대로 기본값 원본이 되고, **DB에 줄이 없으면 코드 값을 쓰며 되돌리기는 그 줄을 지우는 것**이다.
- **문구 토큰**: 이름·날짜·시각은 버튼 토큰으로만 삽입하고 발송 시 치환한다. 날짜·시각은 `appointments.slot_id → appointment_slots(slot_date, start_time)`에서 꺼낸다. 당일 워크인처럼 `slot_id`가 없는 경우 그 자리만 조용히 빠지고 빈칸·`null`을 내보내지 않는다(편집 화면에서 미리 안내).
- **소비처**: 관리자 설정 화면(직원 웹)이 편집, 발송 함수(공용 dispatcher)가 읽음.
- 근거: 결정로그 `:3525~3539`; AD-067·068(`:3185~3187`).

### ⑤ `patients` 컬럼 추가 — 문자 실패 표식 (갭 #123)

- **`sms_dead`** (bool): 이 번호로 문자가 가지 않는다(직원 상세에 ⚠ 표시). 발송 목록을 뒤져서는 판정할 수 없어 환자 쪽에 붙는다.
- **`sms_dead_checked_at`**: 언제 확인했나. **번호를 고치면 두 칸을 비운다**.
- ⛔ 수신 차단은 여기 넣지 않는다 — 번호가 죽은 것이 아니라 환자의 선택이라 별개.
- 근거: 결정로그 `:3568~3572`.

### ⑥ `access_audit_log` 제약 확장 — 번호 열람 기록 (갭 #117)

- `resource_type` check 제약(`in ('patient_detail','medical_record')`)에 **`phone_reveal`을 추가**한다. 발송 이력에서 마스킹된 전화번호를 푸는 순간, 그 열람을 전수로 남긴다(`/admin/access-logs`의 "누가 이 환자 번호를 봤나" 조회가 환자별 필터를 쓰므로 묶어서 한 줄로 남기면 빠진다).
- 발송 명단을 **펼치는 것**(이름만 봄)은 발송 이력 줄로 충분하고, **번호를 푸는 것**만 이 표에 남긴다 — 둘은 다른 층.
- 근거: 결정로그 `:3582~3595`.

### ⑦ 예약 발송 큐 표 (신규 표) — 예약해 둔 발송 (갭 #118)

- 지금 보내지 않고 예약해 둔 발송을 담는 표. 전용 cron이 10분마다 큐를 확인해 때가 된 것을 보낸다(cron 추가 자체는 배포 플랜에 이미 있는 패턴).
- 직원 웹 "안내 보내기"의 **예약해 둔 것 목록**이 이 표를 읽는다 — 표가 없으면 그 화면 절반이 빈다.
- 근거: 결정로그 `:3597~3601`.

### ⑧ Twilio 도달 되알림 계약 (표 아님 — 공용 dispatcher 계약, 갭 #122)

- `messages.create()`가 즉시 주는 것은 `queued`(접수)까지다. 실제 도달·실패는 Twilio가 우리 서버로 되알려주는 것(status callback)을 받아야 안다.
- 필요: **공개 엔드포인트 하나** + `messages.create()`에 그 주소 전달 + **서명 검증**(아무나 두드려 "도달했다"고 거짓 보고하지 못하게 — 요구사항 6.5 비밀키 보호와 같은 자리) + 받은 상태를 ②의 `notification_log`에 반영.
- 📌 푸시는 필요 없다 — FCM은 죽은 토큰이면 즉시 예외를 던진다. 문자만의 문제.
- **소비처**: 배포 플랜(공개 주소·환경변수) · 발송 함수. 근거: 결정로그 `:3554~3560`.

## 이번 단계에서 다루지 않는 것 (다음 단계 스펙에서 다룸)

- 병원 안내·상담봇 지식 관리 콘텐츠 (3.8) → 4단계(상담봇)
- 상담 문의 관리 (3.9) → 4단계
- 운영 통계 화면 (3.10) → 2단계(직원용 웹), 단 통계에 필요한 `source` 필드 등은 이번 단계에서 이미 확보
- 알림 **발송 로직**/FCM·Twilio 연동, 알림 설정·알림함 화면 (4.7) → 3단계(환자 앱). 단 여러 단계가 공유하는 **알림 데이터 모델**(위 섹션 4 ②③④⑧)은 여기서 확정한다.
- `device_tokens`(FCM 토큰), 가입 동의(consent) 테이블 → 3단계(환자 앱 전용)
- `chat_threads`·`chat_messages`·`support_tickets` 등 상담 스키마 → 4단계(상담봇). 단 `support_tickets.appointment_id` FK가 가리키는 `appointments`는 위 섹션 4 ①에서 확장한다.
- 데이터 백업 운영 절차 (6.3) → 5단계(배포)
