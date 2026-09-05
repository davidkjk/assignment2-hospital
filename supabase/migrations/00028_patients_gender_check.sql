-- 갭 #57(QNR-SHOW-10) — 성별 값이 표준화돼 있지 않아 문진 「보일 대상」이 조용히 어긋난다.
-- 00003은 gender text not null 뿐이라 '여'·'남'·'female' 같은 값이 그대로 저장된다.
-- ⚠️ 백필 → 제약 순서. 반대로 하면 기존 행 때문에 통째로 실패한다.

update patients set gender = 'F'
 where gender in ('여', '여성', 'f', 'female', 'FEMALE', 'Female', '여자');
update patients set gender = 'M'
 where gender in ('남', '남성', 'm', 'male', 'MALE', 'Male', '남자');

-- 위 목록에 없는 값이 남아 있으면 제약이 실패한다 — 그때는 사람이 봐야 한다(조용히 뭉개지 않는다).
-- 확인용: select distinct gender from patients where gender not in ('F','M');

alter table patients
  add constraint patients_gender_check check (gender in ('F', 'M'));
