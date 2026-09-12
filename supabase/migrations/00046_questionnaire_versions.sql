-- [Task 22a][QADM-*] 문진표 불변 버전.
-- 결정 12(USER-FINAL, 2026-08-10): 문진표를 저장하면 기존 행을 덮어쓰지 않고
-- **새 불변 버전**을 만들어 즉시 현재 버전으로 활성화한다. 과거 버전은 읽기 전용으로 보존한다.
--
-- ⚠️⚠️ 이 마이그레이션은 00008(00008_questionnaire_template_unique.sql)을 **뒤집는다**.
-- 00008은 [정합성 검토 R5-09](2026-07-27)가
--   *"진료과당 정확히 1행만 존재한다 ... 별도의 is_active 플래그나 다중 버전 개념을 두지 않는다.
--     관리자가 저장하면 upsert로 이 유일한 행을 갱신한다"*
-- 로 확정하고 unique (department_id)를 건 파일이다. 그 판단이 결정 12로 뒤집혔다.
-- 00008 주석(적용된 파일이라 고칠 수 없다)만 읽고 upsert로 회귀하지 않도록, **무엇을 왜
-- 뒤집는지**를 읽는 사람이 여기까지 오도록 여기에 적어 둔다.
--   - upsert가 위험했던 이유: 같은 행의 questions를 덮어쓰면 과거 답변이 가리키는 문항 글자가
--     슬그머니 바뀐다. 행을 불변으로 만드는 순간 template_id 참조가 곧 스냅샷이 된다(QADM-VERSION-06).
--   - AD-065·AD-066: 삭제·숨김·이름(version_label) 기능은 그때도 지금도 만들지 않는다.
--     버전은 번호·저장 시각·저장 직원으로만 식별한다.

-- ① 00008의 진료과당 1행 제약을 뗀다(뒤집는 지점).
alter table questionnaire_templates drop constraint questionnaire_templates_department_id_key;

-- ② 버전 칸을 얹는다.
alter table questionnaire_templates
  add column version_no int,
  add column is_active boolean not null default true,
  add column created_at timestamptz not null default now(),
  -- on delete set null: 직원이 실제로 제거되면 authorship만 null이 되고 버전 행·문항은
  -- 그대로 보존된다(QADM-SAVE-06은 그때 「직원 정보 없음」으로 읽는다).
  add column created_by uuid references staff(id) on delete set null;

-- 이미 있는 행(진료과당 1행)을 v1으로 굳힌다. 개발 단계라 실 데이터는 없지만,
-- 있더라도 그 행이 곧 그 진료과의 첫 버전이므로 의미가 정확하다.
update questionnaire_templates set version_no = 1 where version_no is null;
alter table questionnaire_templates alter column version_no set not null;
-- 버전 번호는 save_questionnaire_version(max+1)이 항상 명시적으로 넣는다. default 1은 오직
-- 함수를 거치지 않는 「첫 버전 직접 삽입」(주로 테스트 seed)의 편의값이며, unique(department_id,
-- version_no)가 같은 진료과에 두 번째 v1이 들어오는 것을 막으므로 실데이터를 오염시키지 않는다.
alter table questionnaire_templates alter column version_no set default 1;

alter table questionnaire_templates
  add constraint questionnaire_templates_dept_version_key unique (department_id, version_no),
  add constraint questionnaire_templates_version_no_positive check (version_no >= 1),
  -- QADM-FORM-09 / QNR-FORM-01~03: 0개는 허용(문진을 받지 않는다), 31개째부터 거절.
  add constraint questionnaire_templates_question_count
    check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 0 and 30);

-- ③ QADM-VERSION-01: 「현재 사용」은 진료과당 하나뿐이다. 서비스 코드의 성실함이 아니라
--    DB가 지킨다 — 배지가 두 개 뜨는 화면은 만들어질 수조차 없어야 한다.
create unique index questionnaire_templates_one_active_per_dept
  on questionnaire_templates (department_id) where is_active;

create index questionnaire_templates_dept_history
  on questionnaire_templates (department_id, created_at desc, version_no desc, id desc);

-- ④ AD-065: 버전은 지울 수 없다. 과거 답변이 당시 문항을 계속 가리켜야 한다.
create or replace function private.forbid_questionnaire_version_delete()
returns trigger language plpgsql as $$
begin
  raise exception '문진표 버전은 삭제할 수 없습니다 (AD-065). 문진을 그만 받으려면 0문항으로 새 버전을 저장하세요.';
end;
$$;

create trigger trg_forbid_questionnaire_version_delete
  before delete on questionnaire_templates
  for each row execute function private.forbid_questionnaire_version_delete();

-- ④ 결정 12: 버전은 불변이다. 단 하나 is_active만 바뀔 수 있다 —
--    새 버전이 활성화될 때 옛 버전이 내려가야 하기 때문이다.
create or replace function private.enforce_questionnaire_version_immutable()
returns trigger language plpgsql as $$
begin
  -- 내용(문항)·버전 식별(진료과·번호·시각)은 절대 불변. created_by는 authorship이라
  -- 「다른 직원으로 바꾸기」만 막고, 직원 제거로 인한 null화(on delete set null)는 허용한다.
  if new.questions is distinct from old.questions
     or new.department_id is distinct from old.department_id
     or new.version_no is distinct from old.version_no
     or new.created_at is distinct from old.created_at
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception '저장된 문진표 버전은 고칠 수 없습니다 (결정 12). 고치려면 새 버전으로 저장하세요.';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_questionnaire_version_immutable
  before update on questionnaire_templates
  for each row execute function private.enforce_questionnaire_version_immutable();

-- ⑤ QADM-VERSION-01 + QADM-SAVE-05: 「옛 버전 내리기 + 새 버전 올리기」는 한 번에 끝나야 한다.
--    둘로 나누면 그 사이에 활성 버전이 0개인 순간이 생기고, 그때 들어온 환자는 문진 없이 지나간다.
--    base_version_id로 optimistic concurrency도 함께 본다(P-07: 최신 서버 상태 우선).
--
-- ⚠️ security invoker인 것이 중요하다 — 함수가 호출자의 권한으로 돌아야 00007의
--    admin_can_manage_templates(관리자만)가 최종 방어선으로 남는다. security definer로 바꾸면
--    함수 자체가 권한 우회로가 된다(의사가 호출해도 통과한다).
create or replace function save_questionnaire_version(
  p_department_id uuid,
  p_questions jsonb,
  p_base_version_id uuid,
  p_staff_id uuid
) returns uuid language plpgsql security invoker as $$
declare
  v_current_id uuid;
  v_next_no int;
  v_new_id uuid;
begin
  select id, version_no into v_current_id, v_next_no
    from questionnaire_templates
   where department_id = p_department_id and is_active
   for update;

  -- 처음 만드는 진료과는 base가 null이어야 하고, 이미 있는 진료과는 현재 활성 버전이어야 한다.
  if v_current_id is distinct from p_base_version_id then
    raise exception 'CONFLICT: 다른 관리자가 먼저 저장했습니다. 최신 문진표를 다시 불러오세요.'
      using errcode = '40001';
  end if;

  if v_current_id is null then
    v_next_no := 1;
  else
    v_next_no := v_next_no + 1;
    update questionnaire_templates set is_active = false where id = v_current_id;
  end if;

  insert into questionnaire_templates (department_id, questions, version_no, is_active, created_by)
  values (p_department_id, p_questions, v_next_no, true, p_staff_id)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function save_questionnaire_version(uuid, jsonb, uuid, uuid) to authenticated;
