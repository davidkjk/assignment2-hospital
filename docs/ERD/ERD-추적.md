# 병원 예약·진료·상담 통합 서비스 제작 요청사항

> 실습용 가상 고객 요청서
>
> 전제: 현재 만들어진 `환자 등록 → 의사 배정 → 진료 대기 → 진료기록 작성` 기능을 바탕으로 확장합니다.
>
> 요청 문체: 병원 원장 또는 운영실장이 개발자에게 설명하는 수준으로 작성했습니다. 개발 방법과 프로그램 구조는 개발자가 제안하되, 아래에서 설명하는 환자·직원 업무 흐름은 실제로 동작해야 합니다.

---

## 안녕하세요. 저희가 만들고 싶은 서비스에 대해 설명드립니다

저희는 의사 5~8명 정도가 근무하고 하루에 외래 환자 100명 안팎이 방문하는 병원이라고 생각해주시면 됩니다.

현재는 환자 예약을 전화와 메신저로 받고 있고, 접수 직원이 다시 엑셀이나 메모에 옮겨 적고 있습니다. 환자가 방문하면 예약 내용을 다시 확인하고, 담당 의사에게 전달합니다. 문의도 전화로 계속 들어와 직원들이 같은 내용을 반복해서 안내하고 있습니다.

기존에 만든 프로그램에는 환자를 등록하고 담당 의사를 배정한 뒤, 의사가 진료내용을 작성하는 기본 기능이 있다고 들었습니다. 이번에는 이 기능을 실제 병원에서 직원과 환자가 함께 사용할 수 있는 형태로 확장하고 싶습니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

꼭 필요한 결과물은 다음 세 가지입니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음

1. **병원 직원과 의사가 사용하는 웹 프로그램**
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
2. **환자가 사용하는 아이폰·안드로이드 모바일 앱**
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
3. **예약과 병원 이용 문의를 처리하는 AI 상담봇 에이전트**
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`

시연용 화면만 연결해놓는 것이 아니라, 웹·앱·상담봇에서 처리한 예약과 환자 정보가 모두 같은 내용으로 연결되어야 합니다.

---

# 1. 서비스를 사용하는 사람

## 1.1 환자

환자는 모바일 앱에서 본인 또는 가족의 진료를 예약하고, 방문 전에 필요한 내용을 입력하고, 예약과 대기 상태를 확인합니다. 병원 이용과 관련된 질문은 상담봇에게 할 수 있어야 합니다.
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`

## 1.2 접수 직원

접수 직원은 웹에서 예약 현황을 확인하고, 전화 예약과 당일 방문 환자를 직접 등록하고, 환자가 도착하면 접수 처리합니다. 환자가 현재 대기 중인지, 진료 중인지, 진료가 끝났는지도 확인합니다.

## 1.3 의사

의사는 웹에서 본인의 오늘 예약과 대기 환자를 보고, 과거 진료내용과 사전문진을 확인한 뒤 진료기록을 작성합니다.

## 1.4 병원 관리자

관리자는 직원과 의사 계정을 만들고, 진료과·진료시간·휴진일·예약 가능 시간을 관리합니다. 병원 운영 현황과 상담봇 처리 현황도 확인합니다.

## 1.5 AI 상담봇

상담봇은 병원 안내, 진료과 선택 도움, 예약 가능 시간 조회, 예약 신청, 예약 변경·취소 안내, 검사 전 준비사항 같은 문의를 처리합니다.

상담봇은 의사처럼 진단하거나 약을 추천하면 안 됩니다. 답변하기 어려운 질문이나 의료 판단이 필요한 질문은 직원에게 넘겨야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

---

# 2. 전체적으로 원하는 이용 흐름

환자가 모바일 앱에서 진료과와 의사를 고르고 가능한 시간을 확인해 예약합니다. 무엇을 선택해야 할지 모르겠으면 상담봇과 대화하면서 적절한 진료과와 예약 가능한 시간을 안내받습니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

예약이 확정되면 환자는 방문 전에 간단한 사전문진을 작성합니다. 예약 전날과 당일에는 알림을 받습니다.

환자가 병원에 도착하면 접수 직원이 예약을 확인하고 `도착`으로 변경합니다. 예약 없이 방문한 환자도 직원이 바로 등록할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

의사는 자신의 화면에서 현재 대기 환자와 사전문진 내용을 확인합니다. 진료가 끝나면 기록을 작성하고 완료합니다.

환자는 앱에서 진료 완료 여부와 병원이 환자에게 공개하기로 한 방문 안내를 확인합니다. 자세한 진단기록 전체를 환자 앱에 그대로 보여줄 필요는 없습니다.
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`

관리자는 하루가 끝난 뒤 예약, 취소, 방문, 대기시간, 상담봇 문의와 직원 연결 현황을 확인합니다.

---

# 3. 병원 직원용 웹 프로그램

## 3.1 로그인과 직원별 권한

기존에는 접수 직원이 로그인하지 않아도 환자 정보를 볼 수 있다고 들었습니다. 실제 운영에서는 환자 정보가 있기 때문에 모든 직원이 로그인해야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

- 접수 직원, 의사, 관리자의 메뉴가 서로 달라야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 관리자가 직원과 의사 계정을 만들거나 사용 중지할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 의사가 직접 회원가입해서 계정을 만드는 방식은 사용하지 않습니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 일정 시간 동안 사용하지 않으면 자동으로 로그아웃되면 좋겠습니다.
> **ERD 추적:** 인증·세션 만료·복구는 auth.users와 인증 정책 영역입니다. 세션 만료시각 컬럼은 현재 ERD에 없습니다.
> **근거:** `auth.users`, `patients.auth_user_id`, `patients.phone`, `정책·누락 후보: 세션 만료`
- 환자 전화번호와 생년월일은 목록에서 일부가 가려져 보여야 합니다.
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`
- 누가 환자정보와 진료기록을 열어봤는지 관리자가 확인할 수 있어야 합니다.
> **ERD 추적:** 민감정보를 열어본 직원·환자·자료 종류·시각은 감사 로그로 추적합니다. 관리자만 볼 수 있게 RLS를 적용해야 합니다.
> **근거:** `access_audit_log.staff_id`, `access_audit_log.patient_id`, `access_audit_log.resource_type`, `access_audit_log.accessed_at`, `RLS`

## 3.2 오늘의 병원 현황

직원이 로그인하면 가장 먼저 오늘 상황을 볼 수 있었으면 합니다.

한 화면에서 다음 내용을 확인하고 싶습니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`

- 오늘 전체 예약 환자 수
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 현재 도착한 환자
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 현재 대기 중인 환자
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 진료 중인 환자
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 진료가 끝난 환자
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 취소와 예약 부도 환자
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 의사별 현재 대기 인원
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 오래 기다리고 있는 환자
> **ERD 추적:** 대기 순서는 queue_position으로, 장기대기 기준은 병원 설정으로 추적합니다.
> **근거:** `appointments.queue_position`, `hospital_settings.long_wait_threshold_minutes`, `appointments.status`
- 상담 직원의 확인이 필요한 문의
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`

숫자만 보여주는 화면보다 지금 처리해야 할 환자와 문제가 먼저 보였으면 합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`

## 3.3 예약 캘린더

예약은 하루·주간 단위로 볼 수 있어야 합니다.
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`

- 진료과별, 의사별로 예약을 걸러서 볼 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 빈 시간, 예약된 시간, 휴진 시간을 쉽게 구분하고 싶습니다.
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`
- 접수 직원이 전화로 들어온 예약을 대신 등록할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 기존 환자는 전화번호와 생년월일로 찾고, 신규 환자는 기본정보를 입력해서 등록합니다.
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`
- 예약 시간을 변경하거나 취소할 수 있어야 합니다.
> **ERD 추적:** 현재 예약 상태와 변경 이력의 행위자·사유로 남깁니다. 이전 슬롯과 새 슬롯을 함께 남기는 전용 컬럼은 현재 ERD에 없습니다.
> **근거:** `appointments.slot_id`, `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.reason`, `appointment_status_history.changed_by`, `appointment_status_history.changed_at`, `누락 후보: 이전/새 슬롯`
- 변경과 취소 사유를 간단히 남길 수 있어야 합니다.
> **ERD 추적:** 현재 예약 상태와 변경 이력의 행위자·사유로 남깁니다. 이전 슬롯과 새 슬롯을 함께 남기는 전용 컬럼은 현재 ERD에 없습니다.
> **근거:** `appointments.slot_id`, `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.reason`, `appointment_status_history.changed_by`, `appointment_status_history.changed_at`, `누락 후보: 이전/새 슬롯`
- 같은 의사와 같은 시간에 예약이 겹치지 않아야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 당일 급한 환자를 추가할 수 있지만, 기존 예약 사이에 넣는 경우 직원에게 경고를 보여주세요.
> **ERD 추적:** 직원 주의 표시는 is_urgent_flag로 표현하지만 의학적 응급 판정은 별도 임상정책입니다.
> **근거:** `appointments.is_urgent_flag`, `정책`
- 의사의 휴진이나 일정 변경 때문에 예약을 옮겨야 하면 영향을 받는 환자 목록을 한 번에 확인하고 안내 대상을 정할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

## 3.4 환자 도착과 대기 관리

환자가 병원에 도착하면 예약을 찾아 `도착` 처리합니다.

예약 상태는 다음과 같이 구분하고 싶습니다.
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`

- 예약 신청
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 예약 확정
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 도착
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 진료 대기
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 진료 중
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 진료 완료
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 환자 취소
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 병원 취소
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 예약 부도
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`

예약 없이 방문한 환자는 현재 만들어진 접수 기능처럼 전화번호로 기존 환자를 찾거나 신규로 등록한 뒤 담당 의사를 선택할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

접수 직원은 대기 순서를 조정할 수 있어야 하지만, 순서를 바꾼 사람과 이유가 남아야 합니다. 응급하거나 먼저 봐야 하는 환자는 별도의 주의 표시를 할 수 있으면 좋겠습니다. 단, 이 표시가 의학적 응급도 판정을 대신하는 기능은 아닙니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

## 3.5 환자 정보

환자 상세 화면에서는 다음 내용을 한 번에 보고 싶습니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`

- 기본정보와 연락처
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`
- 본인 또는 가족 관계
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`
- 최근 예약과 방문 이력
> **ERD 추적:** 예약과 상태 이력, 대상 환자 FK로 환자의 최근 방문을 조회합니다.
> **근거:** `appointments.for_patient_id`, `appointments.slot_id`, `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 현재 예약 상태
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 작성한 사전문진
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 완료된 과거 진료기록
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- 상담봇 문의 중 직원에게 전달된 내용
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`
- 직원이 남긴 내부 메모
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`

동명이인을 구분할 수 있도록 생년월일과 연락처를 함께 보여주세요. 환자를 잘못 선택한 상태에서 기록하지 않도록 저장 전에 이름과 생년월일을 다시 확인할 수 있으면 좋겠습니다.
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`

## 3.6 의사의 진료 화면

의사는 본인의 오늘 환자만 기본으로 봅니다. 필요하면 날짜를 바꿔 과거 환자를 찾을 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

진료 화면에는 다음 내용이 필요합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`

- 현재 대기 환자 목록과 대기시간
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 환자의 기본정보
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`
- 오늘 예약 이유
> **ERD 추적:** 예약 사유는 appointments.reason으로 저장합니다.
> **근거:** `appointments.reason`
- 환자가 작성한 사전문진
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 완료된 과거 진료기록
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- 오늘 증상, 진단, 처치 또는 안내사항 작성란
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- 자주 사용하는 진료문구를 불러오는 기능
> **ERD 추적:** 의사별 상용구 테이블로 추적합니다.
> **근거:** `doctor_quick_phrases.doctor_id`, `doctor_quick_phrases.text`
- 임시저장
> **ERD 추적:** 완료 여부·마지막 수정시각·수정 이력의 이전 내용/사유/작성자로 추적하며 일반 삭제 금지는 권한 정책입니다.
> **근거:** `medical_records.is_completed`, `medical_records.updated_at`, `medical_record_revisions.previous_content`, `medical_record_revisions.reason`, `medical_record_revisions.revised_by`, `medical_record_revisions.revised_at`, `RLS`
- 진료 완료
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`

