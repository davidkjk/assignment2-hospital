"""[Task 9] 알림 발송의 '하나뿐인 판단 지점'(결정 #109).

선호도·문구·채널·중복을 여기서 정하고, 실제 배달(푸시/문자·콜백·재시도·죽은토큰)은
직원웹 T30의 dispatch_service.send_now에 넘긴다. 이 태스크는 배달을 짓지 않는다.

⭐ 채널 판정은 dispatch_service._sms_eligible(공용)를 써서, 초기 선택과 폴백이 갈라지지 않게 한다
   (HSET-SMS-05·#111). requested_channel은 사용자가 '고른' 값을 보존해(SEND-RESULT-09·#120),
   푸시가 죽었을 때 dispatch_service가 문자로 폴백(SEND-RESULT-03c·#100)할 수 있게 한다.
"""
from datetime import date, time
from uuid import UUID

from app.db.pool import get_pool
from app.services import dispatch_service   # 직원웹 T30 소유(2단계 먼저 구현). 실제 배달을 넘긴다.

# 코드 기본 문구 표 — DB(notification_type_settings)에 줄이 없으면 이 값이 원본이다(#126).
# {when}은 날짜·시각 치환 자리(리마인더). 슬롯이 없으면 빈 문자열로 채워 그 자리만 조용히 빠진다(#125).
# ⚠️ 11번째 '직원 상담 답변 도착'은 4단계(챗봇) 몫이라 여기 없다 — 그때 한 줄 추가된다.
MESSAGES = {
    "requested": "예약이 신청되었습니다.",
    "confirmed": "예약이 확정되었습니다.",
    "changed": "예약이 변경되었습니다.",
    "reminder_day_before": "내일{when} 예약이 있습니다. 잊지 말고 방문해 주세요.",
    "reminder_today": "오늘{when} 예약이 있습니다.",
    "hospital_cancelled": "병원 사정으로 예약이 취소되었습니다.",
    "cancellation_approved": "취소 요청이 처리되어 예약이 취소되었습니다.",
    "cancellation_rejected": "취소가 어렵다는 답변을 받았습니다. 병원에 문의해 주세요.",
    # 갭 #53: 한 벌이던 문진 문구를 상태별 두 벌로 나눈다(QNR-NOTI-05). 「아직 작성하지 않으셨습니다」류는
    # 작성 중인 사람에게 사실이 아니라 쓰지 않는다 — 남은 수({remaining})는 {when}과 같은 슬롯 규칙(#125).
    "questionnaire_missing": "내일 진료 전 사전문진을 작성해 주세요.",
    "questionnaire_partial": "작성하시던 사전문진이 {remaining}문항 남았습니다. 내일 진료 전에 마쳐 주세요.",
    "visit_completed": "진료가 완료되었습니다. 안내를 확인해 주세요.",
    # 결정 #3 ㉢: 가족 연결이 끝나면 항상 대상 B에게 통보한다(몰래 열었다는 인상을 막고 이의제기 길을 연다).
    # 본인이 요청하지 않은 연결이면 병원에 문의하도록 안내한다(이의제기는 오프라인 병원 문의).
    "family_linked": "가족 구성원으로 연결되었습니다. 본인이 요청하지 않으셨다면 병원으로 문의해 주세요.",
}


def _format_when(slot_date: date, start_time: time) -> str:
    """'8월 20일 오후 2시' 형태. 분이 있으면 '2시 30분'. (#125 중장년층 가독)"""
    hour = start_time.hour
    ampm = "오전" if hour < 12 else "오후"
    h12 = hour % 12 or 12
    minute = f" {start_time.minute}분" if start_time.minute else ""
    return f"{slot_date.month}월 {slot_date.day}일 {ampm} {h12}시{minute}"


