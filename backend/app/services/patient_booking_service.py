from datetime import datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as
from app.services import notification_service
from app.services.slot_service import book_slot, release_slot

CHANGEABLE_STATUSES = ("예약신청", "예약확정")
PATIENT_SOURCES = ("app", "chatbot")  # 'staff'는 직원 경로 전용 — 환자 서비스는 거부(4단계 챗봇 공유 계약)
KST = ZoneInfo("Asia/Seoul")
SUPPORT_TYPES = ("취소", "변경")  # 마감 후 상담 연결 종류(#26 — 변경도 취소와 같은 상담)


async def _initial_status(conn) -> str:
    # 환자 세션은 hospital_settings를 통째로 읽을 수 없다(민감칸, staff만 SELECT 정책) →
    # auto_confirm 한 칸만 여는 definer 창구로 읽는다. #29(AD-051) 기본 true.
    auto = await conn.fetchval("select get_auto_confirm_app_bookings()")
    return "예약확정" if auto else "예약신청"


async def _is_after_booking_deadline(conn, slot_id: UUID) -> bool:
    """오늘 진료분 슬롯에 한해 그 요일 booking_deadline을 지났는지. 미래 슬롯은 항상 False."""
    from zoneinfo import ZoneInfo
    slot = await conn.fetchrow("select doctor_id, slot_date from appointment_slots where id=$1", slot_id)
    if slot is None:
        return False
    now_kst = datetime.now(ZoneInfo("Asia/Seoul"))
    if slot["slot_date"] != now_kst.date():
        return False
    rule = await conn.fetchrow(
        "select booking_deadline from doctor_schedule_rules where doctor_id=$1 and weekday=$2",
        slot["doctor_id"], slot["slot_date"].weekday())
    if rule is None or rule["booking_deadline"] is None:
        return False
    return now_kst.time() > rule["booking_deadline"]


async def create_booking(patient: PatientContext, for_patient_id: UUID, department_id: UUID,
                         doctor_id: UUID, slot_id: UUID, reason: str, request_id: UUID,
                         source: str = "app") -> UUID:
    """갭 #15: request_id로 멱등. 같은 (계정, request_id)는 예약 한 건만. source는 챗봇 공유 계약.
    상태 이력은 log_appointment_status_change() 트리거가 INSERT 시 자동으로 남긴다."""
    if source not in PATIENT_SOURCES:
        raise AppError("허용되지 않은 예약 경로입니다.", status_code=400)
    async with acquire_as(str(patient.auth_user_id)) as conn:
        # 멱등 1차: 같은 요청을 이미 처리했으면 슬롯을 잡지 않고 그대로 돌려준다.
        existing = await conn.fetchval(
            "select id from appointments where account_patient_id=$1 and request_id=$2",
            patient.id, request_id)
        if existing is not None:
            return existing

        if await _is_after_booking_deadline(conn, slot_id):
            raise AppError("오늘 진료분 예약은 마감되었습니다. 상담을 통해 문의해주세요.", status_code=409)
        if not await book_slot(slot_id, patient, conn=conn):
            raise AppError("이미 선택된 시간입니다. 다른 시간을 선택해주세요.", status_code=409)

        status = await _initial_status(conn)
        try:
            appointment_id = await conn.fetchval(
                "insert into appointments "
                "(slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source, request_id) "
                "values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
                slot_id, patient.id, for_patient_id, department_id, doctor_id, reason, status, source, request_id)
        except asyncpg.UniqueViolationError:
            # 멱등 2차(경쟁): 거의 동시에 온 같은 request_id가 유니크에 걸렸다 →
            # 슬롯을 되돌리고 먼저 만들어진 예약을 돌려준다(예약은 여전히 한 건).
            await release_slot(slot_id, patient, conn=conn)
            winner = await conn.fetchval(
                "select id from appointments where account_patient_id=$1 and request_id=$2",
                patient.id, request_id)
            if winner is not None:
                return winner   # 경쟁 패자 — 승자 트랜잭션에서 알림이 나간다(중복 발송 안 함)
            raise AppError("예약 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.", status_code=409)
        except asyncpg.PostgresError as exc:  # 원문 노출 금지 — 서버 로그로만
            raise AppError("예약을 만들 수 없습니다. 입력을 확인해주세요.", status_code=400) from exc

        # 가족 예약이면 대상자 이름을 알림 본문 앞에 붙인다(트랜잭션 안에서 조회 — RLS).
        target_name = None
        if for_patient_id != patient.id:
            target_name = await conn.fetchval("select name from patients where id=$1", for_patient_id)

    # 트랜잭션 밖 — best-effort 알림. 알림 실패가 예약을 되돌리지 않는다(1단계 best-effort 원칙).
    try:
        await notification_service.notify_patient(
            patient.id,
            "confirmed" if status == "예약확정" else "requested",
            target_name=target_name,
            appointment_id=appointment_id,
        )
    except Exception:
        pass
    return appointment_id


