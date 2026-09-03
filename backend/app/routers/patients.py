"""[MASK-*][SEARCH-LOG-*][ROLE-READ] patients 라우터 — 마스킹 목록 · 상세 · 번호 펼치기.

⚠️ 코디 배선 필요: main.py에 `app.include_router(patients.router)` 등록해야 노출된다.
   이 태스크는 main.py를 손대지 않는다(공용 파일).

접근 범위: 목록·상세·번호 펼치기 모두 접수직원·관리자만(patients RLS의
receptionist_admin_can_read_patients와 일치). 의사의 조회 범위는 자기 예약이라
환자 목록 전체 창구는 열지 않는다(ROLE-DOC-02).
"""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.dto import patient_row_dto
from app.core.security import StaffContext, require_role
from app.services import patient_service, staff_phone_change_service

router = APIRouter(prefix="/patients", tags=["patients"])


class RegisterPatientRequest(BaseModel):
    # [SHELL-DOOR-03] 등록 문의 신원 폼 — 이름·성별·생년월일·전화. 검색칸·담당의사는 폼에서 뺀다.
    name: str
    gender: str
    birth_date: date
    phone: str


class RegisterPatientResponse(BaseModel):
    patient_id: UUID


class DuplicateCheckResponse(BaseModel):
    # [SHELL-DOOR-03] "혹시 이분?" — 후보 id + 표시값, 없으면 전부 null. ⛔ 막지 않는다(등록 게이트가 아니다).
    # ⭐ 이름은 실명이다(요구사항 :81은 전화·생년월일만 가리라고 한다). 원본 birth_date·phone은 안 담는다.
    patient_id: UUID | None = None
    name: str | None = None
    masked_birth_date: str | None = None


class FamilyLinkRequest(BaseModel):
    family_patient_id: UUID
    relation: str
    method: str


class FamilyUnlinkRequest(BaseModel):
    reason: str


class PhoneChangeRequestBody(BaseModel):
    # [PTDET-ACTION-02] 새 전화번호. 서버가 이 번호로 인증번호를 보낸다(㉯ 소유 증명).
    new_phone: str


class PhoneChangeConfirmBody(BaseModel):
    # [PTDET-ACTION-02] 확인은 (patient_id, new_phone)로 요청을 찾는다 — 화면이 request_id를 들지 않는다.
    new_phone: str
    code: str


@router.get("")
async def list_patients(
    q: str | None = None,
    cursor: str | None = None,
    staff: StaffContext = Depends(require_role("receptionist", "admin", "doctor")),
) -> dict:
    """[MASK-SRV-01][SEARCH-*] 검색 결과(마스킹) + 다음 페이지 커서 + 검색 기록.

    ⭐ 마스킹 경계는 여기다 — 서비스는 정렬을 위해 원본을 담은 줄을 주고, HTTP로 나가는
       이 지점에서 patient_row_dto가 masked_* 로만 옮긴다(원본 키는 응답에 없다). 줄마다
       matched(왜 걸렸는지)·오늘 상태·오늘 예약 시각을 함께 실어 24b가 그대로 소비한다.
    """
    page = await patient_service.search_patients(q, staff, cursor=cursor)
    return {
        "rows": [
            patient_row_dto(
                patient_id=row["id"],
                name=row["name"],
                phone=row["phone"],
                birth_date=row["birth_date"],
                gender=row["gender"],
                matched=row["matched"],
                today_status=row["today_status"],
                today_appointment_time=row["today_appointment_time"],
                today_department_name=row["today_department_name"],
                today_doctor_name=row["today_doctor_name"],
            )
            for row in page.rows
        ],
        "next_cursor": page.next_cursor,
        "has_more": page.has_more,
    }


