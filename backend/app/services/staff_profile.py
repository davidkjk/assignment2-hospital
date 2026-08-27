"""[Task 19] 의사 프로필 저장·사진 업로드·삭제.

`/admin/staff` 프로필 패널이 소유하는 칸(전문분야·소개글·사진·캘린더 색)을 다룬다.
⚠️ 대상이 의사인지 서버가 먼저 검사한다(STAFF-PROFILE-02) — 화면에서 버튼을 안 그리는 것이
서버가 막는 것을 대신하지 않는다(P-08).
"""

from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as

PHOTO_BUCKET = "doctor-photos"

_UNSET = object()


def _default_bucket():
    return get_admin_client().storage.from_(PHOTO_BUCKET)


async def _assert_doctor(conn, staff_id: UUID) -> dict:
    row = await conn.fetchrow("select id, role, photo_url from staff where id = $1", staff_id)
    if row is None:
        raise AppError("대상 직원을 찾을 수 없습니다.", status_code=404)
    if row["role"] != "doctor":
        # 접수직원·관리자는 캘린더에 열이 없어 프로필을 쓸 데가 없다(CAL-COLOR-08).
        raise AppError("의사 계정만 프로필을 편집할 수 있습니다.", status_code=400)
    return dict(row)


async def update_doctor_profile(
    staff_id: UUID,
    *,
    specialty=_UNSET,
    bio=_UNSET,
    photo_url=_UNSET,
    calendar_color_index=_UNSET,
    staff: StaffContext,
    conn=None,
) -> None:
    """전달된 칸만 갱신한다(부분 저장). 색은 색값이 아니라 팔레트 번호를 저장한다(CAL-COLOR-09)."""
    updates: list[tuple[str, object]] = []
    if specialty is not _UNSET:
        updates.append(("specialty", specialty))
    if bio is not _UNSET:
        updates.append(("bio", bio))
    if photo_url is not _UNSET:
        updates.append(("photo_url", photo_url))
    if calendar_color_index is not _UNSET:
        updates.append(("calendar_color_index", calendar_color_index))

    async def _run(c):
        await _assert_doctor(c, staff_id)
        if not updates:
            return
        set_clause = ", ".join(f"{col} = ${i + 2}" for i, (col, _) in enumerate(updates))
        await c.execute(
            f"update staff set {set_clause} where id = $1",
            staff_id,
            *[value for _, value in updates],
        )

    if conn is not None:
        await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            await _run(c)


def _extension(filename: str) -> str:
    if "." in filename:
        return "." + filename.rsplit(".", 1)[1].lower()
    return ""


async def upload_photo(
    staff_id: UUID,
    *,
    filename: str,
    content_type: str,
    data: bytes,
    staff: StaffContext,
    conn=None,
    storage=None,
) -> str:
    """사진을 Storage에 올리고 공개 URL을 photo_url에 저장한 뒤 그 URL을 돌려준다."""
    bucket = storage or _default_bucket()
    object_path = f"{staff_id}{_extension(filename)}"

    async def _run(c):
        await _assert_doctor(c, staff_id)
        bucket.upload(object_path, data, {"content-type": content_type, "upsert": "true"})
        public_url = bucket.get_public_url(object_path)
        await c.execute("update staff set photo_url = $2 where id = $1", staff_id, public_url)
        return public_url

    if conn is not None:
        return await _run(conn)
    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


def _object_path(photo_url: str | None) -> str | None:
    if not photo_url:
        return None
    marker = f"{PHOTO_BUCKET}/"
    if marker in photo_url:
        return photo_url.split(marker, 1)[1]
    return None


async def delete_photo(
    staff_id: UUID,
    *,
    staff: StaffContext,
    conn=None,
    storage=None,
) -> None:
    """사진 칸을 비우고 저장소의 파일도 지운다(STAFF-PROFILE-07 — 회색 원으로 돌아간다)."""
    bucket = storage or _default_bucket()

    async def _run(c):
        row = await _assert_doctor(c, staff_id)
        path = _object_path(row.get("photo_url"))
        await c.execute("update staff set photo_url = null where id = $1", staff_id)
        return path

    if conn is not None:
        path = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            path = await _run(c)

    if path:
        bucket.remove([path])
