# 정합성 검토 P2 정책 결정: 알림·상담운영·대기·접수·가족 그룹 (R2-05, R2-06, R4-03, R4-04, R5-02, R5-05, R5-06)

> 근거 문서: `docs/consistency-review-2026-07-28-round2-5-consolidated.md`의 brainstorming 대상 14건 중, 다른 세션에서 이미 확정한 6건(R2-02, R2-04, R3-01, R3-02, R4-01, R5-01)을 제외한 7건.
> 나머지 1건(R5-09, 문진 양식 버전 정책)은 별도 세션에서 진행한다.
> 확정 후 1단계(기반)·2단계(직원 웹)·3단계(환자 앱)·4단계(AI 상담봇) 계획 문서에 반영한다.

---

## 섹션 1: R2-05 — 상태 변경 알림의 발생 시점·수신자·중복 방지

### 배경

`notification_service.notify_patient(patient_id, notification_type)`는 이미 구현되어 있고 `MESSAGES` 딕셔너리에 `hospital_cancelled`, `cancellation_rejected`, `visit_completed`, `changed` 문구도 이미 정의되어 있다. 그러나 실제 호출은 `create_booking`(예약신청/확정) 한 곳에만 연결되어 있고, 병원측 취소·진료완료·취소요청 반려·일정변경 재예약에서는 아무도 호출하지 않는다.

### 결론 — 수신자 (가족 예약)

- 알림은 항상 **계정 소유자**(`account_patient_id`, 로그인해서 기기 토큰을 등록한 사람)에게만 보낸다. 실제 진료받는 사람(`for_patient_id`)이 계정 소유자와 다르면(가족 예약) 메시지 본문에 대상자 이름을 명시한다.
- 예: 푸시 제목 "병원 안내", 본문 "민준님의 예약이 확정되었습니다."
- `notify_patient`의 시그니처를 `notify_patient(account_patient_id, notification_type, target_name=None)`으로 확장한다. `target_name`이 있으면 `MESSAGES` 템플릿에 채워 넣고, 없으면(본인 예약) 기존처럼 대상자 이름 없이 보낸다.

### 결론 — 발생 시점 (호출 지점)

각 이벤트는 **상태 전이 트랜잭션이 커밋된 직후**, best-effort로(실패해도 본 작업은 유지) 호출한다. 기존 `create_booking`의 패턴을 그대로 따른다.

| 이벤트 | 호출 지점 | notification_type |
|---|---|---|
| 병원측 취소 | 직원 웹의 예약 취소 처리 서비스 | `hospital_cancelled` |
| 진료 완료 | R4-02(진료기록 완료 ↔ 예약 상태 연결, 이미 writing-plans 대상)의 단일 트랜잭션 완료 후 | `visit_completed` |
| 취소요청 반려 | 이미 호출 중(직원 웹 스펙 102~104) — 변경 없음 | `cancellation_rejected` |
| 취소요청 승인 | 취소요청 승인 처리 서비스 | 기존 `MESSAGES`에 없음 → 신규 `cancellation_approved` 문구 추가 필요 |
| 일정변경으로 인한 재예약 필요 | R3-01/R3-02(슬롯 재계산) 이후 `needs_rescheduling=true`로 표시하는 시점 | `changed` |

### 결론 — 중복 방지

- 신규 테이블 `notification_log(id, appointment_id, patient_id, notification_type, sent_at, channel)`을 만들고, `(appointment_id, notification_type)`에 **부분 유니크 인덱스**를 건다(단, 리마인더처럼 반복되는 유형은 날짜를 키에 포함: `(appointment_id, notification_type, sent_at::date)`).
- `notify_patient` 호출 전에 먼저 로그 insert를 시도하고(유니크 제약 위반 시 조용히 skip), insert가 성공한 경우에만 실제 발송한다. 이렇게 하면 리마인더 크론 재실행이나 동시 호출로 인한 중복 발송이 원천 차단되고, 동시에 "이 예약에 어떤 알림이 언제 나갔는지"를 관리자가 한 곳에서 조회할 수 있는 감사 기록도 함께 확보된다.

### 구현 방향 (writing-plans에서 구체화할 것)

- 마이그레이션: `notification_log` 테이블 + 부분 유니크 인덱스
- `notification_service.notify_patient`에 `target_name`, 중복확인 로직 추가
- 4개 누락 호출 지점(병원측 취소, 진료완료, 취소요청 승인, 일정변경) 연결
- `MESSAGES`에 `cancellation_approved` 추가
- 검증 테스트: 가족 예약 알림에 대상자 이름이 포함되는지, 같은 이벤트가 두 번 트리거되어도 알림은 한 번만 나가는지, 리마인더 크론이 같은 날 두 번 돌아도 중복 발송되지 않는지

---

