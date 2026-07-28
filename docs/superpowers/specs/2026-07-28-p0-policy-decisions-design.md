# 정합성 검토 P0 정책 결정: 의사 열람범위 · 지식자료 재승인 · 가족 연결 인증

> 근거 문서: `docs/consistency-review-2026-07-28-round2-5-consolidated.md`의 P0 4건 중 정책 결정이 필요한 3건(R2-02, R4-01, R5-01).
> R2-01(슬롯 소유권 미확인)은 정책 결정이 필요 없어 `writing-plans`에서 바로 처리 완료(`2026-07-27-patient-app.md` Task 1 수정).
> 이 문서는 3단계(환자 앱)·2단계(직원 웹)·4단계(AI 상담봇) 기존 계획을 수정하기 위한 정책 스펙이며, 확정 후 각 단계 계획 문서에 반영한다.

---

## 섹션 1: R2-02 — 역할별 환자정보 열람 범위

### 결론

| 역할 | 열람 범위 |
|---|---|
| 접수직원 | 전체 환자 (변경 없음, 유지) |
| 관리자 | 전체 환자 (변경 없음, 유지) |
| 의사 | **기본**: 본인이 담당 의사인(`appointments.doctor_id = 본인 staff.id`) 예약과 그에 연결된 사전문진·진료기록·수정이력만. **확장**: 아래 "진료 중 접근 확장 규칙" 참고 |

### 진료 중 접근 확장 규칙

의사가 **오늘 날짜에 본인 담당으로, 상태가 `도착`/`진료대기`/`진료중` 중 하나인 예약**을 가진 환자에 한해, 그 환자의 **과거(지난 날짜이거나 `진료완료`/`환자취소`/`병원취소`/`예약부도` 등 이미 종료된 상태의)** 예약·문진·진료기록·수정이력을, 그 예약이 다른 의사 담당이었더라도 열람할 수 있다.

- **포함**: 다른 의사가 남긴 과거 진료기록, 과거 사전문진 응답
- **제외**: 같은 환자의 **미래 예약**(아직 지나지 않은 날짜, 다른 의사 담당) — 아직 담당하지 않는 의사가 미리 들여다볼 이유가 없음
- **조건 소멸**: 오늘 예약이 `진료완료`로 바뀌거나 환자가 귀가하면(활성 상태를 벗어나면) 확장 접근도 즉시 종료

**근거**: 진료 연속성을 위해 "지금 내 앞에 앉아있는 환자의 과거 병력"은 봐야 하지만, 담당하지도 않는 환자의 다른 의사 예약을 미리 엿보게 하면 R2-02가 막으려던 문제(비담당 환자 정보 열람)가 뒷문으로 다시 열린다.

### 구현 방향 (writing-plans에서 구체화할 것)

- SQL 조건을 하나의 함수로 캡슐화: `doctor_can_view_patient(target_patient_id uuid) returns boolean` — `security definer`. 다음 OR 조건:
  1. `appointments.doctor_id = 본인` 인 예약이 `target_patient_id`(for_patient_id 또는 account_patient_id)와 연결되어 있음
  2. 오늘 날짜 + 본인 담당 + 상태 in `('도착','진료대기','진료중')`인 예약이 `target_patient_id`로 존재 **AND** 조회 대상 행 자체가 "과거/종료" 조건(지난 날짜이거나 상태가 `진료완료`/`환자취소`/`병원취소`/`예약부도`)을 만족
- `appointments`, `questionnaire_responses`, `medical_records`(뷰 경유, `patient_medical_notes` 패턴 재사용), `appointment_status_history`의 의사용 SELECT 정책을 이 함수로 교체
- 직원 웹 대기목록/조회 API에도 동일 함수를 조건으로 추가(RLS와 API 이중 강제 — 기존 원칙 재사용)
- 검증 테스트: 의사 A가 의사 B의 예약·문진·기록·수정이력을 (a) 평소엔 못 봄 (b) 오늘 그 환자가 A에게 도착~진료중으로 와 있는 동안엔 과거 기록만 봄 (c) 미래의 B 담당 예약은 여전히 못 봄

---

## 섹션 2: R4-01 — 승인 지식자료 수정 시 재승인 흐름

### 상태 모델

기존 `kb_documents.status`(`draft`/`approved`/`archived`)는 그대로 유지하되, **승인된 문서에 한해** "실제 사용 중(live) 내용"과 "검토 대기 중(pending) 수정 내용"을 분리한다.

- 신규 컬럼: `kb_documents.has_pending_edit boolean not null default false`, `pending_title text`, `pending_category text`, `pending_content text`, `pending_is_restricted boolean`, `pending_updated_by uuid references staff(id)`, `pending_updated_at timestamptz`
- **`status='draft'`(한 번도 승인된 적 없음)** 문서 수정: 기존과 동일하게 본문을 즉시 덮어씀(라이브 개념이 없으므로 위 pending 컬럼 불필요)
- **`status='approved'`** 문서 수정: 본문(`title`/`category`/`content`)은 그대로 두고, 위 pending 컬럼에 새 내용을 저장 + `has_pending_edit=true`. 챗봇 RAG는 계속 기존 `content`로 검색·응답
- **재승인**(`approve_pending_edit(staff, document_id)`): 관리자 권한이면 수정한 본인도 호출 가능. 현재 `title`/`category`/`content`를 `kb_document_revisions`에 스냅샷 저장(기존 수정이력 메커니즘 재사용) → pending 값을 라이브 컬럼으로 승격 → `kb_chunks`/임베딩 재생성(기존 `approve_document` 로직 재사용) → pending 컬럼 초기화, `has_pending_edit=false`
- **반려**: 별도 상태 전이 없음 — 관리자가 재승인을 누르지 않으면 pending 내용은 그대로 남아 있고, 필요하면 다시 `update_document`를 호출해 pending 내용을 계속 고칠 수 있다

