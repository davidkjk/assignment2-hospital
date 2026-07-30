# 정합성 검토 P1 정책 결정: 예약/슬롯/일정 그룹 (R2-03, R2-04, R2-07, R3-01~04)

> 근거 문서: `docs/consistency-review-2026-07-28-round2-5-consolidated.md`의 P1 17건 중 예약/슬롯/일정 그룹 7건.
> 이 중 정책 결정이 필요했던 3건(R2-04, R3-01, R3-02)을 이 문서에서 확정한다.
> 나머지 4건(R2-03, R2-07, R3-03, R3-04)은 요구사항·기존 스펙에 이미 기대 동작이 명확해 브레인스토밍 없이 구현 방향만 정리한다.
> 확정 후 1단계(기반)·2단계(직원 웹)·3단계(환자 앱) 계획 문서에 반영한다.

---

## 섹션 1: R3-01 + R3-02 — 슬롯 생성기 (공통 기반)

### 배경

`doctor_schedule_rules`(요일별 근무시간·점심시간·슬롯단위·하루최대인원·예약마감)와 `doctor_schedule_exceptions`(특정일 휴진/시간변경) 테이블은 1단계에 이미 있지만, 이 규칙으로부터 실제 `appointment_slots` 행을 만들어내는 생성기가 어느 계획에도 없다. R3-01(마감·최대인원 미강제)과 R3-02(점심·휴진 예외 미강제)는 모두 이 생성기가 있어야 해결된다.

### 실행 시점과 범위

- **실행 시점**: 관리자가 `/admin/schedule`에서 의사별 스케줄(`doctor_schedule_rules`) 또는 특정일 예외(`doctor_schedule_exceptions`)를 저장하는 즉시 실행한다. 별도 배치(cron) 작업을 두지 않는다.
- **생성 범위**: 저장 시점 기준 앞으로 **8주**치 슬롯을 재계산한다.
- **재계산 대상**: 저장한 의사의 슬롯만 재계산한다(다른 의사는 영향 없음).

### 계산 규칙

날짜별로 다음 순서로 슬롯을 만든다:

1. 해당 요일의 `doctor_schedule_rules`에서 `start_time`~`end_time`을 가져온다. 규칙이 없으면(그 요일 진료 안 함) 슬롯을 만들지 않는다.
2. 해당 날짜에 `doctor_schedule_exceptions` 행이 있으면 우선 적용한다: `is_closed=true`면 그 날짜는 슬롯을 만들지 않는다. `override_start_time`/`override_end_time`이 있으면 근무시간을 그 값으로 교체한다.
3. `lunch_start`~`lunch_end` 구간을 근무시간에서 제외한다.
4. 남은 시간을 `slot_duration_minutes` 단위로 나눠 슬롯 후보를 만든다.
5. 슬롯 후보 개수가 `max_daily_appointments`를 넘으면 앞에서부터 그 개수만큼만 남긴다.

### 재생성 시 기존 슬롯 처리

- 아직 예약이 없는 **빈 슬롯**(`status='빈시간'`)은 전부 삭제 후 새 계산 결과로 다시 만든다.
- 이미 **예약이 잡힌 슬롯**(`status='예약됨'`)은 건드리지 않는다 — 삭제·수정하지 않는다.

### 충돌(영향받는 예약) 처리

- 저장 API 호출 시, 새 규칙으로 재계산했을 때 사라져야 할 시간대에 이미 예약된 슬롯이 있으면, 실제 저장 전에 **영향받는 예약 목록**(환자명, 예약 일시)을 응답으로 돌려준다(요구사항 3.7 "저장 전에 경고"와 시나리오 6 "기존 예약 환자 목록 경고" 반영).
- 관리자가 목록을 확인하고 "그래도 저장" 요청을 다시 보내면, 규칙 저장과 슬롯 재계산은 **즉시 완료**된다. 영향받은 예약은 상태를 바꾸지 않고 그대로 둔 채 `appointments.needs_rescheduling boolean not null default false`를 `true`로 표시만 한다.
- 관리자의 저장 작업은 여기서 끝난다. 개별 환자 재예약·취소는 별도 작업으로 완전히 분리한다 — 관리자와 재예약을 처리하는 직원이 다른 사람일 수 있고, 개별 처리에 시간이 걸릴 수 있으므로 저장을 그 완료 시점까지 묶어두지 않는다.

### 개별 처리 (접수직원)