async def notify_patient(
    account_patient_id: UUID,
    notification_type: str,
    *,
    kind: str = "transactional",
    target_name: str | None = None,
    appointment_id: UUID | None = None,
    remaining: int | None = None,        # ⭐ 문진 알림의 「남은 수」(QNR-NOTI-04·QNR-PROG-10)
) -> None:
    """선호도 off·보낼 수단 없음·중복이면 조용히 무발송한다.
    ⚠️ 항상 계정 소유자(account_patient_id)에게 보낸다. 가족 예약이면 target_name으로 대상자 이름을 본문에 명시한다.
    ⚠️ 야간 차단은 marketing 전용이라 여기(트랜잭션)엔 적용하지 않는다 — 예약확정 문자는 밤에도 나가야 한다."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1) 선호도 — 줄 없으면 켜짐. 끈 알림은 푸시·문자·알림함 어디에도 만들지 않는다(#5).
        pref = await conn.fetchrow(
            "select enabled from notification_preferences where patient_id=$1 and notification_type=$2",
            account_patient_id, notification_type,
        )
        if pref is not None and not pref["enabled"]:
            return

        # 2) 문구 — DB(설정)가 있으면 그것, 없으면 코드 기본(#126). 날짜·시각·이름 치환(#125).
        #    문진 알림만 상태에 따라 문구 키가 갈린다(갭 #53). 나머지는 종류 = 키.
        #    선호도(1)와 notification_log의 notification_type은 여전히 하나라 스위치·dedup·목적지가 안 갈린다.
        message_key = "questionnaire_partial" \
            if (notification_type == "questionnaire_missing" and remaining is not None) \
            else notification_type
        setting = await conn.fetchrow(
            "select body from notification_type_settings where notification_type=$1", message_key,
        )
        base = (setting["body"] if setting and setting["body"] else None) \
            or MESSAGES.get(message_key, "새 소식이 있습니다.")
        when = ""
        if appointment_id is not None:
            slot = await conn.fetchrow(
                "select s.slot_date, s.start_time from appointments a "
                "join appointment_slots s on s.id = a.slot_id where a.id=$1",
                appointment_id,
            )
            if slot and slot["slot_date"] is not None:
                when = " " + _format_when(slot["slot_date"], slot["start_time"])
        body = base.replace("{when}", when).replace("{remaining}", str(remaining or ""))
        if target_name:
            body = f"{target_name}님 {body}"

        # 3) 채널 — push 우선, 토큰 없으면 문자 폴백(단일 채널로 로그; 00011 dedup이 채널 단위가 아님).
        #    「문자 써도 되나」 판정은 배달 계층의 공용 헬퍼를 쓴다(HSET-SMS-05·#111).
        #    channel=실제 보낼 값(#120), requested_channel=고른 값(SEND-RESULT-09) — 푸시가 죽으면
        #    dispatch_service가 requested의 sms로 폴백한다(SEND-RESULT-03c·#100).
        tokens = await conn.fetch(
            "select token from device_tokens where patient_id=$1", account_patient_id,
        )
        sms_ok = await dispatch_service._sms_eligible(conn, account_patient_id)
        if tokens:
            channel = "push"
            requested = "push_sms" if sms_ok else "push"
        elif sms_ok:
            channel = "sms"           # #111·SEND-CH-01 폴백. #120: 실제 채널을 기록한다.
            requested = "sms"
        else:
            return                    # 보낼 수단 없음(병원 문자 off + 토큰 없음, 또는 죽은 번호)

        # 4) 발송로그 먼저(기록이 발송보다 먼저 — #121·#119). dedup은 00011 부분 인덱스, 실패 줄은 비켜간다.
        nid = await conn.fetchval(
            "insert into notification_log "
            "(appointment_id, patient_id, notification_type, kind, body, channel, requested_channel, delivery_status) "
            "values ($1,$2,$3,$4,$5,$6,$7,'발송중') on conflict do nothing returning id",
            appointment_id, account_patient_id, notification_type, kind, body, channel, requested,
        )
        if nid is None:
            return                    # 이미 같은 예약·종류로 닿은 이력이 있다(중복 발송 방지)

        # 5) 실제 배달은 배달 계층(직원웹 T30)에 넘긴다 — 푸시 즉시/문자 접수 후 콜백으로 도달·실패 갱신.
        await dispatch_service.send_now([nid], conn)