async def change_booking(patient: PatientContext, appointment_id: UUID, new_slot_id: UUID,
                         reason: str, expected_updated_at: datetime) -> UUID:
    """변경 = 옛 예약 취소 + 새 예약. APPT-RACE-01 낙관적 잠금, APPT-CHG-10·11 문진 이동."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select slot_id, status, for_patient_id, department_id, updated_at from appointments where id=$1",
            appointment_id)
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        # APPT-RACE-01: 화면이 열 때 본 버전과 다르면, 그 사이 병원·가족이 먼저 바꿨다는 뜻.
        if row["updated_at"] != expected_updated_at:
            raise AppError("예약이 이미 변경되었습니다.", status_code=409)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약은 변경할 수 없습니다.", status_code=400)

        new_slot = await conn.fetchrow("select doctor_id from appointment_slots where id=$1", new_slot_id)
        if new_slot is None:
            raise AppError("선택한 시간을 찾을 수 없습니다.", status_code=404)
        if not await book_slot(new_slot_id, patient, conn=conn):
            raise AppError("이미 선택된 시간입니다. 다른 시간을 선택해주세요.", status_code=409)

        try:
            await conn.execute("select set_config('app.status_change_reason', '예약 변경으로 인한 자동 취소', true)")
            # APPT-RACE-01: 위에서 본 버전(expected_updated_at)과 같을 때만 취소가 성사되도록 UPDATE에
            # 낙관적 잠금을 함께 싣는다. 같은 화면 버전을 본 두 change_booking이 서로 다른 새 슬롯으로
            # 동시에 진행해도, 이 조건부 UPDATE의 row lock으로 한쪽만 원래 예약을 취소한다 — 진 쪽은
            # UPDATE 0 → 409로 롤백되어 방금 잡은 새 슬롯도 트랜잭션과 함께 되돌려진다. SELECT 시점
            # 비교(위 row["updated_at"])만으로는 그 사이 두 요청이 모두 통과해 예약 하나가 둘로 분열됐다.
            cancelled = await conn.execute(
                "update appointments set status='환자취소', updated_at=now() where id=$1 and updated_at=$2",
                appointment_id, expected_updated_at)
            if cancelled == "UPDATE 0":
                raise AppError("예약이 이미 변경되었습니다.", status_code=409)
            if row["slot_id"] is not None:
                await release_slot(row["slot_id"], patient, conn=conn)
            new_status = await _initial_status(conn)
            new_id = await conn.fetchval(
                "insert into appointments "
                "(slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source) "
                "values ($1,$2,$3,$4,$5,$6,$7,'app') returning id",
                new_slot_id, patient.id, row["for_patient_id"], row["department_id"],
                new_slot["doctor_id"], reason, new_status)
            # APPT-CHG-10·11 / C-6: 문진을 새 예약으로 옮긴다(작성 시각 유지). 새 예약([새로 예약하기])엔 적용 안 함.
            await conn.execute("select move_questionnaire_response($1, $2)", appointment_id, new_id)
            # 가족 예약이면 대상자 이름을 알림 본문 앞에 붙인다(트랜잭션 안에서 조회 — RLS).
            target_name = None
            if row["for_patient_id"] != patient.id:
                target_name = await conn.fetchval("select name from patients where id=$1", row["for_patient_id"])
        except asyncpg.PostgresError as exc:
            raise AppError("예약을 변경할 수 없습니다. 잠시 후 다시 시도해주세요.", status_code=400) from exc

    # 트랜잭션 밖 — best-effort 알림. 알림 실패가 변경을 되돌리지 않는다.
    try:
        await notification_service.notify_patient(
            patient.id, "changed", target_name=target_name, appointment_id=new_id)
    except Exception:
        pass
    return new_id


async def cancel_appointment(patient: PatientContext, appointment_id: UUID,
                             expected_updated_at: datetime) -> dict:
    """마감 전/30분 유예(C-5)면 즉시 취소, 마감 후면 after_deadline만 알린다(취소 안 함).
    CANCEL-PRE-05: 사유를 받지 않는다. 상태 이력은 트리거가 자동으로 남긴다."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select a.status, a.slot_id, a.created_at, a.updated_at, s.slot_date, s.start_time "
            "from appointments a left join appointment_slots s on s.id = a.slot_id where a.id=$1",
            appointment_id)
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["updated_at"] != expected_updated_at:  # APPT-RACE-01
            raise AppError("예약이 이미 변경되었습니다.", status_code=409)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약입니다.", status_code=400)

        now_kst = datetime.now(KST)
        # CANCEL-NEW-04(C-5): 만든 지 30분 이내면 마감과 무관하게 즉시 취소.
        within_grace = row["created_at"].astimezone(KST) + timedelta(minutes=30) > now_kst
        before_deadline = True
        if row["slot_date"] is not None:
            # 환자 세션은 hospital_settings를 통째로 못 읽는다(staff 전용 SELECT 정책) →
            # cancellation_deadline_hours 한 칸만 여는 definer 창구로 읽는다(00025, 없으면 기본 24).
            hours = await conn.fetchval("select get_cancellation_deadline_hours()")
            appt_dt = datetime.combine(row["slot_date"], row["start_time"], tzinfo=KST)
            before_deadline = now_kst <= appt_dt - timedelta(hours=hours)

        if within_grace or before_deadline:
            try:
                await conn.execute(                                # C2-#6: 취소 주체=환자쪽. 병원취소는 직원웹이 'hospital'을 쓴다.
                    "update appointments set status='환자취소', cancelled_by='patient', cancelled_at=now(), "
                    "updated_at=now() where id=$1", appointment_id)  # 가족 대행분의 relation/name 채우기는 CARD-CXL-03 write 로직(⑦)
            except asyncpg.PostgresError as exc:  # 원문 노출 금지
                raise AppError("예약을 취소할 수 없습니다. 잠시 후 다시 시도해주세요.", status_code=400) from exc
            if row["slot_id"] is not None:
                await release_slot(row["slot_id"], patient, conn=conn)
            return {"cancelled": True, "after_deadline": False}
        # 마감 후: 취소하지 않는다. 화면이 CANCEL-LATE 팝업 → [상담 채팅 연결] → request_support().
        return {"cancelled": False, "after_deadline": True}