- `needs_rescheduling=true`인 예약은 "오늘의 현황" 대시보드에 이미 있는 `affected_appointments_count` 카드(현재 항상 0을 반환하던 자리)에 실제 개수를 채워 보여준다. 클릭 시 목록 화면으로 이동.
- 직원이 각 건을 재예약하거나 취소 처리하면(기존 `patient_booking_service`/`slot_service`의 `book_slot`·`release_slot` 재사용) `needs_rescheduling`을 `false`로 되돌린다.
- `book_slot`은 이미 낙관적 잠금(조건부 UPDATE)으로 이중예약을 막고 있으므로, 여러 직원이 동시에 같은 목록을 처리해도 별도 동시성 처리를 새로 만들 필요가 없다.

### 예약 마감 시각(`booking_deadline`)

- **당일 컷오프**로만 적용한다: 슬롯의 `slot_date`가 오늘이고 현재시각이 그 요일 `booking_deadline`을 지났으면, **앱 경로에서만** 오늘 진료분의 새 예약을 거부한다. 미래 날짜 예약은 시각과 무관하게 항상 가능하다.
- 취소는 이미 2단계 스펙(섹션 10 취소요청 대기열)에 마감 시각 이후 동작이 정해져 있다 — 이 문서는 그 정의를 그대로 따른다: 마감 전에는 앱에서 즉시 취소, 마감 후에는 직접 취소 대신 `cancellation_requested_at`을 채우는 취소 요청으로 전환되어 직원이 승인/반려한다. 이번 슬롯 생성기 작업에서 취소 요청 흐름 자체를 바꾸지 않는다.
- 접수직원 웹(전화예약·워크인 등록)은 이 제한을 받지 않는다 — 당일 접수는 직원이 언제든 처리해야 하는 업무이므로.
- 검증 지점은 앱/챗봇의 예약 생성·취소 서비스가 슬롯을 잡거나 취소를 요청하기 직전이다. 요일마다 다른 마감 시각을 그대로 반영한다(`doctor_schedule_rules`가 이미 요일 단위 컬럼이므로 별도 구조 변경 불필요).

### `max_daily_appointments` 강제 방식

- 슬롯 생성 단계에서 이미 그만큼만 슬롯을 만들어두므로, 예약 시점에 별도로 개수를 세지 않아도 자연히 강제된다.
- 취소·부도(`환자취소`/`병원취소`/`예약부도`)된 예약은 `release_slot`으로 슬롯이 `빈시간`으로 반납되어 다시 예약 가능해진다 — "취소된 건도 정원에 포함할지"는 슬롯 자체가 반납되므로 별도 카운트 로직 없이 자동으로 "취소·부도 제외" 원칙과 일치한다.

### 구현 방향 (writing-plans에서 구체화할 것)

- 마이그레이션: `appointments.needs_rescheduling boolean not null default false` 컬럼 추가
- 신규 서비스: `schedule_service.regenerate_slots(doctor_id, weeks=8, dry_run=False) -> dict`(dry_run이면 영향받는 예약 목록만 반환, 실제 삭제/삽입 없음). 저장 API는 `dry_run=True`로 먼저 호출해 경고를 보여주고, 관리자 확인 후 `dry_run=False`로 재호출.
- 예약 생성/취소 서비스(app 경로)에 당일 마감 검증 추가
- 검증 테스트: 점심시간 신규 추가·휴진일 지정·최대인원 축소 각각에서 (a) 빈 슬롯은 규칙대로 재생성됨 (b) 이미 예약된 슬롯은 유지되고 `needs_rescheduling=true`로 표시됨 (c) 오늘 마감 시각 이후 앱 예약은 거부되지만 직원 웹은 거부되지 않음 (d) 마감 시각 이후에도 미래 날짜 예약은 성공함

---

## 섹션 2: R2-04 — 운영 통계 기준일

### 결론

기간 조회 시 지표별로 실제 사건이 발생한 날짜를 기준으로 집계한다. 지표 이름에 기준일이 드러나도록 API 응답 필드명도 함께 정리한다.

| 지표 | 기준일 |
|---|---|
| 신규 예약 건수 | `appointments.created_at::date` |
| 방문(진료완료) 건수 | `appointment_status_history`에서 `to_status='진료완료'`인 최신 전이의 `changed_at::date` |
| 취소 건수 | `appointment_status_history`에서 `to_status in ('환자취소','병원취소')`인 전이의 `changed_at::date` |
| 부도 건수 | `appointment_status_history`에서 `to_status='예약부도'`인 전이의 `changed_at::date` |
| 평균 대기시간 | `waiting_started_at`(섹션 3 R2-03 참고) 기준일 |
| 시간대별 방문 환자 수 | 방문 발생일의 `appointment_slots.start_time` |
| 앱 예약 비율 | `created_at::date` (신규 유입 지표와 동일 기준) |

