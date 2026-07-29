-- [정합성 검토 R5-09] 진료과당 문진 양식은 정확히 1행만 존재한다(그 1행이 곧 활성 버전).
-- 별도의 is_active 플래그나 다중 버전 개념을 두지 않는다. 관리자가 저장하면
-- upsert(on conflict (department_id) do update)로 이 유일한 행을 갱신한다.
--
-- 정합성 검토 시점에 이미 한 진료과에 여러 행이 생겨 있었을 가능성이 있으므로,
-- UNIQUE 제약을 걸기 전에 진료과당 가장 나중에 만들어진 1행만 남기고 정리한다.
-- (questionnaire_templates에는 created_at이 없으므로 id를 정렬 기준으로 쓴다 — UUID는
-- 생성 순서를 보장하지 않지만, 이 정리는 "이미 중복이 생겼던 드문 경우"의 1회성 정리이고
-- 어느 한 행이 남아도 데이터 손실 없이 이후부터는 유일성이 보장되면 되므로 충분하다.)
--
-- [정합성 검토 R5-09] questionnaire_responses.template_id는 삭제될 중복 행을 참조하고 있을
-- 수 있다(not null references, ON DELETE 절 없음 → 기본 RESTRICT). 그대로 delete를 실행하면
-- 그 진료과에 과거 응답이 하나라도 있는 경우 외래키 위반으로 마이그레이션 자체가 실패한다.
-- 질문 문구는 이미 questionnaire_responses.answers에 제출 당시 스냅샷으로 저장되어 있으므로,
-- 삭제 전에 참조만 살아남을 행으로 옮겨주면 과거 응답이 보여주는 내용은 전혀 바뀌지 않는다.
update questionnaire_responses r
set template_id = keep.keep_id
from (
  select department_id, max(id::text)::uuid as keep_id from questionnaire_templates group by department_id
) keep
join questionnaire_templates t on t.department_id = keep.department_id
where r.template_id = t.id and t.id <> keep.keep_id;

delete from questionnaire_templates a
using questionnaire_templates b
where a.department_id = b.department_id and a.id < b.id;

alter table questionnaire_templates
  add constraint questionnaire_templates_department_id_key unique (department_id);
