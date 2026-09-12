-- [STAFF-ACTIVATED-01 / 2026-09-07] 미수락(초대만 받고 아직 비밀번호 미설정) 판정을
-- Supabase auth 신호가 아니라 우리 자체 표식으로 바꾼다.
--
-- 왜: 초대/복구 링크는 "클릭"만 해도 Supabase가 매직링크 세션을 만들며 auth.users.last_sign_in_at을
--   채운다. 그동안 미수락 판정을 last_sign_in_at===null 하나로 했기 때문에, 링크를 눌러 놓고
--   비밀번호 설정을 끝내지 않은 사람이 "이미 들어온 직원(수락)"으로 오분류됐다 —
--   직원 목록 버튼(STAFF-LIST-08 배지·[재초대] vs [비밀번호 재설정])·캘린더 「아직 안 들어옴」
--   깃발(STAFF-PEND-01)·미수락 삭제 가드(STAFF-DELETE-01)가 전부 이 신호를 공유해 함께 어긋났다.
--
-- 해결: activated_at은 "비밀번호 설정을 실제로 마친 순간"(POST /me/activate)에만 채운다. 링크 클릭·
--   매직링크 세션 생성으로는 켜지지 않으므로 어느 auth 필드가 새는지와 무관하게 튼튼하다.
--   null = 미수락, not null = 수락(들어옴).
alter table public.staff add column if not exists activated_at timestamptz;

comment on column public.staff.activated_at is
  '[STAFF-ACTIVATED-01] 초대 수락(최초 비밀번호 설정) 완료 시각. null=미수락. auth 신호가 링크 클릭만으로 켜지는 오분류를 피하려 자체 표식으로 둔다.';

-- 백필: 이미 한 번이라도 로그인한 적 있는(=비밀번호가 있는) 기존 직원은 수락 완료로 본다.
--   변경 이전에 만들어진 계정을 보정한다. auth.users.last_sign_in_at을 근사 시각으로 쓴다 —
--   이 시점엔 "클릭만 하고 비번 미설정"인 미완 계정이 사실상 없으므로 안전한 일회성 백필이다.
--   (이후로는 activated_at이 유일한 권위 신호이고, last_sign_in_at은 「마지막 로그인」 표시 전용.)
update public.staff s
set activated_at = u.last_sign_in_at
from auth.users u
where s.auth_user_id = u.id
  and u.last_sign_in_at is not null
  and s.activated_at is null;