### 근거

예약한 날과 실제 방문·취소·부도가 일어난 날이 다르면, 생성일 하나로만 집계할 경우 "오늘 방문 환자 수"에 며칠 전 예약한 사람이 섞이거나 오늘 취소된 건이 취소 발생일이 아닌 예약일 통계에 잡히는 왜곡이 생긴다. 지표별 사건 발생일 기준으로 나누면 "오늘 실제 운영이 어땠는지"를 정확히 보여준다.

### 구현 방향 (writing-plans에서 구체화할 것)

- `dashboard_service.get_stats`를 지표별로 별도 쿼리로 분리(현재는 `created_at` 단일 필터 하나로 전부 계산 중)
- 방문/취소/부도는 `appointment_status_history`를 조인해 해당 전이의 `changed_at`으로 필터링
- 검증 테스트: 예약 생성일과 방문/취소/부도 발생일이 다른 데이터를 시딩해, 각 지표가 정의된 기준일에만 집계되는지 확인

---

## 섹션 3: 정책 결정 불필요 — 구현만 필요한 4건

### R2-03. 대기시작시각을 순서변경과 분리

- `appointment_status_history`는 이미 `to_status='진료대기'` 전이를 트리거로 기록하고 있다(1단계 `log_appointment_status_change`). 새 컬럼 없이, 대기시간 계산 쿼리를 `appointments.updated_at` 대신 해당 예약의 `appointment_status_history`에서 `to_status='진료대기'`인 **최신** 행의 `changed_at`으로 교체하면 된다.
- 순서 재배치나 주의 표시 수정은 `from_status = to_status`인 메모성 이력 행만 남기므로(1단계 `staff_can_insert_note_history` 정책), 대기시작시각 계산에 영향을 주지 않는다.
- 현재 대기시간, 장기대기 판정, 평균 대기시간(R2-04) 모두 이 기준으로 통일한다.

### R2-07. 오늘 현황을 슬롯 날짜 기준으로

- "오늘 현황" 집계 쿼리를 `updated_at::date = current_date or created_at::date = current_date`에서 `appointment_slots.slot_date = 오늘(Asia/Seoul)`로 교체(슬롯이 있는 예약). 워크인(슬롯 없는 당일 등록)은 접수 시각 또는 `visit_date`를 별도로 사용한다.
- 시간대 기준을 `Asia/Seoul`로 명시적으로 통일한다(서버 타임존 설정에 의존하지 않음).

### R3-03. Realtime publication 설정

- `supabase_realtime` publication에 `appointments`, `appointment_slots`, `appointment_status_history`를 추가하는 마이그레이션을 작성한다(현재 챗봇 관련 테이블만 등록되어 있음).
- RLS가 구독 결과에도 동일하게 적용되는지(다른 환자·의사의 변경 내역이 새어나가지 않는지) 실제 Supabase 환경에서 확인하는 테스트 절차를 추가한다.

### R3-04. 관리자 직원 계정 관리 화면

- 스펙(`/admin/staff`)에는 이미 있으나 구현 계획엔 백엔드 API만 있고 화면 태스크가 없다. 다음을 포함하는 화면 태스크를 2단계(직원 웹) 계획에 추가한다:
  - 직원 목록, 초대 폼(역할·의사인 경우 진료과 선택)
  - 사용 중지 확인 다이얼로그
  - 현재 로그인한 관리자 본인 및 "마지막 남은 관리자" 보호(중지 불가 안내)
  - 재초대, 부분 실패(이메일 발송 실패 등) 처리
  - E2E: 관리자가 의사를 초대·중지했을 때 메뉴 노출과 API/RLS 접근이 즉시 반영되는지 확인

---

## 다른 섹션 의존성

- 섹션 1의 `regenerate_slots`는 1단계 Task 5(`appointment_slots`/`appointments` 마이그레이션)와 2단계 `/admin/schedule` 저장 API 양쪽에 걸친다. 2단계 계획에 신규 태스크로 추가하되, 서비스 자체는 1단계 서비스 레이어에 둔다(슬롯 관련 로직은 원래 1단계 소관).
- 섹션 2의 지표별 기준일 변경은 섹션 3의 R2-03(`waiting_started_at` 기준)과 R2-07(슬롯 날짜 기준)이 먼저 구현되어야 완전히 일관된다 — 같은 writing-plans 세션에서 함께 반영한다.