기존 프로그램은 진료기록을 한 번 저장하면 수정할 수 없다고 들었습니다. 실제로는 오타나 누락을 고쳐야 할 수 있습니다.

- 진료 완료 전에는 임시저장과 수정이 가능해야 합니다.
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 완료한 뒤 수정하려면 수정 이유를 반드시 입력해야 합니다.
> **ERD 추적:** 완료 여부·마지막 수정시각·수정 이력의 이전 내용/사유/작성자로 추적하며 일반 삭제 금지는 권한 정책입니다.
> **근거:** `medical_records.is_completed`, `medical_records.updated_at`, `medical_record_revisions.previous_content`, `medical_record_revisions.reason`, `medical_record_revisions.revised_by`, `medical_record_revisions.revised_at`, `RLS`
- 이전 내용은 없어지지 않고 누가 언제 무엇을 고쳤는지 남아야 합니다.
> **ERD 추적:** 완료 여부·마지막 수정시각·수정 이력의 이전 내용/사유/작성자로 추적하며 일반 삭제 금지는 권한 정책입니다.
> **근거:** `medical_records.is_completed`, `medical_records.updated_at`, `medical_record_revisions.previous_content`, `medical_record_revisions.reason`, `medical_record_revisions.revised_by`, `medical_record_revisions.revised_at`, `RLS`
- 진료기록을 일반 직원이 임의로 삭제할 수 없게 해주세요.
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`

## 3.7 진료과·의사 일정 관리

관리자는 다음 내용을 관리할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

- 진료과 추가·수정·사용 중지
> **ERD 추적:** 직원 계정 생성·비활성은 직원과 처리자를 연결해 추적합니다.
> **근거:** `staff.id`, `staff.auth_user_id`, `staff.role`, `staff.is_active`, `staff.deactivated_by`, `staff.deactivated_at`
- 의사별 진료 요일과 시간
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 예약 한 칸의 기본 시간(예: 15분·20분·30분)
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`
- 점심시간과 휴진일
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`
- 특정 날짜의 진료시간 변경
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`
- 의사별 하루 최대 예약 인원
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 예약 마감 시간
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`

일정을 변경했을 때 이미 예약된 환자가 있으면 바로 저장하기 전에 경고해주세요.
> **ERD 추적:** 일정 예외와 needs_rescheduling으로 영향 예약을 표시하고 알림·상태 이력으로 안내를 추적합니다.
> **근거:** `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `appointments.needs_rescheduling`, `notification_log.appointment_id`, `appointment_status_history.reason`

## 3.8 병원 안내와 상담봇용 지식 관리

관리자가 상담봇이 참고할 병원 안내를 직접 관리할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

- 진료과와 의사 소개
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 진료시간과 휴진일
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`
- 병원 위치와 주차 안내
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 예약·변경·취소 규칙
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 검사 전 준비사항
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 자주 묻는 질문
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 상담봇이 답하면 안 되는 내용
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`

수정한 내용은 바로 공개하지 않고 관리자가 확인한 뒤 적용할 수 있으면 좋겠습니다. 이전 내용과 수정 이력도 남겨주세요.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

## 3.9 상담 문의 관리

상담봇이 해결하지 못한 문의는 직원용 웹에 표시되어야 합니다.

- 환자 질문과 상담봇 답변 내용을 같이 확인합니다.
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`
- 상담봇이 직원을 호출한 이유를 보여줍니다.
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`
- 새 문의, 처리 중, 답변 완료로 상태를 나눕니다.
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`
- 직원이 답변을 남기면 환자 앱에 전달됩니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 의료진의 판단이 필요한 경우 접수 직원이 임의로 답하지 않고 담당 의사 또는 관리자에게 전달할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 자주 들어오지만 상담봇이 답하지 못한 질문은 별도로 모아볼 수 있어야 합니다.
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`

## 3.10 운영 통계

관리자는 기간을 선택해서 다음 내용을 보고 싶습니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

- 예약, 취소, 예약 부도, 실제 방문 건수
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 진료과와 의사별 예약 현황
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 시간대별 방문 환자 수
> **ERD 추적:** 통계는 예약·상태 이력·상담 티켓을 집계하면 되지만 별도 통계 테이블/다운로드 컬럼은 없습니다.
> **근거:** `appointments.status`, `appointment_status_history.changed_at`, `support_tickets.status`, `누락 후보: 통계 스냅샷·파일 다운로드`
- 평균 대기시간과 오래 기다린 사례
> **ERD 추적:** 대기 순서는 queue_position으로, 장기대기 기준은 병원 설정으로 추적합니다.
> **근거:** `appointments.queue_position`, `hospital_settings.long_wait_threshold_minutes`, `appointments.status`
- 모바일 앱 예약과 직원 등록 예약의 비율
> **ERD 추적:** 예약 생성자는 created_by, 생성 경로는 source로 기록합니다.
> **근거:** `appointments.created_by`, `appointments.source`, `appointments.account_patient_id`, `appointments.for_patient_id`
- 상담봇 문의 수
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`
- 상담봇이 자체 안내한 문의와 직원에게 넘긴 문의
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`
- 많이 들어온 질문
> **ERD 추적:** 통계는 예약·상태 이력·상담 티켓을 집계하면 되지만 별도 통계 테이블/다운로드 컬럼은 없습니다.
> **근거:** `appointments.status`, `appointment_status_history.changed_at`, `support_tickets.status`, `누락 후보: 통계 스냅샷·파일 다운로드`

필요하면 현재 보고 있는 목록을 엑셀에서 열 수 있는 파일로 내려받을 수 있어야 합니다. 통계 숫자를 누르면 해당 환자나 예약 목록을 확인할 수 있으면 좋겠습니다.
> **ERD 추적:** 통계는 예약·상태 이력·상담 티켓을 집계하면 되지만 별도 통계 테이블/다운로드 컬럼은 없습니다.
> **근거:** `appointments.status`, `appointment_status_history.changed_at`, `support_tickets.status`, `누락 후보: 통계 스냅샷·파일 다운로드`

---

# 4. 환자용 모바일 앱

## 4.1 회원가입과 본인 확인

- 휴대전화 번호로 가입하고 로그인할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 인증번호를 받아 본인 확인하는 방식이면 좋겠습니다.
> **ERD 추적:** 인증·세션 만료·복구는 auth.users와 인증 정책 영역입니다. 세션 만료시각 컬럼은 현재 ERD에 없습니다.
> **근거:** `auth.users`, `patients.auth_user_id`, `patients.phone`, `정책·누락 후보: 세션 만료`
- 이름, 생년월일, 성별, 전화번호를 기본정보로 받습니다.
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`
- 환자가 비밀번호나 로그인 정보를 잊었을 때 다시 찾을 수 있어야 합니다.
> **ERD 추적:** 인증·세션 만료·복구는 auth.users와 인증 정책 영역입니다. 세션 만료시각 컬럼은 현재 ERD에 없습니다.
> **근거:** `auth.users`, `patients.auth_user_id`, `patients.phone`, `정책·누락 후보: 세션 만료`
- 로그아웃과 회원 탈퇴 요청 기능이 필요합니다.
> **ERD 추적:** 환자 활성 상태와 인증 제공자 정책으로 처리합니다. 탈퇴 보존/삭제 방식은 운영정책 결정이 필요합니다.
> **근거:** `patients.auth_user_id`, `patients.is_active`, `auth.users`, `정책`
- 민감한 화면을 오래 열어둔 경우 다시 인증을 요구하면 좋겠습니다.
> **ERD 추적:** 인증·세션 만료·복구는 auth.users와 인증 정책 영역입니다. 세션 만료시각 컬럼은 현재 ERD에 없습니다.
> **근거:** `auth.users`, `patients.auth_user_id`, `patients.phone`, `정책·누락 후보: 세션 만료`

## 4.2 가족 등록

부모가 자녀를 예약하거나 자녀가 부모 예약을 도와주는 경우가 많습니다.

- 내 계정에 가족을 등록할 수 있어야 합니다.
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`
- 가족의 이름, 생년월일, 관계를 입력합니다.
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`
- 예약할 때 본인인지 가족인지 선택합니다.
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`
- 가족정보를 변경하거나 연결을 해제할 수 있어야 합니다.
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`
- 가족의 전체 진료기록을 임의로 보는 기능은 넣지 말고, 예약과 병원에서 공개한 안내만 확인하게 해주세요.
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`

## 4.3 진료 예약

환자는 다음 순서로 예약합니다.

1. 본인 또는 가족 선택
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`
2. 진료과 선택
> **ERD 추적:** 진료과·의사·슬롯 관계로 조회합니다.
> **근거:** `departments.id`, `staff.id`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`
3. 의사 선택
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
4. 날짜 선택
> **ERD 추적:** 진료과·의사·슬롯 관계로 조회합니다.
> **근거:** `departments.id`, `staff.id`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`
5. 가능한 시간 선택
> **ERD 추적:** 진료과·의사·슬롯 관계로 조회합니다.
> **근거:** `departments.id`, `staff.id`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`
6. 방문 이유 간단히 입력
> **ERD 추적:** 예약 사유는 appointments.reason으로 저장합니다.
> **근거:** `appointments.reason`
7. 예약내용 최종 확인
> **ERD 추적:** 예약 확인용 코드는 booking_code로 저장하며 QR은 화면 표현입니다.
> **근거:** `appointments.booking_code`, `appointments.booking_code_expires_at`
8. 예약 신청 또는 확정
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`

- 예약 가능한 시간만 보여주세요.
> **ERD 추적:** 진료과·의사·슬롯 관계로 조회합니다.
> **근거:** `departments.id`, `staff.id`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`
- 이미 다른 사람이 선택한 시간은 다시 예약되지 않아야 합니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 예약이 확정됐는지 신청만 된 상태인지 구분해주세요.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 예약 변경과 취소가 가능해야 합니다.
> **ERD 추적:** 현재 예약 상태와 변경 이력의 행위자·사유로 남깁니다. 이전 슬롯과 새 슬롯을 함께 남기는 전용 컬럼은 현재 ERD에 없습니다.
> **근거:** `appointments.slot_id`, `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.reason`, `appointment_status_history.changed_by`, `appointment_status_history.changed_at`, `누락 후보: 이전/새 슬롯`
- 병원이 정한 시간 이후에는 앱에서 직접 취소하지 못하고 상담으로 연결해주세요.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 예약 전날과 당일에 알림을 받고 싶습니다.
> **ERD 추적:** 기기 토큰과 알림 발송 기록으로 추적합니다. 외부 발송업체 자격증명·재시도 정책은 ERD 밖입니다.
> **근거:** `device_tokens.patient_id`, `device_tokens.fcm_token`, `notification_log.appointment_id`, `notification_log.patient_id`, `notification_log.notification_type`, `notification_log.channel`, `notification_log.sent_at`, `정책`

## 4.4 사전문진

예약 후 방문 전에 간단한 사전문진을 작성합니다.

- 오늘 불편한 증상
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- 증상이 시작된 시점
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 현재 복용 중인 약이 있는지
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 알레르기가 있는지
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 임신 가능성처럼 병원이 꼭 확인해야 하는 항목
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 의사에게 미리 전하고 싶은 내용
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

진료과에 따라 질문을 다르게 설정할 수 있어야 합니다. 환자는 진료 전까지 내용을 수정할 수 있고, 의사는 진료 화면에서 확인합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

상담봇이 대화 중 받은 내용이 사전문진에 들어갈 경우에는 환자에게 내용을 보여주고 저장 여부를 다시 확인받아야 합니다.
> **ERD 추적:** 이름·생년월일·연락처를 함께 확인하는 화면 규칙이며 환자 컬럼이 근거입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.phone`, `정책`

## 4.5 나의 예약과 방문 상태

앱 첫 화면에서는 가장 가까운 예약을 먼저 보여주세요.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`