## 섹션 2: R2-06 — 상담 티켓 의료판단 담당자 제한

### 배경

`ticket_service.answer_ticket`은 담당자(`assigned_staff_id`) 일치 여부를 확인하지 않아 배정되지 않은 직원도 답변을 완료할 수 있다. `medical_judgment` 사유로 인계된 티켓도 역할 제한이 없다. 고객요구사항 210줄: "의료진의 판단이 필요한 경우 접수 직원이 임의로 답하지 않고 담당 의사 또는 관리자에게 전달할 수 있어야 합니다."

### 결론

- **담당배정(`assigned_staff_id`)과 답변(`answer_ticket`) 모두 요구사항 원문 그대로 "의사 또는 관리자"만 가능**하도록 `medical_judgment` 티켓에 한해 역할을 제한한다. 접수직원은 `medical_judgment` 티켓을 최초 열람(`claim_ticket`)하거나 의사·관리자에게 넘기는(`reassign_ticket`) 것까지는 할 수 있지만, 직접 `answer_ticket`은 할 수 없다.
- 의사가 실시간으로 앱/웹에 직접 타이핑할 필요는 없다 — 의사에게 오프라인으로(대면·전화 등) 확인한 뒤 관리자가 최종 답변을 대신 입력해도 된다. 시스템은 "누가 최종 확인·입력했는지"만 기록한다.
- `answer_ticket`은 추가로 `staff.id == ticket.assigned_staff_id`를 원자적으로 확인해, 배정되지 않은 직원의 답변 시도를 409로 거부한다(담당자 불일치는 역할과 무관하게 모든 사유 유형에 공통 적용).
- `reassign_ticket`의 대상(`to_staff_id`)이 활성 상태(`is_active`)인지도 확인한다(비활성 직원에게 재배정 방지).

### 구현 방향 (writing-plans에서 구체화할 것)

- `answer_ticket`에 `staff.id == ticket["assigned_staff_id"]` 확인 추가(불일치 시 409)
- `medical_judgment` 사유 티켓에 한해 `answer_ticket` 호출자의 `role in ('doctor', 'admin')` 확인 추가(위반 시 403)
- `reassign_ticket`의 `to_staff_id` 대상이 `is_active`인지, `medical_judgment`면 `role in ('doctor','admin')`인지 확인
- 검증 테스트: 비배정 직원의 답변 시도(409), 접수직원의 `medical_judgment` 직접 답변 시도(403), 비활성 직원으로의 재배정 시도(실패)

---

## 섹션 3: R4-03 — 환자 앱 "내 앞 대기 인원"

### 배경

앱 스펙은 대기 인원의 Realtime 갱신을 약속하지만 실제로는 계산 로직도 화면도 없다. 직원 웹의 대기목록은 이미 `queue_position`(직원이 화면에서 순서를 조정할 수 있는 정수 컬럼) 기준으로 정렬하고 있다.

### 결론

- "내 앞 대기 인원"은 **같은 의사, 오늘 날짜, `진료대기` 상태**인 예약 중 **`queue_position`이 내 값보다 작은** 건수로 정의한다.
- 직원이 순서를 수동으로 조정(응급환자 우선 등)하면 환자 앱의 숫자도 즉시 같이 바뀐다 — 직원 웹과 환자 앱이 항상 같은 기준(같은 컬럼)을 쓰므로 두 화면의 순서가 어긋나지 않는다.
- API는 `patients_ahead: int` 한 값만 반환한다. 다른 환자의 이름·연락처 등 식별정보는 어떤 경우에도 포함하지 않는다.
- 갱신 트리거: 순서 변경, 진료 시작(`진료중` 전이), 취소·부도 처리 — 모두 기존 `appointments` Realtime 구독(R3-03에서 확정된 publication)으로 이미 커버된다. 별도 채널 불필요.

### 구현 방향 (writing-plans에서 구체화할 것)

- 신규 API: `GET /app/appointments/{id}/queue-status` → `patients_ahead` 계산 후 반환 (같은 의사·오늘·`진료대기`·`queue_position <` 조건)
- 홈/상세 화면에 숫자 표시 위젯 추가, Realtime 구독 콜백에서 재조회
- 검증 테스트: 앞 환자 취소·순서변경·진료시작 각각에서 숫자가 바뀌는지, 응답에 타 환자 식별정보가 없는지

---

## 섹션 4: R4-04 — 예약번호 형식과 QR 접수 흐름

### 배경

현재 `appointments.id`(UUID)를 예약번호 텍스트와 QR 내용 양쪽에 그대로 쓴다. 직원 웹 검색은 전화번호+생년월일만 지원해 QR/예약번호로 접수를 열 수 있는 경로가 없다.

### 결론

