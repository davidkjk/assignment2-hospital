from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as
from app.services import staff_profile, staff_service

router = APIRouter(prefix="/staff", tags=["staff"])


def _normalize_origin(value: str | None) -> str | None:
    """http(s) origin(스킴+호스트[:포트])만 통과시키고, 경로·자격증명이 붙었으면 버린다."""
    candidate = (value or "").strip().rstrip("/")
    if not candidate:
        return None
    try:
        parsed = urlsplit(candidate)
        _ = parsed.port  # 잘못된 포트 표기를 ValueError로 거른다.
    except ValueError:
        return None
    if (
        parsed.scheme in {"http", "https"}
        and parsed.hostname is not None
        and parsed.username is None
        and parsed.password is None
        and candidate == f"{parsed.scheme}://{parsed.netloc}"
    ):
        return candidate
    return None


def _invite_redirect_origin(request: Request) -> str | None:
    """초대 수락 링크가 되돌아올 직원웹 origin.

    비밀번호 재설정(auth_staff._password_recovery_redirect)은 '비로그인' 요청이라 서버 고정
    origin(STAFF_WEB_ORIGIN)만 신뢰하지만, 초대는 admin 인증 + Bearer 토큰(쿠키 아님 → CSRF
    불가) 요청이라 브라우저가 보낸 실제 origin을 신뢰해도 안전하다. 이렇게 하면 preview·main·
    실도메인 어디서 초대하든 그 화면 주소로 링크가 가고(설정 변경 0회), Supabase의 Redirect URLs
    허용목록(와일드카드)이 최종 방어선이 된다. 헤더가 없으면 서버 설정으로 폴백한다.
    """
    origin = _normalize_origin(request.headers.get("origin"))
    if origin is None:
        referer = request.headers.get("referer")
        if referer:
            parsed = urlsplit(referer)
            if parsed.scheme and parsed.netloc:
                origin = _normalize_origin(f"{parsed.scheme}://{parsed.netloc}")
    if origin is None:
        origin = _normalize_origin(settings.staff_web_origin)
    return origin


# 초대 수락 링크가 착지할 화면 — 여기서 초대받은 직원이 최초 비밀번호를 설정한다.
# (프론트 라우트 /reset-password/new: 복구·초대 공용 '비밀번호 설정' 화면)
_INVITE_ACCEPT_PATH = "/reset-password/new"


def _invite_accept_url(request: Request, *, welcome: bool = False) -> str | None:
    """초대 수락 링크. welcome=True면 착지 화면이 초대(환영) 문구를 쓰도록 ?welcome=1을 붙인다.

    재초대는 reset_password_for_email(복구 메일)이라 링크의 type=recovery로 와, 이 표식이 없으면
    화면이 '비밀번호 재설정'으로 보인다. 최초 초대와 같은 '환영합니다(최초 설정)'로 통일하기 위한
    표식(사용자 결정 2026-09-07). 최초 초대는 type=invite라 표식 없이도 초대 문구가 뜬다."""
    origin = _invite_redirect_origin(request)
    if not origin:
        return None
    url = f"{origin}{_INVITE_ACCEPT_PATH}"
    return f"{url}?welcome=1" if welcome else url


class InviteStaffRequest(BaseModel):
    email: str
    name: str
    role: str
    department_id: UUID | None = None


class InviteStaffResponse(BaseModel):
    staff_id: UUID
    # 관리자가 초대받는 직원에게 직접 전달할 '비밀번호 설정' 링크. 발신 도메인 미검증이라 메일을
    # 자동 발송하지 않고(2026-09-07), 화면이 이 링크를 복사 버튼으로 띄운다. 드물게 링크를 만들지
    # 못한 경우(고아 복구 실패) None — 화면은 [재초대]로 안내한다.
    invite_link: str | None = None


class UpdateProfileRequest(BaseModel):
    specialty: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    calendar_color_index: int | None = None


class DeactivateRequest(BaseModel):
    impact_version: str | None = None


@router.post("", response_model=InviteStaffResponse)
async def invite_staff(
    body: InviteStaffRequest,
    request: Request,
    staff: StaffContext = Depends(require_role("admin")),
) -> InviteStaffResponse:
    result = await staff_service.invite_staff(
        email=body.email, name=body.name, role=body.role, department_id=body.department_id, invited_by=staff,
        redirect_to=_invite_accept_url(request),
    )
    return InviteStaffResponse(staff_id=result.staff_id, invite_link=result.invite_link)


