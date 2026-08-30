-- FAM-EDIT-03·05 — 「그 사람의 정보」를 앱에서 고칠 수 있는지 가르려면
-- 그 환자 행이 **앱 사용자가 만든 것인지**를 알아야 한다.
-- null = 병원 접수·가입 경로에서 온 행(= 병원 기록이 원본, 앱이 덮으면 안 된다)
alter table patients
  add column app_created_by uuid references patients(id);

comment on column patients.app_created_by is
  '앱에서 가족으로 등록해 만든 행이면 만든 계정의 patients.id. 병원 접수·본인 가입으로 생긴 행은 null.';

-- 「내가 만든 가족 명부 행」을 찾는 조회에 쓴다(가족 목록 판정).
create index patients_app_created_by_idx on patients (app_created_by) where app_created_by is not null;