- **UUID는 그대로 두되(내부 기본키), 사람에게 보여주고 QR에도 담을 별도의 짧은 코드를 새로 발급한다.**
  - 형식: 6자리 랜덤 영숫자(대문자+숫자, 혼동되는 `0/O`, `1/I` 제외). 순차 증가 방식은 쓰지 않는다 — 순번을 쓰면 다른 예약 번호를 추측(무작위 대입)하기 쉬워지기 때문이다.
  - 유일성 범위: **현재 유효한(만료 안 된) 코드끼리만** 중복이 없으면 된다. 오래되어 만료된 코드는 값 자체를 재사용할 수 있다.
  - 만료: 예약이 `진료완료`/`환자취소`/`병원취소`/`예약부도` 상태가 되거나, 슬롯 날짜의 당일이 지나면 그 즉시 이 코드로는 더 이상 조회되지 않는다(예약 기록 자체는 그대로 보존).
- QR 코드에도 UUID 대신 이 짧은 코드를 인코딩한다 — "QR 스캔"과 "번호 직접 입력" 두 경로가 직원 웹에서 하나의 검색 함수를 그대로 공유한다.
- 직원 웹은 이 코드로 검색 시 유효(미만료) 예약만 반환하고, 만료된 코드는 "만료되었거나 존재하지 않는 예약번호"로 안내한다(실제 만료 사유는 노출하지 않음 — 취소/부도 여부를 임의 조회자에게 알려줄 필요 없음).

### 구현 방향 (writing-plans에서 구체화할 것)

- 마이그레이션: `appointments.booking_code varchar(6)`, `booking_code_expires_at timestamptz` 컬럼 + 부분 유니크 인덱스(`where booking_code_expires_at > now()`)
- 예약 생성 시 코드 발급, 상태 전이(`진료완료`/취소류)와 슬롯 날짜 경과 시 만료 처리(배치 또는 조회 시점 필터로 처리 — writing-plans에서 결정)
- 환자 앱: 홈 화면 QR/텍스트를 `id` 대신 `booking_code`로 교체
- 직원 웹: `booking_code` 검색 API + QR 스캔 화면(카메라) 추가
- 검증 테스트: 유효 코드로 접수 처리 가능, 만료된 코드는 조회 실패, 코드 형식에 혼동 문자가 없는지

---

## 섹션 5: R5-02 — 가족 연결 해제 후 접근권한 제거

### 배경

`unlink_family_member`는 가족 구성원의 `patients.is_active`만 `false`로 바꾸고 `patient_family_links` 행은 그대로 둔다. `patient_owns()`는 링크의 존재 여부만 확인하고 활성 상태를 보지 않으므로, 연결 해제 뒤에도 예약·문진·개인정보 접근이 계속 가능하다.

### 결론

- `patient_family_links`에 `is_active boolean not null default true`, `unlinked_at timestamptz`를 추가한다.
- `unlink_family_member`는 **링크를 비활성화**한다(`is_active=false, unlinked_at=now()`). 가족 구성원의 `patients.is_active`는 건드리지 않는다 — 과거 예약·방문이력에서 그 사람의 이름 등 정보가 계속 정상적으로 보여야 하기 때문이다.
- `patient_owns()`는 `patient_family_links.is_active = true`인 링크만 유효한 것으로 인정하도록 수정한다.

### 구현 방향 (writing-plans에서 구체화할 것)

- 마이그레이션: `patient_family_links.is_active`, `unlinked_at` 컬럼 추가
- `patient_owns()` SQL 함수 수정: 링크 서브쿼리에 `and l.is_active` 조건 추가
- `unlink_family_member` 서비스 수정: `patients` UPDATE 제거, `patient_family_links` UPDATE로 교체
- 검증 테스트: 연결 해제 직후 앱 API와 Supabase 직접 조회 모두에서 그 가족 구성원의 예약·문진 접근이 차단되는지, 과거 예약 목록에서는 이름 등이 여전히 정상 표시되는지

---

## 섹션 6: R5-05 — 전화예약 환자·앱 계정 자동 연결

### 배경

- 회원가입 API(`register_profile`)는 요청 본문의 `phone`을 그대로 저장한다 — Supabase Auth가 실제로 OTP로 검증한 번호가 아니므로 요청 조작으로 임의의 번호가 저장될 수 있다.
- 기존 전화번호로만 등록된 환자(직원이 만든 행, `auth_user_id is null`)를 찾지 않고 항상 새 `patients` 행을 생성해, 과거 예약·방문이력이 새 앱 계정에 보이지 않는다.

### 결론