- 예약 일시, 진료과, 의사, 병원 위치
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 예약 확정 여부
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 사전문진 작성 여부
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 변경·취소
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 병원에 보여줄 예약 확인용 QR 또는 예약번호
> **ERD 추적:** 예약 확인용 코드는 booking_code로 저장하며 QR은 화면 표현입니다.
> **근거:** `appointments.booking_code`, `appointments.booking_code_expires_at`

병원에 도착한 뒤에는 다음 상태를 확인할 수 있으면 좋겠습니다.
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`

- 도착 확인
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 현재 진료 대기
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 내 앞 대기 인원
> **ERD 추적:** 대기 순서는 queue_position으로, 장기대기 기준은 병원 설정으로 추적합니다.
> **근거:** `appointments.queue_position`, `hospital_settings.long_wait_threshold_minutes`, `appointments.status`
- 진료 중
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 진료 완료
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`

정확한 진료 시작 시간을 약속하는 것처럼 보이지 않게 `예상 대기시간은 변동될 수 있습니다`라는 안내를 표시해주세요.
> **ERD 추적:** 대기 순서는 queue_position으로, 장기대기 기준은 병원 설정으로 추적합니다.
> **근거:** `appointments.queue_position`, `hospital_settings.long_wait_threshold_minutes`, `appointments.status`

## 4.6 방문 이력

환자는 과거 방문일, 진료과, 담당 의사, 병원에서 공개한 진료 후 안내를 볼 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

의사가 작성한 내부 진료기록 전체와 내부 메모는 앱에 그대로 노출하지 않습니다. 어떤 내용을 환자에게 보여줄지는 진료 완료 시 의사가 구분할 수 있게 해주세요.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

## 4.7 알림

환자에게 다음 알림을 보낼 수 있어야 합니다.
> **ERD 추적:** 기기 토큰과 알림 발송 기록으로 추적합니다. 외부 발송업체 자격증명·재시도 정책은 ERD 밖입니다.
> **근거:** `device_tokens.patient_id`, `device_tokens.fcm_token`, `notification_log.appointment_id`, `notification_log.patient_id`, `notification_log.notification_type`, `notification_log.channel`, `notification_log.sent_at`, `정책`

- 예약 신청과 확정
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 예약 전날·당일 알림
> **ERD 추적:** 기기 토큰과 알림 발송 기록으로 추적합니다. 외부 발송업체 자격증명·재시도 정책은 ERD 밖입니다.
> **근거:** `device_tokens.patient_id`, `device_tokens.fcm_token`, `notification_log.appointment_id`, `notification_log.patient_id`, `notification_log.notification_type`, `notification_log.channel`, `notification_log.sent_at`, `정책`
- 예약 변경과 병원 취소
> **ERD 추적:** 현재 예약 상태와 변경 이력의 행위자·사유로 남깁니다. 이전 슬롯과 새 슬롯을 함께 남기는 전용 컬럼은 현재 ERD에 없습니다.
> **근거:** `appointments.slot_id`, `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.reason`, `appointment_status_history.changed_by`, `appointment_status_history.changed_at`, `누락 후보: 이전/새 슬롯`
- 사전문진 미작성 안내
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 직원 상담 답변 도착
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 진료 완료 후 병원 안내
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`

앱 푸시알림을 기본으로 하고, 앱을 설치하지 않았거나 꼭 필요한 경우에는 문자로도 발송할 수 있게 준비해주세요. 문자 발송 비용과 발송업체 계정은 병원에서 별도로 준비할 수 있습니다.
> **ERD 추적:** 기기 토큰과 알림 발송 기록으로 추적합니다. 외부 발송업체 자격증명·재시도 정책은 ERD 밖입니다.
> **근거:** `device_tokens.patient_id`, `device_tokens.fcm_token`, `notification_log.appointment_id`, `notification_log.patient_id`, `notification_log.notification_type`, `notification_log.channel`, `notification_log.sent_at`, `정책`

## 4.8 접근성과 사용 편의

병원 앱은 중장년층도 많이 사용합니다.

- 글씨가 너무 작지 않아야 합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 중요한 버튼은 한 화면에 여러 개를 작게 배치하지 말아주세요.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 입력 오류가 있으면 무엇을 고쳐야 하는지 한글로 알려주세요.
> **ERD 추적:** 시스템 오류 로그로 기능·메시지·시각을 남깁니다. 외부 장애 시 예약/진료 유지와 재시도는 인프라 정책입니다.
> **근거:** `system_error_log.feature`, `system_error_log.message`, `system_error_log.occurred_at`, `정책·인프라`
- 인터넷이 끊겼을 때 저장된 것처럼 보이면 안 됩니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 처리 중에는 버튼을 여러 번 눌러 중복 예약이 생기지 않게 해주세요.
> **ERD 추적:** 슬롯의 의사·날짜·시각 고유성과 예약 생성 트랜잭션으로 방지합니다. 반복 클릭용 idempotency key는 현재 ERD에 없습니다.
> **근거:** `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointments.slot_id`, `UNIQUE(doctor_id,slot_date,start_time)`, `누락 후보: idempotency key`

---

# 5. AI 상담봇 에이전트

## 5.1 상담봇이 등장하는 곳

- 모바일 앱의 `AI 상담` 메뉴
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 병원 홈페이지에 붙일 수 있는 웹 상담창
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음

모바일과 웹에서 상담한 내용은 같은 상담 관리 화면에서 볼 수 있어야 합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`

## 5.2 상담봇이 처리할 문의

상담봇은 병원이 승인한 안내자료를 기준으로 다음 내용을 답합니다.

- 진료시간과 휴진일
> **ERD 추적:** 진료과, 반복 일정, 예외 일정, 슬롯과 병원 설정이 근거입니다.
> **근거:** `departments.id`, `departments.name`, `departments.is_active`, `doctor_schedule_rules.doctor_id`, `doctor_schedule_rules.weekday`, `doctor_schedule_rules.start_time`, `doctor_schedule_rules.end_time`, `doctor_schedule_rules.slot_duration_minutes`, `doctor_schedule_rules.lunch_start`, `doctor_schedule_rules.lunch_end`, `doctor_schedule_rules.max_daily_appointments`, `doctor_schedule_rules.booking_deadline`, `doctor_schedule_exceptions.doctor_id`, `doctor_schedule_exceptions.exception_date`, `doctor_schedule_exceptions.is_closed`, `doctor_schedule_exceptions.override_start_time`, `doctor_schedule_exceptions.override_end_time`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`, `hospital_settings.cancellation_deadline_hours`
- 진료과와 의사 안내
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 위치, 주차, 대중교통
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 예약 방법
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 예약 변경·취소 규칙
> **ERD 추적:** 현재 예약 상태와 변경 이력의 행위자·사유로 남깁니다. 이전 슬롯과 새 슬롯을 함께 남기는 전용 컬럼은 현재 ERD에 없습니다.
> **근거:** `appointments.slot_id`, `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.reason`, `appointment_status_history.changed_by`, `appointment_status_history.changed_at`, `누락 후보: 이전/새 슬롯`
- 검사나 방문 전 준비사항
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 준비물과 병원 이용 안내
> **ERD 추적:** 관리되는 병원 지식자료와 승인 대기 수정안, 검색 조각으로 추적합니다.
> **근거:** `kb_documents.title`, `kb_documents.category`, `kb_documents.content`, `kb_documents.status`, `kb_documents.is_restricted`, `kb_documents.has_pending_edit`, `kb_documents.pending_content`, `kb_documents.approved_by`, `kb_documents.approved_at`, `kb_chunks.document_id`, `kb_chunks.content`, `kb_chunks.embedding`
- 현재 예약 확인(로그인한 환자만)
> **ERD 추적:** 예약 확인용 코드는 booking_code로 저장하며 QR은 화면 표현입니다.
> **근거:** `appointments.booking_code`, `appointments.booking_code_expires_at`
- 가능한 예약시간 조회
> **ERD 추적:** 진료과·의사·슬롯 관계로 조회합니다.
> **근거:** `departments.id`, `staff.id`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`

## 5.3 진료과 선택 도움

환자가 어느 진료과를 선택해야 할지 모르는 경우 상담봇이 불편한 증상과 원하는 방문 목적을 몇 가지 질문할 수 있습니다.
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`

다만 다음 원칙은 반드시 지켜주세요.

- 병명을 진단하지 않습니다.
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- 약이나 치료법을 추천하지 않습니다.
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- `○○병으로 보입니다`처럼 확정적으로 말하지 않습니다.
> **ERD 추적:** 의료 안전 규칙은 ERD 컬럼이 아니라 AI 라우팅/콘텐츠 정책입니다. route 기록은 보조 근거입니다.
> **근거:** `chat_messages.route_taken`, `kb_documents.is_restricted`, `정책·누락 후보: AI 안전 규칙`
- 가능한 진료과를 안내하되 최종 선택은 환자가 확인합니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 심한 흉통, 호흡곤란, 의식 저하 등 긴급한 표현이 나오면 일반 예약을 계속 진행하지 않고 119 또는 응급실 이용을 안내합니다.
> **ERD 추적:** 직원 주의 표시는 is_urgent_flag로 표현하지만 의학적 응급 판정은 별도 임상정책입니다.
> **근거:** `appointments.is_urgent_flag`, `정책`
- 긴급 여부 판단을 완벽하게 보장한다고 표현하지 않습니다.
> **ERD 추적:** 의료 안전 규칙은 ERD 컬럼이 아니라 AI 라우팅/콘텐츠 정책입니다. route 기록은 보조 근거입니다.
> **근거:** `chat_messages.route_taken`, `kb_documents.is_restricted`, `정책·누락 후보: AI 안전 규칙`

## 5.4 상담 중 예약

상담봇은 대화 내용에 따라 진료과와 예약 가능한 시간을 보여줄 수 있습니다.
> **ERD 추적:** 진료과·의사·슬롯 관계로 조회합니다.
> **근거:** `departments.id`, `staff.id`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`

- 상담봇이 환자 대신 몰래 예약하지 않습니다.
> **ERD 추적:** 대화, 예약 카드, 실제 예약의 연결입니다.
> **근거:** `chat_conversations.id`, `chat_messages.message_type`, `chat_booking_cards.conversation_id`, `chat_booking_cards.for_patient_id`, `chat_booking_cards.department_id`, `chat_booking_cards.doctor_id`, `chat_booking_cards.slot_id`, `chat_booking_cards.nonce`, `chat_booking_cards.used_at`, `appointments.source`
- 환자, 진료과, 의사, 날짜, 시간을 마지막에 한 번 더 보여줍니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 환자가 `이 내용으로 예약`을 눌러야 실제 예약됩니다.
> **ERD 추적:** 대화, 예약 카드, 실제 예약의 연결입니다.
> **근거:** `chat_conversations.id`, `chat_messages.message_type`, `chat_booking_cards.conversation_id`, `chat_booking_cards.for_patient_id`, `chat_booking_cards.department_id`, `chat_booking_cards.doctor_id`, `chat_booking_cards.slot_id`, `chat_booking_cards.nonce`, `chat_booking_cards.used_at`, `appointments.source`
- 예약이 완료되면 예약번호와 사전문진으로 이동하는 버튼을 보여줍니다.
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 선택한 시간이 대화 중 다른 환자에게 예약되면 다시 가능한 시간을 안내합니다.
> **ERD 추적:** 진료과·의사·슬롯 관계로 조회합니다.
> **근거:** `departments.id`, `staff.id`, `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointment_slots.status`

## 5.5 모르는 질문과 직원 연결

상담봇이 병원 자료에서 답을 찾지 못했거나 다음 상황이면 직원에게 넘깁니다.