### 관리자 화면 변경

- 문서 목록에 `has_pending_edit=true`인 행은 "검토 대기 중" 배지 표시
- 그런 행은 "라이브 내용 보기" / "대기 중 수정본 보기" 두 가지를 비교해서 볼 수 있어야 하고, "재승인" 버튼이 별도로 있어야 한다(기존 "수정" 버튼과 구분)

### 구현 방향 (writing-plans에서 구체화할 것)

- 마이그레이션: 위 5개 컬럼 추가
- `kb_service.update_document`: `status == 'approved'`분기 추가(pending 컬럼에 쓰기), `status == 'draft'`면 기존 로직 유지
- `kb_service.approve_pending_edit(staff, document_id, embedder=None)`: 신규 함수, 관리자 role 체크만(자기 자신 여부 무관)
- 검증 테스트: 승인문서 수정 직후 RAG 검색 결과가 여전히 구버전 문구를 반환 → 재승인 후에는 신버전 문구 반환 → 수정이력에 구버전 스냅샷이 남음 → 재승인 없이 여러 번 고쳐도(pending을 계속 덮어써도) 라이브 내용은 안 바뀜

---

## 섹션 3: R5-01 — 가족 등록·연결

### 앱에서 지원하는 두 가지 경로

**1) 새 프로필 추가 (기본, 기존 클라이언트 INSERT 정책 유지)**
- "가족 추가" 화면 상단에 고정 안내 문구: *"이미 병원에 방문·예약하신 적 있는 가족이라면 새로 추가하지 마세요. 새로 추가하면 과거 기록과 별도로 관리됩니다."*
- 이 경로는 `patient_family_links` INSERT 시 `family_patient_id`가 **새로 만든 patient row**여야만 허용(기존 환자 UUID 지정 불가 — RLS/RPC에서 강제)

**2) 기존 환자와 연결 (OTP 자기인증 우선, 불가 시 직원 확인)**
- 사용자가 이름·생년월일·전화번호를 입력 → 서버가 일치하는 기존 `patients` 행을 검색(정확 일치만, 여러 건 매칭되면 "일치하는 기록을 특정할 수 없습니다. 병원에 문의해주세요" 안내로 즉시 직원 확인 경로로 전환)
- 정확히 한 건 매칭되면, 그 행의 등록된 전화번호로 SMS OTP 발송(기존 Supabase Auth phone / Twilio 인프라 재사용)
- OTP 인증 성공 → `patient_family_links` 행 생성(SECURITY DEFINER RPC로 처리, 클라이언트가 테이블에 직접 INSERT하지 않음)
- **OTP를 받을 수 없는 경우**(전화번호 없음, 이미 다른 계정 인증에 쓰이고 있음 등) 화면 안내: *"본인 확인이 어려운 경우 병원(전화/방문)으로 문의해주시면 직원이 확인 후 연결해드립니다."*
- 직원 웹에서의 연결 처리는 R5-05(전화예약 환자-앱 계정 연결)의 직원 확인 플로우를 재사용한다(동일한 "이름+생년월일+전화번호 대조 후 직원이 연결" 패턴)

### 보안 원칙 (기존 RLS 결함 수정)

- `patient_family_links` INSERT는 클라이언트가 직접 하지 않는다 — 반드시 아래 두 SECURITY DEFINER RPC 중 하나를 거친다:
  - `create_family_member(name, birth_date, gender, phone) -> uuid`: 새 프로필 생성 + 링크를 한 트랜잭션으로 생성
  - `link_existing_family_member(target_patient_id, otp_verified boolean) -> void`: OTP 인증 성공 컨텍스트에서만 호출 가능(백엔드가 OTP 검증 후 호출) — `target_patient_id`의 소유권·동의를 검사하지 않고 무조건 연결하던 기존 결함 제거
- 직원 웹의 "직원 확인 연결" 액션도 별도 RPC(`staff_link_family_member`)로 감사로그(R5-08과 연결)를 남긴다

### 구현 방향 (writing-plans에서 구체화할 것)

- 마이그레이션: `patient_family_links` INSERT를 위한 클라이언트 RLS 정책 제거, 위 RPC 함수 3종 추가
- 검증 테스트: 환자 A가 환자 B의 UUID로 직접 `patient_family_links` INSERT 시도 → 거부(RLS에 INSERT 정책 자체가 없어 실패) / OTP 미인증 상태로 `link_existing_family_member` 호출 시도 → 거부 / OTP 인증 성공 시나리오 → 연결 성공

---

## 다른 단계 의존성

- 섹션 3의 "직원 웹 연결" 화면은 R5-05 작업과 함께 구현해야 중복 작업이 없다 — 이후 P1 세션(R5-05)에서 이 RPC(`staff_link_family_member`)를 그대로 재사용하도록 설계를 맞춘다.
- 섹션 1의 `doctor_can_view_patient()`는 R5-08(진료기록 열람 감사로그)과 별개로, 열람 자체의 허용/차단만 담당한다. 감사로그 연결은 P1 세션에서 다룬다.