@router.patch("/{staff_id}/deactivate")
async def deactivate_staff(
    staff_id: UUID,
    body: DeactivateRequest | None = None,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    impact_version = body.impact_version if body is not None else None
    await staff_service.deactivate_staff(staff_id, deactivated_by=staff, impact_version=impact_version)
    return {"status": "deactivated"}


@router.get("/{staff_id}/deactivation-impact")
async def get_deactivation_impact(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-DEACT-04] 중지 확정 전 미리보기 — 건수·날짜·시각만(이름·전화 없음)."""
    async with acquire_as(str(staff.auth_user_id)) as conn:
        return await staff_service.get_deactivation_impact(conn, staff_id)


@router.patch("/{staff_id}/profile")
async def update_profile(
    staff_id: UUID,
    body: UpdateProfileRequest,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-PROFILE-04] 전달된 칸만 갱신한다(부분 저장).

    ⚠️ 안 보낸 칸은 **서비스의** `_UNSET`으로 채워져야 한다 — 라우터가 따로 만든 센티널을
    넘기면 서비스의 `is not _UNSET` 검사가 그걸 못 알아보고 SQL 인자에 그대로 실어 500이 났다.
    그래서 여기서는 보낸 칸만 `**fields`로 넘겨, 없는 칸은 서비스 기본값(`_UNSET`)이 채우게 둔다.
    """
    fields = body.model_dump(exclude_unset=True)
    await staff_profile.update_doctor_profile(staff_id, staff=staff, **fields)
    return {"status": "updated"}


@router.post("/{staff_id}/photo")
async def upload_photo(
    staff_id: UUID,
    file: UploadFile = File(...),
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-PROFILE-06] 사진을 Storage에 올리고 공개 URL을 돌려준다."""
    data = await file.read()
    photo_url = await staff_profile.upload_photo(
        staff_id,
        filename=file.filename or "photo",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        staff=staff,
    )
    return {"photo_url": photo_url}


@router.delete("/{staff_id}/photo")
async def delete_photo(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-PROFILE-07] 사진 칸을 비우고 저장소의 파일도 지운다."""
    await staff_profile.delete_photo(staff_id, staff=staff)
    return {"status": "deleted"}


@router.get("")
async def get_staff_list(
    staff: StaffContext = Depends(require_role("admin")),
) -> list[dict]:
    """[정합성 검토 R3-04] `/admin/staff` 화면의 직원 목록."""
    return await staff_service.list_staff(staff)


@router.post("/{staff_id}/resend-invite")
async def resend_invite(
    staff_id: UUID,
    request: Request,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[정합성 검토 R3-04][STAFF-REINVITE-LINK-01] 재초대 — 메일을 자동 발송하지 않고(발신 도메인
    미검증) 관리자가 직접 전달할 링크를 돌려준다(2026-09-07 후속 결정). welcome=True → 착지 화면이
    최초 초대와 같은 「환영합니다」(STAFF-REINVITE-COPY-01)."""
    link = await staff_service.resend_invite(
        staff_id, requested_by=staff, redirect_to=_invite_accept_url(request, welcome=True)
    )
    return {"status": "resent", "link": link}


@router.post("/{staff_id}/reset-password")
async def reset_staff_password(
    staff_id: UUID,
    request: Request,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-RESET-PW-01][STAFF-RESETPW-LINK-01] 이미 들어온(활성) 직원이 비밀번호를 잊었을 때
    관리자가 재설정 링크를 발급한다(사용자 결정 2026-09-07, #26 확장 — 셀프 재설정만이 아니라 관리자
    발급도 허용). 재초대와 같은 generate_link(type=recovery)를 쓰되 welcome 표식을 붙이지 않아 착지
    화면은 「새 비밀번호 만들기」(재설정 문구)로 뜬다. 메일을 자동 발송하지 않고(발신 도메인 미검증)
    링크를 돌려준다 — 화면이 '링크 복사'로 노출하면 관리자가 직접 전달한다. 관리자는 비번을 보지
    않는다 — 링크만 전달하고 새 비번은 직원이 스스로 만든다(요구사항 451과 상충 안 함)."""
    link = await staff_service.resend_invite(
        staff_id, requested_by=staff, redirect_to=_invite_accept_url(request)
    )
    return {"status": "sent", "link": link}


@router.delete("/{staff_id}")
async def delete_staff(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-DELETE-01] 잘못 초대한 미수락 계정을 되돌린다(삭제). 미수락 + 딸린 데이터 없음일
    때만 성공 — 서비스가 가드한다(사용자 결정 2026-09-07)."""
    await staff_service.delete_staff(staff_id, requested_by=staff)
    return {"status": "deleted"}