- 의료진의 판단이 필요한 질문
> **ERD 추적:** 의료 안전 규칙은 ERD 컬럼이 아니라 AI 라우팅/콘텐츠 정책입니다. route 기록은 보조 근거입니다.
> **근거:** `chat_messages.route_taken`, `kb_documents.is_restricted`, `정책·누락 후보: AI 안전 규칙`
- 환자가 상담봇 답변이 도움이 되지 않았다고 선택한 경우
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`
- 예약정보와 병원정보가 서로 맞지 않는 경우
> **ERD 추적:** 공유 데이터 자체는 appointments/status/history가 담당하며 실시간 동기화는 애플리케이션 인프라입니다.
> **근거:** `appointments.id`, `appointments.status`, `appointment_status_history.changed_at`, `정책·인프라`
- 불만, 사고, 개인정보, 비용 분쟁과 관련된 문의
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`
- 같은 질문을 반복했지만 해결되지 않은 경우
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`

직원에게 넘길 때는 환자가 처음부터 다시 설명하지 않도록 다음 내용을 요약해서 전달해주세요.
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`

- 환자가 궁금해한 내용
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`
- 상담봇이 확인한 정보
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`
- 이미 안내한 내용
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`
- 해결되지 않은 이유
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`
- 직원이 확인할 사항
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`

업무시간에는 직원에게 연결하고, 업무시간 밖에는 문의를 남겨 다음 영업일에 답변받도록 합니다.
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`

## 5.6 상담봇 답변 관리

- 상담봇은 관리자가 승인한 병원 자료만 근거로 답해야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 답변에 사용한 병원 안내가 무엇인지 직원이 확인할 수 있어야 합니다.
> **ERD 추적:** 답변 근거·오답 피드백·지식자료 수정 이력으로 추적합니다. source_chunk_ids는 배열이라 정식 FK가 아닙니다.
> **근거:** `chat_messages.source_chunk_ids`, `answer_feedback.message_id`, `answer_feedback.correction_text`, `answer_feedback.status`, `answer_feedback.reviewed_by`, `answer_feedback.applied_document_id`, `kb_document_revisions.document_id`, `kb_document_revisions.previous_content`
- 답을 찾지 못하면 모르는 내용을 만들어내지 않아야 합니다.
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`
- 직원이 잘못된 답변을 발견하면 `잘못된 답변`으로 표시하고 올바른 안내를 남길 수 있어야 합니다.
> **ERD 추적:** 답변 근거·오답 피드백·지식자료 수정 이력으로 추적합니다. source_chunk_ids는 배열이라 정식 FK가 아닙니다.
> **근거:** `chat_messages.source_chunk_ids`, `answer_feedback.message_id`, `answer_feedback.correction_text`, `answer_feedback.status`, `answer_feedback.reviewed_by`, `answer_feedback.applied_document_id`, `kb_document_revisions.document_id`, `kb_document_revisions.previous_content`
- 수정 내용은 관리자 확인 후 상담봇 안내에 반영합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 환자 개인정보와 전체 진료기록을 상담봇이 마음대로 검색하지 못하게 해주세요.
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`

---

# 6. 웹·앱·상담봇이 함께 지켜야 하는 규칙

## 6.1 정보가 서로 맞아야 합니다

- 앱에서 예약하면 직원 웹에 바로 나타나야 합니다.
> **ERD 추적:** 공유 데이터 자체는 appointments/status/history가 담당하며 실시간 동기화는 애플리케이션 인프라입니다.
> **근거:** `appointments.id`, `appointments.status`, `appointment_status_history.changed_at`, `정책·인프라`
- 직원이 예약을 변경하면 앱에도 변경된 내용이 보여야 합니다.
> **ERD 추적:** 예약 생성자는 created_by, 생성 경로는 source로 기록합니다.
> **근거:** `appointments.created_by`, `appointments.source`, `appointments.account_patient_id`, `appointments.for_patient_id`
- 환자가 작성한 사전문진은 해당 의사만 진료 화면에서 볼 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 상담봇에서 예약한 내용도 일반 앱 예약과 똑같이 관리되어야 합니다.
> **ERD 추적:** 대화, 예약 카드, 실제 예약의 연결입니다.
> **근거:** `chat_conversations.id`, `chat_messages.message_type`, `chat_booking_cards.conversation_id`, `chat_booking_cards.for_patient_id`, `chat_booking_cards.department_id`, `chat_booking_cards.doctor_id`, `chat_booking_cards.slot_id`, `chat_booking_cards.nonce`, `chat_booking_cards.used_at`, `appointments.source`
- 직원이 환자를 도착 처리하면 앱의 방문 상태도 바뀌어야 합니다.
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`

## 6.2 중복과 실수를 막아주세요

- 같은 시간에 같은 의사 예약이 두 개 생기지 않아야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 버튼을 여러 번 눌러도 같은 예약이 중복 등록되지 않아야 합니다.
> **ERD 추적:** 슬롯의 의사·날짜·시각 고유성과 예약 생성 트랜잭션으로 방지합니다. 반복 클릭용 idempotency key는 현재 ERD에 없습니다.
> **근거:** `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointments.slot_id`, `UNIQUE(doctor_id,slot_date,start_time)`, `누락 후보: idempotency key`
- 동명이인 환자를 잘못 선택하지 않도록 추가 확인이 필요합니다.
> **ERD 추적:** 이름·생년월일·연락처를 함께 확인하는 화면 규칙이며 환자 컬럼이 근거입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.phone`, `정책`
- 이미 취소하거나 완료한 예약을 다시 처리하려 하면 알려주세요.
> **ERD 추적:** 상태 전이 규칙과 updated_at 기반 낙관적 동시성 검사가 필요합니다.
> **근거:** `private.appointment_status_transitions.from_status`, `private.appointment_status_transitions.to_status`, `medical_records.updated_at`, `appointments.updated_at`, `정책`
- 다른 직원이 먼저 수정한 내용을 오래된 화면에서 덮어쓰지 않게 해주세요.
> **ERD 추적:** 상태 전이 규칙과 updated_at 기반 낙관적 동시성 검사가 필요합니다.
> **근거:** `private.appointment_status_transitions.from_status`, `private.appointment_status_transitions.to_status`, `medical_records.updated_at`, `appointments.updated_at`, `정책`

## 6.3 기록을 함부로 지우지 않게 해주세요

환자정보와 진료기록은 삭제 버튼으로 바로 없어지면 안 됩니다.

- 사용 중지 또는 숨김 처리가 기본이면 좋겠습니다.
> **ERD 추적:** 직원 계정 생성·비활성은 직원과 처리자를 연결해 추적합니다.
> **근거:** `staff.id`, `staff.auth_user_id`, `staff.role`, `staff.is_active`, `staff.deactivated_by`, `staff.deactivated_at`
- 중요한 내용을 변경한 사람, 시간, 변경 전후 내용을 확인할 수 있어야 합니다.
> **ERD 추적:** 완료 여부·마지막 수정시각·수정 이력의 이전 내용/사유/작성자로 추적하며 일반 삭제 금지는 권한 정책입니다.
> **근거:** `medical_records.is_completed`, `medical_records.updated_at`, `medical_record_revisions.previous_content`, `medical_record_revisions.reason`, `medical_record_revisions.revised_by`, `medical_record_revisions.revised_at`, `RLS`
- 실수로 삭제했을 때 복구할 수 있도록 정기적으로 데이터를 백업해주세요.
> **ERD 추적:** 완료 여부·마지막 수정시각·수정 이력의 이전 내용/사유/작성자로 추적하며 일반 삭제 금지는 권한 정책입니다.
> **근거:** `medical_records.is_completed`, `medical_records.updated_at`, `medical_record_revisions.previous_content`, `medical_record_revisions.reason`, `medical_record_revisions.revised_by`, `medical_record_revisions.revised_at`, `RLS`

## 6.4 오류가 발생했을 때

- 사용자에게 개발자용 오류 문장을 그대로 보여주지 말아주세요.
> **ERD 추적:** 시스템 오류 로그로 기능·메시지·시각을 남깁니다. 외부 장애 시 예약/진료 유지와 재시도는 인프라 정책입니다.
> **근거:** `system_error_log.feature`, `system_error_log.message`, `system_error_log.occurred_at`, `정책·인프라`
- 저장에 실패했으면 실패했다고 분명히 알려주세요.
> **ERD 추적:** 시스템 오류 로그로 기능·메시지·시각을 남깁니다. 외부 장애 시 예약/진료 유지와 재시도는 인프라 정책입니다.
> **근거:** `system_error_log.feature`, `system_error_log.message`, `system_error_log.occurred_at`, `정책·인프라`
- 오류가 발생한 시간과 기능을 관리자가 확인할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 외부 알림 서비스나 AI 서비스가 잠시 중단되어도 예약과 진료기록 기능은 사용할 수 있어야 합니다.
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`

## 6.5 개인정보

- 환자정보는 로그인하지 않은 사람이 볼 수 없어야 합니다.
> **ERD 추적:** 행 단위 접근은 RLS, 비밀키와 테스트 데이터는 배포·운영 정책입니다.
> **근거:** `RLS`, `auth.users`, `patients`, `정책·인프라`
- 직원 역할에 따라 볼 수 있는 정보가 달라야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 실제 비밀번호를 관리자도 볼 수 없게 해주세요.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 서비스 연결에 사용하는 비밀키가 화면이나 코드 저장소에 공개되면 안 됩니다.
> **ERD 추적:** 행 단위 접근은 RLS, 비밀키와 테스트 데이터는 배포·운영 정책입니다.
> **근거:** `RLS`, `auth.users`, `patients`, `정책·인프라`
- 테스트할 때 실제 환자정보를 사용하지 말아주세요.
> **ERD 추적:** 행 단위 접근은 RLS, 비밀키와 테스트 데이터는 배포·운영 정책입니다.
> **근거:** `RLS`, `auth.users`, `patients`, `정책·인프라`

---

# 7. 디자인에 대한 요청

화려한 병원 홍보 사이트보다 직원이 오래 사용해도 피로하지 않고 실수하기 어려운 화면을 원합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`

## 직원용 웹

- 오늘 처리할 환자와 문제가 먼저 보여야 합니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 중요한 상태는 색뿐 아니라 글자로도 구분해주세요.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 접수 직원이 빠르게 사용할 수 있도록 검색과 키보드 입력이 편해야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 의사 화면은 환자정보, 과거기록, 오늘 기록을 한눈에 볼 수 있으면 좋겠습니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

## 환자용 앱

- 한 화면에서 가장 중요한 행동 하나가 명확해야 합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 중장년층이 사용할 수 있게 글씨와 버튼이 충분히 커야 합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 의료진 사진과 병원 소개보다 가장 가까운 예약과 해야 할 일이 먼저 보여야 합니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 예약 변경과 취소처럼 중요한 행동은 실수하지 않도록 한 번 더 확인해주세요.
> **ERD 추적:** 현재 예약 상태와 변경 이력의 행위자·사유로 남깁니다. 이전 슬롯과 새 슬롯을 함께 남기는 전용 컬럼은 현재 ERD에 없습니다.
> **근거:** `appointments.slot_id`, `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.reason`, `appointment_status_history.changed_by`, `appointment_status_history.changed_at`, `누락 후보: 이전/새 슬롯`

## 상담봇