- **인증된 전화번호 사용**: `register_profile`은 요청 본문의 `phone` 파라미터를 신뢰하지 않고, Supabase Auth 세션(JWT)에 담긴 검증된 전화번호를 사용한다.
- **자동 연결 조건**: 검증된 전화번호 + 생년월일 + 이름이 **모두 일치**하는 기존 미연결(`auth_user_id is null`) 환자가 **정확히 1건**일 때만 자동으로 그 행에 `auth_user_id`를 연결한다(새 행을 만들지 않음).
- **애매한 경우(후보 0건 또는 2건 이상)**: 일단 새 `patients` 행으로 가입시켜 환자가 즉시 앱을 사용할 수 있게 한다. 대신 관리자 화면에 "병합 필요" 목록(이름·생년월일·전화번호가 유사한 후보 2건 이상 존재)을 노출하고, 직원이 확인 후 수동으로 병합(기존 행에 `auth_user_id` 재연결 + 신규 행 비활성화)할 수 있는 버튼을 둔다. 이 수동 병합 로직은 R5-01에서 이미 만든 "직원 확인 후 연결" 패턴(`staff_link_family_member`류 RPC)을 재사용한다.

### 구현 방향 (writing-plans에서 구체화할 것)

- `register_profile(auth_user_id, name, birth_date, gender)` — `phone` 파라미터 제거, Auth 세션에서 검증된 전화번호를 조회해 사용
- 가입 로직에 매칭 쿼리 추가: `auth_user_id is null and phone=$검증번호 and birth_date=$입력값 and name=$입력값`인 행 카운트
  - 1건 → 그 행에 `auth_user_id` UPDATE, 신규 insert 생략
  - 0건/2건 이상 → 기존처럼 신규 insert
- 관리자 화면: 병합 후보 목록 API + 병합 실행 API(서비스 역할 커넥션으로 기존 행에 `auth_user_id` 연결, 신규 행 `is_active=false`)
- 검증 테스트: 유일 후보 자동 연결(과거 예약 유지 확인), 후보 2건 이상 시 신규 가입 + 병합후보 목록 노출, 요청 본문 전화번호 조작이 무시되는지(Auth 검증 번호만 사용)

---

## 섹션 7: R5-06 — 목록 화면 개인정보 마스킹

### 배경

대기목록·캘린더·취소요청·일정변경 영향목록 등에서 전체 생년월일·전화번호를 그대로 노출한다.

### 결론

| 항목 | 목록 화면 표시 형식 | 예시 |
|---|---|---|
| 전화번호 | 중간 4자리 마스킹 | `010-****-1234` |
| 생년월일 | 연도+일 표시, **월만** 마스킹 | `1990-**-15` |

- 전체 값(마스킹 없는 원본)은 **환자 상세 화면**에서만 조회 가능하며, 상세 조회는 감사로그(R5-08, 이미 writing-plans 대상)에 기록된다.
- 목록 응답 DTO 자체에서 서버가 마스킹된 값만 반환한다(`masked_birth_date`, `masked_phone`) — 클라이언트가 원본을 받은 뒤 화면에서만 가리는 방식은 쓰지 않는다(네트워크 탭 등으로 원본이 노출되는 것을 막기 위함).

### 구현 방향 (writing-plans에서 구체화할 것)

- 목록 계열 API(대기목록, 캘린더, 취소요청, 일정변경 영향목록, 통계 상세 이전 단계) 응답에서 `phone`/`birth_date` 원본 필드를 제거하고 `masked_phone`/`masked_birth_date`로 교체
- 마스킹 유틸 함수 공용화(`app.core.masking.mask_phone`, `mask_birth_date`)
- 환자 상세 API는 기존처럼 원본 반환 + 감사로그 연결(R5-08과 함께 구현)
- 검증 테스트: 목록 API 응답에 원본 전화번호·생년월일 문자열이 전혀 포함되지 않는지, 상세 API는 원본을 반환하고 감사로그가 남는지

---

## 다른 섹션 의존성

- 섹션 1(R2-05)의 진료완료 알림 호출은 R4-02(진료기록 완료 ↔ 예약 상태 연결, writing-plans 대상)의 트랜잭션 완료 지점에 걸어야 한다 — 같은 writing-plans 세션에서 순서를 맞춘다.
- 섹션 1의 일정변경 알림은 P1 스펙(섹션 1, R3-01/R3-02 슬롯 재계산)의 `needs_rescheduling=true` 표시 시점과 연결된다.
- 섹션 3(R4-03)의 Realtime 갱신은 P1 스펙 R3-03(publication 등록)이 선행되어야 실제 원격 환경에서 동작한다.
- 섹션 5(R5-02)와 섹션 6(R5-05)은 둘 다 `patient_family_links`/`patients` 테이블을 다루지만 서로 다른 컬럼(`is_active` on link vs `auth_user_id` on patients)을 건드리므로 마이그레이션은 별도 스텝으로 순서만 맞추면 충돌 없다.
- 섹션 7(R5-06)의 감사로그 연결은 R5-08(writing-plans 대상, 이미 방향 확정됨)과 같은 작업에서 함께 구현하는 것이 효율적이다.
