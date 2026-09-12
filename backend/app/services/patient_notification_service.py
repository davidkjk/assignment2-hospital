from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

# 알림함은 로그인 본인 커넥션(RLS)으로 읽는다. notification_log의 SELECT는 본인 행만 보여야 하므로
# where patient_id = 이 계정으로 좁힌다(발송은 서비스 역할이 쓰지만, 읽기는 본인만 · 00026 RLS 정책).
_LIST_SQL = """
    select nl.id, nl.appointment_id, nl.notification_type, nl.kind, nl.body, nl.sent_at,
           (p.notifications_seen_at is not null and nl.sent_at <= p.notifications_seen_at) as is_read
      from notification_log nl
      cross join lateral (select notifications_seen_at from patients where id = $1) p
     where nl.patient_id = $1
       and nl.sent_at > now() - interval '30 days'
     order by nl.sent_at desc
"""


async def list_notifications(patient: PatientContext) -> list[dict]:
    """NOTI-LIST-01·READ-01·02·KEEP-01: 30일 이내, 최신순, is_read는 현재 seen_at 기준(갱신 전)."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(_LIST_SQL, patient.id)
        return [dict(r) for r in rows]


async def count_unread(patient: PatientContext) -> int:
    """NOTI-READ-08: 종 배지. seen_at 이후에 온 것만. null이면 전부."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        return await conn.fetchval(
            "select count(*) from notification_log nl "
            "where nl.patient_id = $1 and nl.sent_at > now() - interval '30 days' "
            "and nl.sent_at > coalesce("
            "  (select notifications_seen_at from patients where id = $1), '-infinity'::timestamptz)",
            patient.id,
        )


async def mark_all_read(patient: PatientContext) -> None:
    """NOTI-READ-04: 알림함 진입 순간 한 번. seen_at을 now()로 → 배지 0.
    patients 직접 UPDATE 정책은 없다(00017 설계 — 칼럼 단위 보호) → definer 창구로 본인 seen_at만 갱신."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute("select mark_notifications_seen()")