- 일반 채팅앱처럼 자연스럽게 사용하되 현재 무엇을 안내하고 있는지 알 수 있어야 합니다.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 예약 후보는 대화문 안에 길게 나열하지 말고 날짜와 시간 버튼으로 보여주세요.
> **ERD 추적:** 대화, 예약 카드, 실제 예약의 연결입니다.
> **근거:** `chat_conversations.id`, `chat_messages.message_type`, `chat_booking_cards.conversation_id`, `chat_booking_cards.for_patient_id`, `chat_booking_cards.department_id`, `chat_booking_cards.doctor_id`, `chat_booking_cards.slot_id`, `chat_booking_cards.nonce`, `chat_booking_cards.used_at`, `appointments.source`
- 의료 안내와 일반 병원 안내를 시각적으로 구분해주세요.
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 직원 연결 상태와 예상 답변 시간을 보여주세요.
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`

---

# 8. 실제로 확인하고 싶은 완료 시나리오

아래 흐름이 처음부터 끝까지 연결되면 완료된 것으로 보고 싶습니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음

## 시나리오 1. 환자가 앱으로 예약

환자가 가입 → 진료과와 의사 선택 → 가능한 시간 선택 → 예약 확인 → 사전문진 작성 → 예약 알림 수신까지 진행합니다. 직원 웹에도 동일한 예약이 나타나야 합니다.

## 시나리오 2. 상담봇을 통한 예약

환자가 상담봇에게 병원 이용과 진료과를 문의 → 상담봇이 질문을 통해 가능한 진료과와 시간을 안내 → 환자가 최종 확인 → 예약 완료 → 앱의 나의 예약에 표시되어야 합니다.

## 시나리오 3. 전화 예약과 당일 방문 접수

접수 직원이 전화로 온 예약을 웹에서 등록합니다. 예약 없이 방문한 기존 환자와 신규 환자도 등록하고 담당 의사에게 배정할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

## 시나리오 4. 도착부터 진료 완료

직원이 환자를 도착·대기 처리 → 의사가 본인 대기 목록에서 확인 → 사전문진과 과거기록 확인 → 진료기록 임시저장 → 완료 처리 → 환자 앱 상태가 완료로 바뀌어야 합니다.

## 시나리오 5. 완료된 진료기록 수정

의사가 완료된 기록의 오타를 수정 → 수정 이유 입력 → 이전 내용과 새 내용이 모두 남음 → 일반 직원은 수정할 수 없어야 합니다.

## 시나리오 6. 의사 일정 변경

관리자가 특정 날짜를 휴진으로 변경 → 기존 예약 환자 목록 경고 → 직원이 환자별 변경 또는 취소 처리 → 환자 앱과 알림에 반영되어야 합니다.

## 시나리오 7. 상담봇에서 직원에게 넘기기

상담봇이 답할 수 없는 의료 질문을 받음 → 진단하지 않고 직원 연결 안내 → 대화 요약이 직원 웹에 나타남 → 직원 답변이 환자 앱에 도착해야 합니다.
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`

## 시나리오 8. 중복 예약과 중복 클릭 방지

두 사용자가 같은 시간을 거의 동시에 선택하거나 한 사용자가 예약 버튼을 여러 번 눌러도 예약은 한 건만 만들어져야 합니다. 예약하지 못한 사용자는 다른 시간을 선택할 수 있어야 합니다.
> **ERD 추적:** 슬롯의 의사·날짜·시각 고유성과 예약 생성 트랜잭션으로 방지합니다. 반복 클릭용 idempotency key는 현재 ERD에 없습니다.
> **근거:** `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointments.slot_id`, `UNIQUE(doctor_id,slot_date,start_time)`, `누락 후보: idempotency key`

## 시나리오 9. 권한 확인

접수 직원은 내부 진료기록을 임의로 수정할 수 없고, 의사는 다른 의사의 직원 관리 메뉴를 사용할 수 없으며, 관리자는 계정과 운영 현황을 확인할 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

## 시나리오 10. 하루 운영 보고

관리자가 오늘 예약·방문·취소·예약 부도·평균 대기시간·상담봇 문의와 직원 연결 현황을 확인하고 필요한 목록을 파일로 내려받을 수 있어야 합니다.
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

---

# 9. 이번 작업에서 제외하고 싶은 기능

아래 기능까지 넣으면 기간과 비용이 너무 커질 것 같아 이번에는 제외합니다.

- 건강보험 심사·청구 연동
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 카드결제와 병원 수납
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 전자처방전과 약국 연동
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 검사장비·의료기기 연동
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- PACS·영상검사 연동
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 화상진료
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 입원·병상 관리
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 수술실 관리
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 약 재고와 병원 물품 재고
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 여러 병원 지점을 하나로 관리하는 기능
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 환자끼리 글을 쓰는 커뮤니티
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 상담봇의 질병 진단·약 추천·치료 추천
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- 상담봇의 자동 전화 상담
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 기존 병원의 오래된 자료 대량 이전
> **ERD 추적:** 고객이 명시적으로 제외한 범위이며 현재 ERD에도 해당 테이블이 없습니다.
> **근거:** `범위 제외`
- 앱 안에서 진단서와 제증명 발급·결제
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`

추가하고 싶은 기능이 생기면 기존 일정에 몰래 포함하지 말고, 필요한 기간과 영향을 먼저 설명한 뒤 결정했으면 합니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음

---

# 10. 납품받고 싶은 결과

개발을 마치면 다음 상태로 전달받고 싶습니다.
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음

- 직원·의사·관리자가 인터넷에서 접속할 수 있는 웹 프로그램
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 아이폰과 안드로이드에서 실행되는 환자 앱
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 앱과 웹에서 사용할 수 있는 상담봇
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 테스트용 직원·의사·환자 계정
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 데모용 가상 환자와 예약자료
> **ERD 추적:** 배포물·문서·테스트 계정·서버 구성은 ERD 추적 대상이 아닙니다.
> **근거:** `누락 후보: 배포·운영 산출물`
- 병원 안내와 상담봇 답변을 수정하는 방법
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 직원과 관리자용 간단한 사용 설명서
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 운영 환경 설치와 백업 방법
> **ERD 추적:** 소프트 삭제 플래그·수정 이력·백업은 일부 컬럼과 운영 인프라로 구성됩니다.
> **근거:** `patients.is_active`, `staff.is_active`, `departments.is_active`, `patient_family_links.is_active`, `qa_example_bank.is_active`, `medical_record_revisions.previous_content`, `kb_document_revisions.previous_content`, `인프라·누락 후보: backup`
- 오류 확인 방법
> **ERD 추적:** 시스템 오류 로그로 기능·메시지·시각을 남깁니다. 외부 장애 시 예약/진료 유지와 재시도는 인프라 정책입니다.
> **근거:** `system_error_log.feature`, `system_error_log.message`, `system_error_log.occurred_at`, `정책·인프라`
- 앱스토어와 플레이스토어에 심사를 제출할 수 있는 빌드
> **ERD 추적:** 배포물·문서·테스트 계정·서버 구성은 ERD 추적 대상이 아닙니다.
> **근거:** `누락 후보: 배포·운영 산출물`

실제 환자정보를 넣기 전에 가상자료로 위의 10개 완료 시나리오를 함께 확인하고 싶습니다.
> **ERD 추적:** 행 단위 접근은 RLS, 비밀키와 테스트 데이터는 배포·운영 정책입니다.
> **근거:** `RLS`, `auth.users`, `patients`, `정책·인프라`

---

# 강사용 범위 조절 메모

> 이 부분은 가상 고객에게 보내는 요청문이 아니라 실습 난이도와 일정 조절을 위한 참고사항입니다.

## 현재 저장소에서 확인된 출발점

현재 저장소에는 다음 기능이 웹과 Flutter 앱 양쪽에 구현되어 있습니다.

- 전화번호로 기존 환자 조회
> **ERD 추적:** 환자 식별·연락처는 환자 기본정보 컬럼으로 추적합니다. 마스킹은 화면/RLS 정책입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.gender`, `patients.phone`, `RLS`
- 신규 환자 등록
> **ERD 추적:** 환자 기본정보와 예약의 계정/진료대상 연결이 근거입니다.
> **근거:** `patients.name`, `patients.birth_date`, `patients.phone`, `patients.is_active`, `appointments.account_patient_id`, `appointments.for_patient_id`
- 매 접수마다 담당 의사 선택
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 의사 로그인
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 의사별 진료 대기 목록
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 환자 상세와 과거 진료기록 조회
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- 증상·진단·처방 기록 완료
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`
- FastAPI 서버와 Supabase 테이블
> **ERD 추적:** 배포물·문서·테스트 계정·서버 구성은 ERD 추적 대상이 아닙니다.
> **근거:** `누락 후보: 배포·운영 산출물`

현재는 환자 예약, 명시적인 진료 상태, 접수직원·관리자 인증, 수정이력, 알림, 통계, 환자용 앱, 상담봇이 없습니다.

## 전통 개발 기준 예상 규모

현재 코드를 출발점으로 잡아도 전체 범위는 대략 **6.3인월 전후**의 작업입니다.

- 기획·화면설계: 약 0.5인월
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 공통 서버·권한·데이터 확장: 약 1.0인월
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 병원 직원용 웹: 약 1.4인월
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 환자 모바일 앱: 약 1.5인월
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 상담봇 에이전트: 약 1.0인월
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 통합테스트·배포·안정화: 약 0.9인월
> **ERD 추적:** 배포물·문서·테스트 계정·서버 구성은 ERD 추적 대상이 아닙니다.
> **근거:** `누락 후보: 배포·운영 산출물`

전통적인 개발 방식으로 3개월에 완료하려면 경험 있는 2명 안팎이 병렬로 작업하고, 디자인·QA 도움을 일부 받는 조건이 현실적입니다. 한 명이 기획·웹·앱·AI·테스트·배포를 모두 처음부터 맡으면 3개월 고정일정은 위험합니다.

## 12주 권장 진행 순서

### 1~2주차

- 현재 코드 점검
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 사용자 흐름과 화면 확정
> **ERD 추적:** 화면·접근성·오프라인·문구는 ERD 컬럼이 아니라 UI/애플리케이션 요구사항입니다.
> **근거:** `누락 후보: UI/UX·오프라인 정책`
- 직원 계정과 권한
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 예약·진료상태·수정이력 구조
> **ERD 추적:** 예약과 상태 이력, 대상 환자 FK로 환자의 최근 방문을 조회합니다.
> **근거:** `appointments.for_patient_id`, `appointments.slot_id`, `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`

### 3~5주차

- 관리자와 접수 직원용 웹
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 의사 일정과 예약 캘린더
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 도착·대기·진료 상태
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 의사 진료 화면과 기록 이력
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`

### 6~8주차

