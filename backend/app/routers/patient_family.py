from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import family_link_otp_service, patient_family_service

router = APIRouter(prefix="/family", tags=["patient-family"])


class AddFamilyRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    relation: str
    phone: str | None = None


class UpdateFamilyRequest(BaseModel):
    # FAM-EDIT-01 — 「그 사람의 정보」(신원)와 「나와의 관계」는 다른 창구다. 본문에 온 것만 고친다.
    name: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    relation: str | None = None


@router.get("")
async def list_family(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_family_service.list_family_members(patient)


@router.post("")
async def add_family(body: AddFamilyRequest,
                     patient: PatientContext = Depends(get_current_patient)) -> dict:
    fid = await patient_family_service.add_family_member(
        patient, body.name, body.birth_date, body.gender, body.relation, body.phone)
    return {"family_patient_id": fid}


@router.patch("/{family_patient_id}")
async def update_family(family_patient_id: UUID, body: UpdateFamilyRequest,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    # FAM-EDIT-01 — 신원(name·birth_date·gender)이 오면 신원 창구(판정 통과해야 열림),
    #               relation이 오면 관계 창구(항상 열림). 한 함수가 둘을 하지 않는다.
    if body.name is not None or body.birth_date is not None or body.gender is not None:
        await patient_family_service.update_family_identity(
            patient, family_patient_id, body.name, body.birth_date, body.gender)
    if body.relation is not None:
        await patient_family_service.update_family_relation(patient, family_patient_id, body.relation)
    return {"status": "updated"}


@router.delete("/{family_patient_id}")
async def unlink_family(family_patient_id: UUID,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_family_service.unlink_family_member(patient, family_patient_id)
    return {"status": "unlinked"}


# ── ㉯ 기존 환자 가족 연결(본인확인 OTP) — family_link_otp_service ────────────────
class FamilyLinkRequestIn(BaseModel):
    name: str
    birth_date: date
    phone: str
    relation: str                       # FAM-LINK-02 — '가족(연결)' 하드코딩을 버린다


class FamilyLinkConfirmIn(BaseModel):
    request_id: UUID
    code: str


@router.post("/link/request")
async def request_family_link(body: FamilyLinkRequestIn,
                              patient: PatientContext = Depends(get_current_patient)) -> dict:
    # ⭐ 이 엔드포인트는 「보냈다」만 답한다 — 찾았는지 여부를 응답으로 만들지 않는다(갭 #58).
    request_id = await family_link_otp_service.request_family_link_otp(
        patient, name=body.name, birth_date=body.birth_date,
        phone=body.phone, relation=body.relation)
    return {"request_id": str(request_id)}


@router.post("/link/confirm")
async def confirm_family_link(body: FamilyLinkConfirmIn,
                              patient: PatientContext = Depends(get_current_patient)) -> dict:
    family_patient_id = await family_link_otp_service.confirm_family_link_otp(
        patient, body.request_id, body.code)
    return {"family_patient_id": str(family_patient_id)}