@router.post("", status_code=201, response_model=RegisterPatientResponse)
async def register_patient(
    body: RegisterPatientRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> RegisterPatientResponse:
    """[SHELL-DOOR-03][ROLE-READ] 신원 폼으로 환자를 등록한다 — 접수직원·관리자만.

    소프트 중복은 등록을 막지 않는다(개인정보 열거 방지, 「막다른 길 금지」). "혹시 이분?"은
    duplicate-check가 화면에 힌트를 줄 뿐, 이 창구는 겹침 여부와 무관하게 등록을 진행시킨다.
    """
    patient_id = await patient_service.register_patient(
        name=body.name,
        birth_date=body.birth_date,
        gender=body.gender,
        phone=body.phone,
        staff=staff,
    )
    return RegisterPatientResponse(patient_id=patient_id)


@router.get("/duplicate-check", response_model=DuplicateCheckResponse)
async def duplicate_check(
    phone: str,
    birth_date: date,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> DuplicateCheckResponse:
    """[SHELL-DOOR-03] 소프트 중복 — 전화·생일이 강하게 겹치는 기존 기록의 id(또는 null).

    ⚠️ 라우트 순서: 이 경로는 반드시 `/{patient_id}`(UUID)보다 **먼저** 선언해야 한다.
       뒤에 두면 FastAPI가 "duplicate-check"를 patient_id로 파싱하려다 422를 낸다.
    ⛔ 막지 않는다 — 후보를 알려줄 뿐 등록을 거부하지 않는다(개인정보 열거 방지·막다른 길 금지).
    """
    row = await patient_service.find_by_phone_and_birthdate(phone, birth_date, staff)
    if row is None:
        return DuplicateCheckResponse()
    # 마스킹 경계는 여기다 — 서비스가 준 원본 줄을 화이트리스트 DTO로 옮겨 가린 값만 남긴다.
    dto = patient_row_dto(
        patient_id=row["id"], name=row["name"], birth_date=row["birth_date"]
    )
    return DuplicateCheckResponse(**dto)


@router.get("/{patient_id}")
async def get_patient(
    patient_id: UUID,
    staff: StaffContext = Depends(require_role("receptionist", "admin", "doctor")),
) -> dict:
    """[MASK-DETAIL-01] 상세(전체) + 진입 기록.

    [SHELL-NAV-03][ROLE-DOC-02] 의사도 사이드바 「환자 검색」→ 상세로 온다. RLS
    `doctor_can_read_scoped_patients`가 본인 담당 환자로 스코프하고, 아니면 404(열거 안전).
    """
    return await patient_service.get_patient_detail(patient_id, staff)


@router.get("/{patient_id}/contact")
async def reveal_contact(
    patient_id: UUID,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[MASK-VIEW-01·02·03] 번호 펼치기 창구(갭 #35) + 열람 기록."""
    return await patient_service.reveal_contact(patient_id, staff)


@router.post("/{patient_id}/family")
async def link_family(
    patient_id: UUID,
    body: FamilyLinkRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[R5-01][PTDET-FAMILY-04·05][ROLE-DOC-02] 가족 연결 저장 창구 — 접수·관리자만.

    의사는 이 창구를 열 수 없다(가족 연결은 접수·관리자의 일, 요구사항 3.5·4.2).
    """
    link_id = await patient_service.link_family_member(
        patient_id, body.family_patient_id, body.relation, body.method, staff
    )
    return {"id": link_id}


@router.delete("/{patient_id}/family/{member_id}")
async def unlink_family(
    patient_id: UUID,
    member_id: UUID,
    body: FamilyUnlinkRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[R5-02][ROLE-DOC-02] 가족 연결 해제 — 접수·관리자만. 사유·실행자를 남긴다."""
    await patient_service.unlink_family_member(patient_id, member_id, body.reason, staff)
    return {"ok": True}


@router.post("/{patient_id}/phone-change/request")
async def phone_change_request(
    patient_id: UUID,
    body: PhoneChangeRequestBody,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[PTDET-ACTION-02][갭 #19·결정 #4 ㉯] 새 번호로 인증번호를 보낸다 — 접수·관리자만.

    의사는 이 창구를 열 수 없다(전화번호 변경은 접수·관리자의 일, ROLE-DOC-02).
    새 번호 OTP 소유 증명이 있어야 바꾼다 — 직접 저장(㉮)은 계정 탈취로 기각(결정 #4).
    """
    await staff_phone_change_service.request_phone_change(staff, patient_id, body.new_phone)
    return {"ok": True}


@router.post("/{patient_id}/phone-change/confirm")
async def phone_change_confirm(
    patient_id: UUID,
    body: PhoneChangeConfirmBody,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[PTDET-ACTION-02·03][결정 #4 ⓑ] 인증번호가 맞으면 patients.phone + Auth를 함께 바꾼다.

    실패하면 기존 번호가 산다(ACTION-03) — 성공 응답을 흉내 내지 않는다.
    """
    await staff_phone_change_service.confirm_phone_change(
        staff, patient_id, body.new_phone, body.code)
    return {"ok": True}
