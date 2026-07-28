# 정합성 검토 P1 정책 결정: R5-09 진료과별 문진 양식 버전 관리

> 근거 문서: `docs/consistency-review-2026-07-28-round2-5-consolidated.md`의 R5-09.
> 확정 후 1단계(기반) 마이그레이션과 2단계(직원 웹) 계획, 3단계(환자 앱) 계획에 반영한다.

---

## 배경

`questionnaire_templates(id, department_id, questions)` 테이블과 관리자용 RLS(`admin_can_manage_templates`)는 1단계에 이미 있지만, 다음 두 가지가 빠져 있었다:

1. 진료과당 몇 개의 양식이든 만들 수 있어 "지금 쓰이는 양식"이 무엇인지 정해져 있지 않음. 환자 앱은 `where department_id = $1 limit 1`로 임의의 첫 행을 고름(`patient_questionnaire_service.get_template`, 3단계 계획).
2. 관리자가 양식을 만들거나 수정하는 화면·API가 없음(RLS 정책만 있고 실제 CRUD 태스크가 없음).

**과거 응답 보존 문제는 이미 해결되어 있음이 확인됨**: `questionnaire_responses.answers`는 이미 `[{"question": "질문 문구", "answer": "답변"}]` 구조로 질문 문구 자체를 답변과 함께 저장한다(3단계 계획 `test_submit_and_get_response`). 양식이 나중에 바뀌어도 과거 응답 화면은 제출 당시 문구 그대로 렌더링되므로 추가 스냅샷 설계가 필요 없다.

## 결정 1: 활성 버전 규칙 — 진료과당 정확히 1행

`questionnaire_templates.department_id`에 **UNIQUE 제약**을 추가한다. 진료과당 문진 양식은 항상 정확히 1개만 존재하며, 그 1개가 곧 "활성 버전"이다. 별도의 `is_active` 플래그나 다중 버전 개념을 두지 않는다.

- 관리자가 "저장"하면 UPSERT(`on conflict (department_id) do update`)로 그 진료과의 유일한 행을 갱신한다.
- 기존에 이미 여러 행이 생겨 있었다면(정합성 검토가 지적한 상황), 마이그레이션에서 진료과당 가장 마지막에 만들어진 1행만 남기고 정리한다.

## 결정 2: 수정 방식 — 즉시 활성화, 롤백 없음, 덮어쓰기

- 저장 즉시 새 질문 목록이 적용된다. 초안/승인 2단계를 두지 않는다(문진 양식은 관리자만 만지므로 R4-01 지식자료처럼 작성자·승인자가 다를 이유가 없음).
- 이전 버전으로 되돌리는 롤백 기능을 제공하지 않는다. 진료과당 1행을 그대로 덮어쓰므로 이전 문구는 남지 않는다(단, 이미 제출된 응답 안의 문구는 위에서 설명한 대로 별도로 보존됨).
- 관리자가 잘못 수정한 경우 다시 수정해서 저장하는 것이 유일한 정정 방법이다.

## 결정 3: 작성 중 양식 변경 처리 — 화면을 다시 열지 않는 한 영향 없음

환자가 사전문진 화면을 이미 열어 작성 중인데 관리자가 그사이 해당 진료과 양식을 저장하면 어떻게 되는가:

- 환자 앱은 화면 진입 시 `get_template`을 **한 번만** 호출하고, 그 결과(질문 목록)를 화면 상태로 들고 있다가 그대로 제출한다(현재 3단계 구현이 이미 이 패턴).
- 따라서 이미 열려 있는 화면은 관리자의 수정과 무관하게 처음 불러온 질문 그대로 제출된다 — 작성 도중 질문이 바뀌어 다시 써야 하는 상황이 생기지 않는다.
- 환자가 화면을 벗어났다가 다시 들어오면(또는 새로고침하면) 그 시점의 최신 양식을 새로 불러온다. 이는 의도된 동작이다.
- 별도의 draft 잠금·버전 고정 장치를 추가하지 않는다 — 위 자연스러운 클라이언트 동작만으로 충분하다.

## 관리자 화면 요구사항

- 신규 라우트 `/admin/questionnaires`, `<RequireRole roles={["admin"]}>`로 감싼다(기존 `/admin/staff`, `/admin/schedule` 패턴 재사용).
- 진료과 선택 → 해당 진료과의 현재 질문 목록을 편집(질문 추가/삭제/순서변경/텍스트 수정/필수 여부).
- "저장" 버튼 하나만 있으면 됨(활성화 버튼 별도 없음, 결정 2에 따름).
- 진료과에 아직 양식이 없으면 빈 목록에서 새로 작성 → 저장 시 최초 UPSERT.

## 구현 방향 (writing-plans에서 구체화할 것)

- 마이그레이션: `questionnaire_templates.department_id`에 UNIQUE 제약 추가(+ 기존 중복 데이터 정리 스텝, 필요 시)
- 신규 서비스 함수(1단계 또는 2단계 서비스 레이어): `questionnaire_admin_service.upsert_template(department_id, questions) -> dict`, `list_templates() -> list[dict]`, `get_template(department_id) -> dict | None` — admin role 검사(RLS `admin_can_manage_templates` 재사용 + 서비스 계층에서도 이중 검사)
- 2단계(직원 웹) 신규 화면: `QuestionnaireAdminPage`, API 클라이언트, 라우트 등록
- 검증 테스트:
  - 같은 진료과에 두 번째 행을 INSERT 시도하면 UNIQUE 위반으로 거부됨
  - 관리자가 저장하면 즉시 그 진료과의 유일한 행이 바뀌고, 환자 앱 `get_template`이 새 질문을 반환함
  - 저장 이전에 제출된 `questionnaire_responses`는 질문 문구가 그대로 남아 있고 영향받지 않음
  - 관리자가 아닌 직원(의사·접수직원)이 저장을 시도하면 거부됨

## 다른 단계 의존성

- 이 문서는 R5-09 단독 이슈이며 다른 P1 항목과 정책 의존성은 없다. 다만 UNIQUE 제약 추가 마이그레이션은 1단계 Task 7(`00006_questionnaire.sql`) 이후 별도 마이그레이션 파일로 추가한다.
