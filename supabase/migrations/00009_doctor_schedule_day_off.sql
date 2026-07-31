alter table doctor_schedule_rules
  add column is_day_off boolean not null default false;
