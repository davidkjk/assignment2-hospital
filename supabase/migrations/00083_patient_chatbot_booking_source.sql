-- ⭐ 챗봇 Task ⑦(웹 상담봇 예약 실행) — 환자 예약 INSERT 정책에 source='chatbot' 허용.
--
-- 발견: `patients_can_create_own_appointments`(00017:84)가 `source = 'app'`만 with check로 허용해,
--   환자 RLS 컨텍스트(acquire_as(patient))로 도는 create_booking(source='chatbot')이 RLS로 막혔다
--   (InsufficientPrivilegeError: new row violates row-level security policy for "appointments").
--   즉 챗봇 예약 경로는 실제로 한 번도 통하지 않았다 — chatbot을 유효 소스로 선언한
--   patient_booking_service.PATIENT_SOURCES('app','chatbot')·card_builder '챗봇 공유 계약'과
--   RLS 정책이 어긋난 잠재 버그였다. source enum check(00005:49)는 이미 'chatbot'을 허용한다.
--
-- 수정: 정책을 source in ('app','chatbot')로 넓힌다. 'staff'는 여전히 환자 경로에서 거부(직원 전용
--   정책 receptionist_admin_can_insert_appointments만 삽입). 소유권 검증(patient_owns)은 그대로라
--   여전히 본인·활성 가족의 예약만 만든다. 기존 app 예약은 불변(추가 허용만) · 되돌림 가능.
-- ⚠️ 챗봇 밴드(00053–00059) 소진 + 00060–00069 배포 밴드라 오버플로 규율대로 꼬리 번호 00083(대장 정본).
--    ⚠️ 원격 미적용 — 로컬만 apply, 배포 시 db push(MIGRATION-LEDGER 갱신은 main에서).

drop policy "patients_can_create_own_appointments" on appointments;
create policy "patients_can_create_own_appointments" on appointments
  for insert with check (
    source in ('app', 'chatbot')
    and patient_owns(account_patient_id)
    and patient_owns(for_patient_id));