async def request_support(patient: PatientContext, appointment_id: UUID, request_type: str) -> dict:
    """CANCEL-LATE-11: [상담 채팅 연결]을 눌렀을 때만 support_requested_at+request_type를 기록한다.
    이미 요청했으면 멱등(CANCEL-LATE-14). 상태는 바꾸지 않고, 감사 note만 from=to로 남긴다."""
    if request_type not in SUPPORT_TYPES:
        raise AppError("허용되지 않은 요청 종류입니다.", status_code=400)
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select status, support_requested_at from appointments where id=$1", appointment_id)
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약입니다.", status_code=400)
        if row["support_requested_at"] is not None:  # CANCEL-LATE-14 멱등
            return {"support_requested": True, "already_requested": True}
        await conn.execute(
            "update appointments set support_requested_at=now(), request_type=$2, updated_at=now() where id=$1",
            appointment_id, request_type)
        # 상태변화 없는 감사 note(patients_can_insert_note_history) — from=to. 내부 기록이라 환자 노출 문구 아님.
        await conn.execute(
            "insert into appointment_status_history "
            "(appointment_id, from_status, to_status, changed_by_patient_id, reason) values ($1,$2,$2,$3,$4)",
            appointment_id, row["status"], patient.id, f"마감 후 {request_type} 상담 연결")
        return {"support_requested": True, "already_requested": False}


async def acknowledge_hospital_change(patient: PatientContext, appointment_id: UUID) -> None:
    """CARD-CHG-04: 병원발 변경/취소 안내문의 [확인]. 두 칸을 비운다(RLS가 본인+가족만 통과).
    스키마 칸은 직원웹 T2가 만들고 reschedule/병원발 취소가 채운다(경계 #17) — 여기선 비우기만.
    이 앱에서 "봤다는 사실"이 서버에 남는 유일한 곳: 두 칸이 비어야 앱을 껐다 켜도 안내문이 다시 뜨지 않는다."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        # RLS: patients_can_update_own_appointments 범위 밖이면 0행(조용히 통과 — 개인정보 열거 방지)
        await conn.execute(
            "update appointments set hospital_change_prev_time=null, hospital_change_kind=null "
            "where id=$1",
            appointment_id)


async def acknowledge_cancel_rejection(patient: PatientContext, appointment_id: UUID) -> None:
    """CANCEL-REJ-04: 취소 반려 배너의 [확인]. 두 칸을 비운다(hospital_change 패턴 대칭, 00027).
    직원웹 반려가 cancel_rejected_at/_reason를 채우고 cancellation_rejected 알림을 보낸다 —
    여기선 비우기만. 두 칸이 비어야 앱을 껐다 켜도 배너가 다시 뜨지 않고 QR이 정상 복귀한다(CANCEL-REJ-05).
    RLS(patients_can_update_own_appointments)가 본인·가족 예약만 통과시킨다."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "update appointments set cancel_rejected_at=null, cancel_rejected_reason=null "
            "where id=$1",
            appointment_id)