- 환자 모바일 회원가입
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 가족·예약·사전문진
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`
- 예약 상태와 방문 이력
> **ERD 추적:** 예약 현재 상태와 상태 변경 이력으로 집계할 수 있습니다.
> **근거:** `appointments.status`, `appointment_status_history.to_status`, `appointment_status_history.changed_at`
- 푸시알림
> **ERD 추적:** 기기 토큰과 알림 발송 기록으로 추적합니다. 외부 발송업체 자격증명·재시도 정책은 ERD 밖입니다.
> **근거:** `device_tokens.patient_id`, `device_tokens.fcm_token`, `notification_log.appointment_id`, `notification_log.patient_id`, `notification_log.notification_type`, `notification_log.channel`, `notification_log.sent_at`, `정책`

### 9~10주차

- 상담봇 지식관리
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 병원 안내와 진료과 도움
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 예약 연결
> **ERD 추적:** 대화, 예약 카드, 실제 예약의 연결입니다.
> **근거:** `chat_conversations.id`, `chat_messages.message_type`, `chat_booking_cards.conversation_id`, `chat_booking_cards.for_patient_id`, `chat_booking_cards.department_id`, `chat_booking_cards.doctor_id`, `chat_booking_cards.slot_id`, `chat_booking_cards.nonce`, `chat_booking_cards.used_at`, `appointments.source`
- 직원 이관과 상담 관리
> **ERD 추적:** 직원 인계 사유·상태·요약 필드와 대화 메시지로 추적합니다.
> **근거:** `support_tickets.reason`, `support_tickets.status`, `support_tickets.summary_question`, `support_tickets.summary_confirmed`, `support_tickets.summary_guided`, `support_tickets.summary_unresolved`, `support_tickets.summary_staff_todo`, `support_tickets.assigned_staff_id`, `support_tickets.answered_at`, `chat_conversations.status`, `chat_messages.content`

### 11~12주차

- 웹·앱·상담봇 연결 테스트
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
- 권한과 개인정보 확인
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 중복 예약·오류·복구 테스트
> **ERD 추적:** 슬롯의 의사·날짜·시각 고유성과 예약 생성 트랜잭션으로 방지합니다. 반복 클릭용 idempotency key는 현재 ERD에 없습니다.
> **근거:** `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointments.slot_id`, `UNIQUE(doctor_id,slot_date,start_time)`, `누락 후보: idempotency key`
- 배포와 사용 설명서
> **ERD 추적:** 배포물·문서·테스트 계정·서버 구성은 ERD 추적 대상이 아닙니다.
> **근거:** `누락 후보: 배포·운영 산출물`
- 10개 완료 시나리오 검수
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음

## 범위가 커질 때 가장 먼저 뺄 항목

일정이 부족하면 핵심 흐름을 지키면서 다음 순서로 줄이는 것이 좋습니다.

1. 가족 등록
> **ERD 추적:** 계정 환자와 대상 가족 환자를 별도 FK로 연결합니다.
> **근거:** `patient_family_links.account_patient_id`, `patient_family_links.family_patient_id`, `patient_family_links.relation`, `patient_family_links.is_active`, `patient_family_links.unlinked_at`, `family_link_requests.code_hash`, `family_link_requests.expires_at`, `family_link_requests.verified_at`
2. 문자 발송(앱 푸시만 유지)
> **ERD 추적:** 기기 토큰과 알림 발송 기록으로 추적합니다. 외부 발송업체 자격증명·재시도 정책은 ERD 밖입니다.
> **근거:** `device_tokens.patient_id`, `device_tokens.fcm_token`, `notification_log.appointment_id`, `notification_log.patient_id`, `notification_log.notification_type`, `notification_log.channel`, `notification_log.sent_at`, `정책`
3. 통계 파일 다운로드
> **ERD 추적:** 통계는 예약·상태 이력·상담 티켓을 집계하면 되지만 별도 통계 테이블/다운로드 컬럼은 없습니다.
> **근거:** `appointments.status`, `appointment_status_history.changed_at`, `support_tickets.status`, `누락 후보: 통계 스냅샷·파일 다운로드`
4. 웹사이트용 상담창(모바일 상담만 유지)
> **ERD 추적:** 현재 ERD에서 이 요구사항을 직접 가리키는 테이블·컬럼을 확인하지 못했습니다. 누락 후보로 검토하세요.
> **판정:** 요구사항은 있으나 ERD 직접 근거 없음
5. 환자용 공개 방문 안내
> **ERD 추적:** 현재 진료기록과 환자 공개용 안내를 분리합니다. 내부 메모는 별도 직원 전용 테이블입니다.
> **근거:** `medical_records.symptoms`, `medical_records.diagnosis`, `medical_records.treatment`, `medical_records.patient_visible_notes`, `medical_records.is_completed`, `medical_records.updated_at`, `patient_internal_notes.content`, `patient_internal_notes.staff_id`

다음 기능은 빼면 프로젝트의 핵심이 무너지므로 유지하는 것이 좋습니다.

- 직원·의사·관리자 권한
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 예약과 중복 방지
> **ERD 추적:** 슬롯의 의사·날짜·시각 고유성과 예약 생성 트랜잭션으로 방지합니다. 반복 클릭용 idempotency key는 현재 ERD에 없습니다.
> **근거:** `appointment_slots.doctor_id`, `appointment_slots.slot_date`, `appointment_slots.start_time`, `appointments.slot_id`, `UNIQUE(doctor_id,slot_date,start_time)`, `누락 후보: idempotency key`
- 도착·대기·진료 상태
> **ERD 추적:** 예약 상태 값은 appointments.status, 변경 과정은 appointment_status_history로 저장합니다.
> **근거:** `appointments.status`, `appointment_status_history.from_status`, `appointment_status_history.to_status`, `appointment_status_history.changed_by`, `appointment_status_history.changed_by_patient_id`, `appointment_status_history.reason`
- 의사 진료기록과 수정이력
> **ERD 추적:** 역할별 접근은 직원 계정의 역할·활성 상태와 auth 인증, RLS 정책이 뒷받침합니다.
> **근거:** `staff.role`, `staff.is_active`, `staff.auth_user_id`, `auth.users`, `RLS`
- 환자 앱 예약·사전문진·알림
> **ERD 추적:** 진료과별 양식과 예약별 답변을 템플릿/응답 JSONB로 추적합니다.
> **근거:** `questionnaire_templates.department_id`, `questionnaire_templates.questions`, `questionnaire_responses.appointment_id`, `questionnaire_responses.template_id`, `questionnaire_responses.answers`, `questionnaire_responses.submitted_at`
- 상담봇의 승인된 지식·예약 연결·직원 이관
> **ERD 추적:** 상담 대화·인계 티켓·직원 배정과 처리상태로 추적합니다.
> **근거:** `chat_conversations.id`, `chat_messages.content`, `support_tickets.reason`, `support_tickets.status`, `support_tickets.assigned_staff_id`
- 웹·앱·상담봇의 동일 데이터 연결
> **ERD 추적:** 공유 데이터 자체는 appointments/status/history가 담당하며 실시간 동기화는 애플리케이션 인프라입니다.
> **근거:** `appointments.id`, `appointments.status`, `appointment_status_history.changed_at`, `정책·인프라`


---

# 요구사항-ERD 대조 결과

이 문서는 `docs/고객요구사항.txt`의 원문을 복사한 뒤, 요구사항 문장 아래에 현재 계획 ERD의 근거를 덧붙인 추적표입니다.

판정은 세 가지로 나눴습니다.

- **ERD 근거 있음:** 현재 계획 스키마의 테이블·컬럼·관계로 설명할 수 있음.
- **ERD 밖의 정책/화면:** 요구사항은 유효하지만 RLS, 세션, UI, 알림업체, 백업, AI 안전 라우팅처럼 컬럼만으로는 충족되지 않음.
- **누락 후보:** 요구사항은 분명하지만 현재 ERD에서 직접 가리킬 컬럼이나 관계를 찾지 못함. 구현 누락으로 확정한 것이 아니라 설계 확인 목록임.

## 1. 요구사항 누락 후보(초기 자동 추출)

아래는 원문에서 요구사항으로 보이는 줄에 현재 ERD 직접 근거를 달지 못한 항목입니다.
자연어 매칭 실패가 포함된 초기 목록이므로, 실제 판정은 뒤의 **6.1 요구사항 누락 후보 판정**을 기준으로 봅니다.

1. 꼭 필요한 결과물은 다음 세 가지입니다.
2. 2. **환자가 사용하는 아이폰·안드로이드 모바일 앱**
3. - 직원이 답변을 남기면 환자 앱에 전달됩니다.
4. - 이미 다른 사람이 선택한 시간은 다시 예약되지 않아야 합니다.
5. - 예약이 확정됐는지 신청만 된 상태인지 구분해주세요.
6. - 병원이 정한 시간 이후에는 앱에서 직접 취소하지 못하고 상담으로 연결해주세요.
7. - 변경·취소
8. - 모바일 앱의 `AI 상담` 메뉴
9. - 병원 홈페이지에 붙일 수 있는 웹 상담창
10. - 가능한 진료과를 안내하되 최종 선택은 환자가 확인합니다.
11. - 오늘 처리할 환자와 문제가 먼저 보여야 합니다.
12. - 의료진 사진과 병원 소개보다 가장 가까운 예약과 해야 할 일이 먼저 보여야 합니다.
13. 아래 흐름이 처음부터 끝까지 연결되면 완료된 것으로 보고 싶습니다.
14. - 여러 병원 지점을 하나로 관리하는 기능
15. 추가하고 싶은 기능이 생기면 기존 일정에 몰래 포함하지 말고, 필요한 기간과 영향을 먼저 설명한 뒤 결정했으면 합니다.
16. 개발을 마치면 다음 상태로 전달받고 싶습니다.
17. - 아이폰과 안드로이드에서 실행되는 환자 앱
18. - 앱과 웹에서 사용할 수 있는 상담봇
19. - 병원 안내와 상담봇 답변을 수정하는 방법
20. - 병원 직원용 웹: 약 1.4인월
21. - 환자 모바일 앱: 약 1.5인월
22. - 상담봇 에이전트: 약 1.0인월
23. - 현재 코드 점검
24. - 환자 모바일 회원가입
25. - 상담봇 지식관리
26. - 병원 안내와 진료과 도움
27. - 웹·앱·상담봇 연결 테스트
28. - 10개 완료 시나리오 검수
29. 4. 웹사이트용 상담창(모바일 상담만 유지)

## 2. 과설계 후보(초기 자동 추출)

아래 목록은 원문 요구사항의 업무 문장에 직접 매핑되지 않은 컬럼 후보입니다. PK/FK와 생성·수정 시각 같은 구조·감사 컬럼은 대부분 연결을 유지하기 위한 기술 컬럼이므로, 업무 요구가 없다는 이유만으로 즉시 삭제하지 말고 유지 필요성을 검토하세요.
초기 후보의 최종 판정과 이유는 뒤의 **6.2 과설계 후보 판정**에 정리했습니다.

특히 `pending_*`, 벡터, 익명 세션, 카드 nonce, 예시 장부 등은 현재 요구사항에서 구체적인 컬럼명이나 세부 처리까지 말하지 않아 과설계 후보로 표시될 수 있습니다.

- `staff`: `name`, `department_id`, `created_at`
- `doctor_schedule_rules`: `id`
- `doctor_schedule_exceptions`: `id`
- `patients`: `id`, `updated_at`, `created_at`
- `patient_family_links`: `id`
- `appointment_slots`: `id`
- `appointments`: `department_id`, `doctor_id`, `cancellation_requested_at`, `created_at`
- `appointment_status_history`: `id`, `appointment_id`
- `private.appointment_status_transitions`: `from_status`, `to_status`
- `medical_records`: `id`, `appointment_id`, `doctor_id`, `created_at`
- `medical_record_revisions`: `id`, `record_id`
- `questionnaire_templates`: `id`
- `questionnaire_responses`: `id`
- `access_audit_log`: `id`
- `system_error_log`: `id`
- `patient_internal_notes`: `id`, `patient_id`, `created_at`
- `hospital_settings`: `id`, `auto_confirm_app_bookings`
- `doctor_quick_phrases`: `id`, `created_at`
- `device_tokens`: `id`, `created_at`
- `notification_log`: `id`
- `family_link_requests`: `id`, `requesting_patient_id`, `target_patient_id`, `created_at`
- `chat_conversations`: `patient_id`, `anon_session_token`, `channel`, `active_flow`, `flow_step`, `flow_collected`, `created_at`, `last_message_at`
- `chat_messages`: `id`, `conversation_id`, `sender`, `staff_id`, `created_at`
- `chat_booking_cards`: `id`, `created_at`
- `kb_documents`: `id`, `pending_title`, `pending_category`, `pending_is_restricted`, `pending_updated_by`, `pending_updated_at`, `created_by`, `created_at`, `updated_at`
- `kb_chunks`: `id`, `chunk_index`
- `kb_document_revisions`: `id`, `previous_title`, `previous_category`, `changed_by`, `changed_at`
- `support_tickets`: `id`, `conversation_id`, `patient_id`, `contact_name`, `contact_phone`, `question_embedding`, `created_at`
- `answer_feedback`: `id`, `reported_by`, `source`, `add_to_example_bank`, `created_at`, `reviewed_at`
- `qa_example_bank`: `id`, `source_feedback_id`, `question_text`, `corrected_answer_text`, `question_embedding`, `category`, `created_at`

## 3. 테이블별 추적 상태(초기 자동 추적)

| 테이블 | 요구사항에 직접 연결된 컬럼 | 직접 연결되지 않은 후보 |
|---|---|---|
| `departments` | `id`, `name`, `is_active` | 없음 |
| `staff` | `id`, `auth_user_id`, `role`, `is_active`, `deactivated_by`, `deactivated_at` | `name`, `department_id`, `created_at` |
| `doctor_schedule_rules` | `doctor_id`, `weekday`, `start_time`, `end_time`, `slot_duration_minutes`, `lunch_start`, `lunch_end`, `max_daily_appointments`, `booking_deadline` | `id` |
| `doctor_schedule_exceptions` | `doctor_id`, `exception_date`, `is_closed`, `override_start_time`, `override_end_time` | `id` |
| `patients` | `auth_user_id`, `name`, `birth_date`, `gender`, `phone`, `is_active` | `id`, `updated_at`, `created_at` |
| `patient_family_links` | `account_patient_id`, `family_patient_id`, `relation`, `is_active`, `unlinked_at` | `id` |
| `appointment_slots` | `doctor_id`, `slot_date`, `start_time`, `status` | `id` |
| `appointments` | `id`, `slot_id`, `account_patient_id`, `for_patient_id`, `reason`, `status`, `source`, `queue_position`, `is_urgent_flag`, `booking_code`, `booking_code_expires_at`, `created_by`, `needs_rescheduling`, `updated_at` | `department_id`, `doctor_id`, `cancellation_requested_at`, `created_at` |
| `appointment_status_history` | `from_status`, `to_status`, `changed_by`, `changed_by_patient_id`, `reason`, `changed_at` | `id`, `appointment_id` |
| `private.appointment_status_transitions` | 없음 | `from_status`, `to_status` |
| `medical_records` | `symptoms`, `diagnosis`, `treatment`, `patient_visible_notes`, `is_completed`, `updated_at` | `id`, `appointment_id`, `doctor_id`, `created_at` |
| `medical_record_revisions` | `previous_content`, `revised_by`, `reason`, `revised_at` | `id`, `record_id` |
| `questionnaire_templates` | `department_id`, `questions` | `id` |
| `questionnaire_responses` | `appointment_id`, `template_id`, `answers`, `submitted_at` | `id` |
| `access_audit_log` | `staff_id`, `patient_id`, `resource_type`, `accessed_at` | `id` |
| `system_error_log` | `occurred_at`, `feature`, `message` | `id` |
| `patient_internal_notes` | `staff_id`, `content` | `id`, `patient_id`, `created_at` |
| `hospital_settings` | `cancellation_deadline_hours`, `long_wait_threshold_minutes` | `id`, `auto_confirm_app_bookings` |
| `doctor_quick_phrases` | `doctor_id`, `text` | `id`, `created_at` |
| `device_tokens` | `patient_id`, `fcm_token` | `id`, `created_at` |
| `notification_log` | `appointment_id`, `patient_id`, `notification_type`, `channel`, `sent_at` | `id` |
| `family_link_requests` | `code_hash`, `expires_at`, `verified_at` | `id`, `requesting_patient_id`, `target_patient_id`, `created_at` |
| `chat_conversations` | `id`, `status` | `patient_id`, `anon_session_token`, `channel`, `active_flow`, `flow_step`, `flow_collected`, `created_at`, `last_message_at` |
| `chat_messages` | `content`, `source_chunk_ids`, `message_type`, `route_taken` | `id`, `conversation_id`, `sender`, `staff_id`, `created_at` |
| `chat_booking_cards` | `conversation_id`, `nonce`, `for_patient_id`, `department_id`, `doctor_id`, `slot_id`, `used_at` | `id`, `created_at` |
| `kb_documents` | `title`, `category`, `content`, `status`, `is_restricted`, `has_pending_edit`, `pending_content`, `approved_by`, `approved_at` | `id`, `pending_title`, `pending_category`, `pending_is_restricted`, `pending_updated_by`, `pending_updated_at`, `created_by`, `created_at`, `updated_at` |
| `kb_chunks` | `document_id`, `content`, `embedding` | `id`, `chunk_index` |
| `kb_document_revisions` | `document_id`, `previous_content` | `id`, `previous_title`, `previous_category`, `changed_by`, `changed_at` |
| `support_tickets` | `summary_question`, `summary_confirmed`, `summary_guided`, `summary_unresolved`, `summary_staff_todo`, `reason`, `status`, `assigned_staff_id`, `answered_at` | `id`, `conversation_id`, `patient_id`, `contact_name`, `contact_phone`, `question_embedding`, `created_at` |
| `answer_feedback` | `message_id`, `correction_text`, `status`, `reviewed_by`, `applied_document_id` | `id`, `reported_by`, `source`, `add_to_example_bank`, `created_at`, `reviewed_at` |
| `qa_example_bank` | `is_active` | `id`, `source_feedback_id`, `question_text`, `corrected_answer_text`, `question_embedding`, `category`, `created_at` |

## 4. 이 표를 읽을 때의 주의

1. 요구사항의 자연어와 컬럼명이 일치하지 않아도 같은 업무 의미를 매핑할 수 있습니다. 예를 들어 “실제로 진료받는 환자”는 `appointments.for_patient_id`입니다.
2. 반대로 로그인 만료, RLS, 중복 클릭 방지, 외부 알림 장애, 백업, UI 접근성처럼 DB에 저장되지 않는 요구사항은 ERD에 컬럼을 억지로 추가하는 대신 정책·애플리케이션·인프라 항목으로 분리해야 합니다.
3. `appointment_id` UNIQUE처럼 중복 방지 제약은 컬럼 하나가 아니라 관계와 제약조건입니다. 이 표에서는 근거 주석에 별도로 표시했습니다.
4. 과설계 후보는 “불필요” 확정 목록이 아닙니다. 고객 요구가 후속 회의에서 구체화되면 근거가 생길 수 있으므로, 삭제 전 고객 확인이 필요합니다.

## 5. 다음 검토 순서

- 누락 후보는 고객에게 우선 확인하고, 필요한 경우 컬럼·관계·정책을 ERD에 추가합니다.
- 과설계 후보는 핵심 업무에 필요한지, 감사·보안·성능을 위한 기술적 필요인지 분류합니다.
- 고객 승인 후에만 planned ERD와 실제 migration을 함께 수정합니다.

## 6. 후보 최종 판정

앞의 후보 목록은 자동 추출 결과라서, 자연어 매칭에 실패한 항목과 실제 설계 공백이 섞여 있었습니다. 아래 표가 사람 검토를 반영한 최종 판정입니다.

판정 기준:

- **누락 아님(ERD):** 현재 테이블·컬럼·관계·제약으로 뒷받침됩니다.
- **누락 아님(ERD 밖):** 요구사항은 유효하지만 UI·인증·RLS·애플리케이션·인프라·QA의 책임입니다.
- **실제 누락:** 요구사항을 만족하는 ERD 요소가 없거나, 현재 요소만으로는 핵심 의미를 보존할 수 없습니다.
- **과설계 아님:** 업무 요구 또는 데이터 무결성·감사·보안에 필요한 컬럼입니다.
- **과설계:** 고객 요구만으로는 필요성이 없고, 핵심 흐름에 없어도 되는 별도 기능/컬럼입니다.
- **조건부 과설계:** 특정 운영정책을 선택할 때만 필요하므로 고객 확인 전에는 확정 삭제하지 않습니다.

### 6.1 요구사항 누락 후보 판정

| 후보 | 판정 | 이유 |
|---|---|---|
| 꼭 필요한 결과물(웹·앱·상담봇) | 누락 아님(ERD 밖) | 납품물·클라이언트 산출물이다. ERD에 컬럼을 추가해 해결할 대상이 아니다. |
| 아이폰·안드로이드 환자 앱 | 누락 아님(ERD 밖) | 앱 구현·배포 요구다. `patients`, `appointments`는 앱이 공유할 데이터만 뒷받침한다. |
| 최근 예약과 방문 이력 | 누락 아님(ERD) | `appointments.for_patient_id`, `slot_id`, `status`, `appointment_status_history`로 조회한다. |
| 예약 한 칸의 기본 시간 | 누락 아님(ERD) | `doctor_schedule_rules.slot_duration_minutes`가 직접 대응한다. |
| 일정 변경 전 경고 | 누락 아님(ERD 밖) | `doctor_schedule_exceptions`, `appointments.needs_rescheduling`은 대상 식별을 담당하고 경고 화면은 UI/업무 로직이다. |
| 예약·변경·취소 규칙 | 누락 아님(ERD) | `appointments.status`, 상태 이력, `hospital_settings.cancellation_deadline_hours`, 승인 지식자료로 나뉘어 있다. |
| 상담봇이 답하면 안 되는 내용 | 누락 아님(ERD 밖) | `kb_documents.is_restricted`와 `chat_messages.route_taken`은 보조 근거이고, 금지 답변·안전 문구는 AI 정책이다. |
| 환자 질문과 상담봇 답변 | 누락 아님(ERD) | `chat_conversations`, `chat_messages.content`가 대화 원문을 보존한다. |
| 직원 답변을 환자 앱에 전달 | 누락 아님(ERD) | 직원 발신 `chat_messages`와 대화 상태/티켓이 있다. 푸시 알림은 애플리케이션 전송 책임이다. |
| 답하지 못한 질문 모아보기 | 누락 아님(ERD) | `support_tickets.reason/status/summary_*`를 집계하면 된다. |
| 시간대별 방문 환자 수 | 누락 아님(ERD) | 슬롯 날짜·시각과 예약 상태 이력을 집계하면 된다. |
| 많이 들어온 질문 | 누락 아님(ERD 밖) | 티켓 질문 요약을 집계할 수 있다. 의미 벡터는 선택 기능이지 필수 누락은 아니다. |
| 휴대전화 가입·본인확인 | 누락 아님(ERD 밖) | `patients.phone`, `patients.auth_user_id`, `auth.users`와 인증 제공자 정책으로 구현한다. |
| 예약내용 최종 확인 | 누락 아님(ERD) | 일반 예약 컬럼과 `chat_booking_cards`가 최종 확인 데이터를 보존한다. |
| 이미 선택된 시간 재예약 금지 | 누락 아님(ERD 밖) | 슬롯 상태의 조건부 갱신과 트랜잭션으로 처리한다. 다만 실제 동시성 테스트가 필요하다. |
| 대기 순서를 바꾼 사람과 이유를 남김 | 누락 아님(ERD), 선택적 P2 보강 | `appointment_status_history`에 `진료대기 → 진료대기`, 변경자, 사유를 남기면 고객의 기본 요구는 충족한다. 이전·새 순번까지 복원하려면 별도 이력 테이블을 추가한다. |
| 예약 시간 변경의 이전 슬롯·새 슬롯을 재현 | 누락 아님(ERD), 선택적 P2 보강 | 현재 예약의 `slot_id`와 상태 이력의 변경자·사유로 기본 요구는 충족한다. 이전/새 슬롯을 감사 화면에서 직접 보여줘야 할 때만 `appointment_changes`를 추가한다. |
| 예약 신청과 확정 구분 | 누락 아님(ERD) | `appointments.status`와 `hospital_settings.auto_confirm_app_bookings`가 대응한다. |
| 취소 마감 후 상담 연결 | 누락 아님(ERD 밖) | 마감 시각은 설정 컬럼, 상담 연결은 애플리케이션 분기다. |
| 예약 변경·취소 버튼 | 누락 아님(ERD) | 상태 이력과 사유 컬럼으로 결과를 기록한다. |
| 모바일 AI 상담 메뉴·웹 상담창 | 누락 아님(ERD 밖) | 화면·채널 요구다. `chat_conversations.channel`은 공유 대화의 보조 데이터다. |
| 가능한 진료과 안내와 최종 선택 | 누락 아님(ERD) | `departments`, `staff`, `chat_messages`, 예약 카드가 선택 과정을 뒷받침한다. |
| 처리할 환자·문제가 먼저 보이는 대시보드 | 누락 아님(ERD 밖) | 표시 우선순위와 화면 구성 요구다. |
| 가장 가까운 예약을 먼저 표시 | 누락 아님(ERD 밖) | `appointments` 조회 정렬과 UI 문제이지 별도 컬럼 누락이 아니다. |
| 웹·앱·상담봇 전체 흐름 연결 | 누락 아님(ERD 밖) | 공통 DB와 API·동기화·통합 테스트 책임이다. |
| 여러 병원 지점 통합 | 누락 아님(범위 제외) | 고객이 이번 작업에서 제외한 기능이다. 누락으로 세지 않는다. |
| 추가 기능의 일정·영향 설명 | 누락 아님(프로젝트 관리) | ERD 요구사항이 아니라 변경관리 규칙이다. |
| 앱·상담봇·사용설명서·테스트자료 납품 | 누락 아님(ERD 밖) | 산출물·QA·문서 요구다. |
| 병원 안내·상담봇 지식 수정 방법 | 누락 아님(ERD) | `kb_documents`, `pending_*`, `kb_document_revisions`가 승인·수정 이력을 지원한다. |
| 개발 기간·현재 코드 점검·연결 테스트·시나리오 검수 | 누락 아님(프로젝트/QA) | 데이터 컬럼이 아니라 일정·검증 활동이다. |

**결론:** 초기 자동 누락 후보 중 현재 계획 ERD의 테이블·컬럼 자체가 완전히 빠진 항목은 없습니다. 대기 순번 전후값과 예약 슬롯 전후값은 기본 요구를 넘어서는 선택적 P2 감사 보강입니다. “같은 슬롯 동시 예약”, “직원 답변 전달”, “AI 안전정책”은 컬럼 추가보다 구현·정책·동시성 테스트가 필요한 항목입니다.

### 6.2 과설계 후보 판정

| 후보 컬럼/구조 | 판정 | 이유 |
|---|---|---|
| 각 테이블의 `id` PK와 FK(`appointment_id`, `record_id`, `conversation_id` 등) | 과설계 아님 | 관계 연결과 행 식별에 필수인 구조 컬럼이다. 고객 문장에 이름이 없어도 제거할 수 없다. |
| `created_at`, `updated_at`, `changed_at`, `revised_at`, `approved_at` | 과설계 아님 | 고객이 변경자·변경시각·수정이력을 요구했고, 동시성·감사를 위해 필요하다. |
| `staff.name`, `staff.department_id` | 과설계 아님 | 직원·의사 표시와 진료과별 필터/일정 연결에 필요하다. |
| `doctor_schedule_rules.id`, `doctor_schedule_exceptions.id` | 과설계 아님 | 일정 규칙과 예외 행을 식별하는 PK다. |
| `patients.id`, `patients.updated_at`, `patients.created_at` | 과설계 아님 | 환자 연결·동명이인 구분·변경 추적에 필요하다. |
| `patient_family_links.id` | 과설계 아님 | 가족 연결 한 건을 식별하고 해제 이력을 관리한다. |
| `appointment_slots.id` | 과설계 아님 | 예약이 선택한 시간칸을 FK로 가리키기 위한 키다. |
| `appointments.department_id`, `doctor_id` | 과설계 아님 | 고객이 진료과·의사를 선택하고 의사별 예약을 조회하도록 하는 핵심 FK다. |
| `appointments.created_at` | 과설계 아님 | 예약 생성시각과 운영 통계를 위해 필요하다. |
| `appointment_status_history.id`, `appointment_id` | 과설계 아님 | 상태 이력을 어느 예약에 붙일지 식별한다. |
| `private.appointment_status_transitions.from_status/to_status` | 과설계 아님 | 고객이 요구한 상태 흐름에서 허용되지 않은 이동을 DB에서 막는 무결성 장치다. |
| `medical_records.id`, `appointment_id`, `doctor_id`, `created_at` | 과설계 아님 | 예약당 진료기록 하나, 담당 의사, 기록 생성시각을 보장한다. |
| `medical_record_revisions.id`, `record_id` | 과설계 아님 | 완료 기록의 이전 내용을 여러 건 보존하려면 필요하다. |
| 문진·알림·상담·지식자료 테이블의 PK/FK | 과설계 아님 | 예약·환자·대화·원문을 연결하는 참조 무결성에 필요하다. |
| `access_audit_log`의 식별·대상·자료종류·시각 컬럼 | 과설계 아님 | 누가 환자정보/진료기록을 열었는지 확인하라는 직접 요구다. |
| `system_error_log`의 기능·메시지·시각 컬럼 | 과설계 아님 | 오류 기능과 발생시각을 관리자가 확인해야 한다는 요구다. |
| `patient_internal_notes`의 환자·직원·내용 컬럼 | 과설계 아님 | 직원 내부 메모 요구를 직접 뒷받침한다. |
| `hospital_settings.id`, `cancellation_deadline_hours`, `long_wait_threshold_minutes`, `auto_confirm_app_bookings` | 과설계 아님 | 취소 마감·장기대기·예약 신청/확정 정책을 저장한다. `id`는 단일 설정행 보장용이다. |
| `doctor_quick_phrases`의 의사·문구 컬럼 | 과설계 아님 | 의사 상용구 요구가 명시돼 있다. |
| `device_tokens`, `notification_log` 컬럼 | 과설계 아님 | 앱 푸시·문자와 발송 이력 요구에 필요하다. |
| `chat_conversations.channel`, `active_flow`, `flow_step`, `flow_collected` | 과설계 아님 | 앱/웹 공통 상담과 진료과 선택·예약의 다단계 대화 상태를 보존한다. |
| `chat_messages`의 발신자·직원·본문·메시지 유형·근거 컬럼 | 과설계 아님 | 환자/봇/직원 답변, 예약 카드, 답변 근거를 구분해야 한다. |
| `chat_booking_cards`의 `nonce`, 환자·진료과·의사·슬롯·사용시각 | 과설계 아님 | 최종 확인 전 예약 후보와 중복 클릭 방지를 지원한다. |
| `kb_documents.pending_*`, 승인자·승인시각, `kb_document_revisions` | 과설계 아님 | 승인 후 공개와 이전 내용/수정 이력 요구에 직접 대응한다. |
| `support_tickets`의 대화·환자·연락처·요약·상태·담당자 컬럼 | 과설계 아님 | 익명/로그인 문의를 직원에게 넘기고 답변하려면 필요하다. |
| `appointments.cancellation_requested_at` | 조건부 과설계 | 현재 고객 요구는 취소 상태/사유와 마감 후 상담 연결로 충족 가능하다. 별도 ‘취소 요청’ 워크플로를 운영할 때만 유지한다. |
| `family_link_requests.*`(OTP 요청·해시·만료·확인시각) | 과설계 아님(보안 설계) | 고객이 OTP를 말하지 않았더라도 가족의 예약·환자정보 연결은 민감한 권한 변경이다. 설계자가 본인확인 절차를 넣는 것이 정상이며, OTP 대신 더 안전한 승인 방식으로 바꿀 수는 있다. |
| `chat_conversations.anon_session_token` | 조건부 과설계 | 고객은 앱·웹 상담을 요구했지만 익명 상담 재접속을 명시하지 않았다. 비로그인 웹 상담을 지원할 때만 필요하다. |
| `kb_chunks.embedding`, `support_tickets.question_embedding` | 과설계 아님(채택 가능) | 승인 자료의 의미 검색과 반복 질문 묶기에 유용하다. 고객이 벡터를 지정하지는 않았지만 AI 품질 개선을 위해 채택할 수 있다. |
| `answer_feedback.source`, `add_to_example_bank` | 과설계 아님(채택) | 즉시 신고와 사후 검토를 구분하고, 관리자가 교정 내용을 예시 창고에 보낼지 선택하는 품질관리 흐름에 필요하다. |
| `qa_example_bank` 전체 테이블 | 과설계 아님(채택) | 고객은 오답 교정과 반복 미해결 질문 관리를 요구했다. 관리자가 승인한 교정 예시를 재사용하는 품질 개선 기능으로 채택한다. |

**과설계 결론:** `qa_example_bank`, `answer_feedback.source/add_to_example_bank`, 벡터 컬럼은 이번 설계에서 품질 개선 기능으로 채택합니다. 익명 세션과 취소 요청시각만 실제 운영방식을 정한 뒤 유지 여부를 결정합니다. `family_link_requests`는 고객이 OTP를 지정하지 않았어도 설계자의 보안 보강으로 과설계가 아닙니다. 나머지 초기 후보도 요구사항·무결성·감사·보안에 필요하므로 과설계가 아닙니다.

### 6.3 선택적 P2 보강 및 구현 확인 항목

다음은 현재 고객 요구의 필수 누락이 아니라, 운영감사 수준을 높이기 위한 선택적 보강과 구현 검증입니다.

- 같은 슬롯에 동시 예약할 때 하나만 성공하는 조건부 UPDATE/트랜잭션이 실제로 동작하는가.
- 일반 앱 예약에도 챗봇 카드와 같은 중복 클릭 방어가 적용되는가. 필요하면 `idempotency_key`를 선택적으로 추가한다.
- 직원 답변이 `chat_messages`에 저장되고 환자 앱에서 같은 `conversation_id`로 조회되는가.
- 응급 표현·진단 금지·약 추천 금지 정책이 컬럼이 아니라 AI 라우팅과 승인 콘텐츠로 강제되는가.
- 채택하기로 했다면 예약 변경 이력에 이전 슬롯·새 슬롯·사유·행위자가 실제로 저장되는가.

### 6.4 오답·미해결 질문 품질 개선 흐름

고객의 상담 문의 관리와 상담봇 답변 관리는 하나의 품질 개선 사이클로 연결합니다.

1. 상담봇이 답하지 못하거나 직원에게 넘기면 `support_tickets`에 문의, 인계 이유, 요약, 상태를 저장합니다.
2. 직원은 같은 질문을 다시 보며 답변하고, 잘못된 봇 답변이면 `answer_feedback`에 올바른 안내를 적습니다.
3. 관리자는 `answer_feedback` 목록을 검토합니다. `source`는 즉시 신고인지 사후 품질 리포트 검토인지 구분합니다.
4. 승인된 정정 내용이 공식 병원 정책·안내라면 `kb_documents`에 반영합니다. `kb_documents`가 최종 원본입니다.
5. 비슷한 질문에 재사용할 만한 답변이면 `add_to_example_bank=true`로 `qa_example_bank`에도 저장합니다.
6. 상담봇은 모델을 자동 재훈련하는 것이 아니라, 다음 답변 때 승인된 `kb_documents`와 유사한 `qa_example_bank` 예시를 프롬프트에 참고자료로 넣습니다.

`support_tickets.question_embedding`은 비슷한 미해결 질문을 묶어 “많이 들어온 질문”을 보여주는 데 사용합니다. 모든 직원 인계 건을 보관하되, 통계 화면에서는 `reason`, `status`, 기간, 유사도 클러스터로 필터링합니다. 이번 설계에서는 의미가 비슷한 질문을 묶기 위해 벡터 방식을 채택할 수 있습니다.

### 6.5 마감 후 취소와 `cancellation_requested_at`

고객 요구는 “병원이 정한 시간 이후에는 앱에서 직접 취소하지 못하고 상담으로 연결”하는 것입니다. 현재 계획은 이를 직원 승인형 흐름으로 구체화했습니다.

- 마감 전: 앱에서 바로 취소하고 상태 이력을 남깁니다.
- 마감 후: 앱은 `환자취소`로 바로 바꾸지 않고 `cancellation_requested_at`을 기록해 직원 취소 요청함으로 보냅니다.
- 직원 승인: 슬롯을 반환하고 `환자취소`로 전환합니다.
- 직원 반려: 요청 시각을 비우고 반려 사유와 알림을 남깁니다.

따라서 단순히 상담 화면으로만 연결한다면 이 컬럼은 없어도 되지만, 현재 직원 웹의 취소 요청 목록·승인·반려 화면을 유지하려면 삭제할 수 없습니다. 컬럼을 제거하려면 환자 앱·직원 웹 스펙의 취소 요청 큐와 관련 테스트를 상담 티켓 흐름으로 함께 바꿔야 합니다.
