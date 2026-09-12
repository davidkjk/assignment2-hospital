"""매일 아침 크론이 실행하는 리마인더 발송 잡. 실행: python -m app.jobs.reminders

⑤ 반입 개정(2026-08-20): 문구는 소비만(환자앱 T9/T24 소유) · reminder_day_before로 통일 ·
수신자는 계정 소유자(account_patient_id) · 사전문진 대상은 T24 list_reminder_targets 소비(QNR-NOTI-01)."""
import asyncio
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from app.db.pool import get_pool
from app.services import notification_service
from app.services import patient_questionnaire_service as qsvc   # 환자앱 T24 — 사전문진 대상·문구 소유

KST = ZoneInfo("Asia/Seoul")


def _today_kst() -> date:
    """서버 OS 타임존이 UTC여도 'KST 기준 오늘'을 반환한다.
    [정합성 검토 우선10] date.today()는 서버 로컬 타임존(Railway 기본값 UTC)을 따르므로
    KST 자정 부근에서 날짜가 하루 어긋날 수 있어 명시적으로 KST로 변환한다."""
    from datetime import datetime
    return datetime.now(KST).date()


async def send_reminders(today: date | None = None) -> dict:
    today = today or _today_kst()
    tomorrow = today + timedelta(days=1)
    counts = {"reminder_today": 0, "reminder_day_before": 0, "questionnaire": 0}
    pool = await get_pool()
    async with pool.acquire() as conn:
        # (1) 확정 예약 리마인더 — 오늘/내일.
        #     수신자는 account_patient_id(계정 소유자, 00005:40 NOT NULL) — 가족 예약도 소유자에게 간다(개정 3).
        #     날짜·시각({when})은 notify_patient가 appointment_id로 채운다(#125). 가족 예약이면 target_name도.
        rows = await conn.fetch(
            """
            select a.id, a.account_patient_id, s.slot_date,
                   case when a.for_patient_id <> a.account_patient_id
                        then (select name from patients where id = a.for_patient_id) end as target_name
            from appointments a
            join appointment_slots s on s.id = a.slot_id
            where a.status = '예약확정' and s.slot_date in ($1, $2)
            """,
            today, tomorrow,
        )
        for row in rows:
            ntype = "reminder_today" if row["slot_date"] == today else "reminder_day_before"
            await notification_service.notify_patient(
                row["account_patient_id"], ntype,
                appointment_id=row["id"], target_name=row["target_name"])
            counts[ntype] += 1

        # (2) 사전문진 미작성/작성 중 — 내일 대상. 대상·문구·남은 수는 환자앱 T24가 소유(QNR-NOTI-01·갭 #53).
        #     이 잡은 「전날 하루 1회」 시점만 정한다. 옛 「문진 행 존재」 판정은 폐기됐다(그대로 옮기면 안 된다).
        for t in await qsvc.list_reminder_targets(conn, tomorrow):
            if t["total"] == 0:                # 문진을 받지 않는 진료과(0문항) — 재촉할 것이 없다(QNR-FORM-04의 짝)
                continue
            built = qsvc.build_reminder_body(t["state"], t["answered"], t["total"])
            if built is None:                  # 방어 — 조회가 이미 완료자를 걸렀다
                continue
            _key, remaining = built
            await notification_service.notify_patient(
                t["account_patient_id"], "questionnaire_missing",
                appointment_id=t["appointment_id"], target_name=t["target_name"], remaining=remaining)
            counts["questionnaire"] += 1
    print(f"[reminders] {counts}")
    return counts


if __name__ == "__main__":
    asyncio.run(send_reminders())
