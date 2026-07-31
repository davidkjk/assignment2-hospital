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

## 이번 단계에서 다루지 않는 것 (다음 단계 스펙에서 다룸)

- 병원 안내·상담봇 지식 관리 콘텐츠 (3.8) → 4단계(상담봇)
- 상담 문의 관리 (3.9) → 4단계
- 운영 통계 화면 (3.10) → 2단계(직원용 웹), 단 통계에 필요한 `source` 필드 등은 이번 단계에서 이미 확보
- 알림 발송 로직/FCM 연동 (4.7) → 3단계(환자 앱)
- 데이터 백업 운영 절차 (6.3) → 5단계(배포)
