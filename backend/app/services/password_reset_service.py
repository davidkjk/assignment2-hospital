"""서버 경유 비밀번호 재설정(AUTH-PWNEW-*, 갭 #78). OTP를 통과해 로그인된 세션에서만 도달한다
(AUTH-PWFIND-05·07). 이름을 대조해 번호 재활용을 막고, 5회 틀리면 잠근다."""
from app.core.errors import AppError

MAX_RESET_FAILS = 5  # AUTH-PWNEW-15


def normalize_name(s: str) -> str:
    """AUTH-PWNEW-10 — 앞뒤 여백과 가운데 공백을 모두 지운 뒤 비교한다('홍 길동' == '홍길동')."""
    return "".join(s.split())


async def verify_name_and_reset(conn, admin_client, auth_user_id, *, name_input, new_password):
    """이름이 맞으면 서버 경유로 비밀번호를 바꾼다(AUTH-PWNEW-09b). 저장된 이름은 응답으로
    내려보내지 않는다(AUTH-PWNEW-09). 다르면 실패를 세고 5회면 잠근다(AUTH-PWNEW-11·15)."""
    row = await conn.fetchrow(
        "select name, phone from patients where auth_user_id = $1", auth_user_id)
    if row is None:
        raise AppError("비밀번호를 재설정할 수 없습니다. 병원으로 문의해주세요.", status_code=409)

    phone = row["phone"]
    lock = await conn.fetchrow(
        "select fail_count, locked from password_reset_locks where phone = $1", phone)
    if lock and lock["locked"]:
        raise AppError("여러 번 일치하지 않아 잠겼습니다. 병원으로 문의해주세요.", status_code=423)

    if normalize_name(name_input) != normalize_name(row["name"]):
        new_count = (lock["fail_count"] if lock else 0) + 1
        await conn.execute(
            "insert into password_reset_locks (phone, fail_count, locked, updated_at) "
            "values ($1, $2, $3, now()) "
            "on conflict (phone) do update set "
            "fail_count = excluded.fail_count, locked = excluded.locked, updated_at = now()",
            phone, new_count, new_count >= MAX_RESET_FAILS)
        raise AppError("등록된 이름과 다릅니다.", status_code=400)  # 저장된 이름을 넣지 않는다

    # 맞음 — 카운트를 지우고 서버 경유(admin)로 비밀번호를 바꾼다.
    # ⚠️ admin_client는 동기(supabase-py) — register_profile·deactivate_self와 같이 await 없이 부른다.
    await conn.execute("delete from password_reset_locks where phone = $1", phone)
    admin_client.auth.admin.update_user_by_id(str(auth_user_id), {"password": new_password})
