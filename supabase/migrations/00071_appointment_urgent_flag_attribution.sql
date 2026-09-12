-- [QUEUE-URG-06] 응급/주의 표시를 「누가·언제」 켰는지 남긴다.
--
-- 끌 때 그 정보를 확인 팝업에 그대로 띄워(`오늘 09:32 · 박간호 님이 켰습니다`), 다른 직원이
-- 이유가 있어 켠 것을 모르고 끄는 일을 막는다 — 순서 변경에 「바꾼 사람이 남아야」를 요구한 것과 같은
-- 취지다. is_urgent_flag(00005)는 켜짐/꺼짐만 담고 주체·시각이 없어 이 두 칸을 더한다.
--
-- 끄면 두 칸 모두 null로 리셋한다(서비스층 set_urgent_flag에서). 표시가 꺼진 줄엔 「누가 켰나」가
-- 의미 없기 때문이다. staff 삭제 시엔 표시자만 잃고 표시 자체는 남도록 set null.

alter table appointments
  add column urgent_flagged_by uuid references staff(id) on delete set null,
  add column urgent_flagged_at timestamptz;

comment on column appointments.urgent_flagged_by is
  '[QUEUE-URG-06] 응급/주의 표시를 켠 직원(staff.id). 끄면 null.';
comment on column appointments.urgent_flagged_at is
  '[QUEUE-URG-06] 응급/주의 표시를 켠 시각. 끄면 null.';
