from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.errors import AppError
from app.core.security import StaffContext, require_role
from app.services import doctor_phrases

router = APIRouter(prefix="/doctor/quick-phrases", tags=["doctor-phrases"])


class PhraseRequest(BaseModel):
    text: str = Field(min_length=1)
    # Kept as an optional compatibility field for older clients.  The server
    # always uses the authenticated doctor's id instead of trusting it.
    doctor_id: UUID | None = None


class PhraseResponse(BaseModel):
    id: UUID
    text: str


@router.get("", response_model=list[PhraseResponse])
async def list_quick_phrases(
    doctor_id: UUID | None = None,
    staff: StaffContext = Depends(require_role("receptionist", "doctor", "admin")),
) -> list[PhraseResponse]:
    # Doctors always get their own list, even if a caller tampers with the
    # optional query parameter.  Other active staff may read a specified
    # doctor's phrases under the existing read policy.
    if staff.role == "doctor":
        target_id = staff.id
    elif doctor_id is None:
        raise AppError("조회할 의사를 지정해 주세요.", status_code=400)
    else:
        target_id = doctor_id
    phrases = await doctor_phrases.list_phrases(target_id, staff)
    return [PhraseResponse(**phrase) for phrase in phrases]


@router.post("", response_model=PhraseResponse)
async def add_quick_phrase(
    body: PhraseRequest,
    staff: StaffContext = Depends(require_role("doctor")),
) -> PhraseResponse:
    if body.doctor_id is not None and body.doctor_id != staff.id:
        raise AppError("본인 문구만 관리할 수 있습니다.", status_code=403)
    phrase_id = await doctor_phrases.add_phrase(doctor=staff, text=body.text, staff=staff)
    return PhraseResponse(id=phrase_id, text=body.text)


@router.put("/{phrase_id}", response_model=PhraseResponse)
async def update_quick_phrase(
    phrase_id: UUID,
    body: PhraseRequest,
    staff: StaffContext = Depends(require_role("doctor")),
) -> PhraseResponse:
    phrase = await doctor_phrases.update_phrase(phrase_id, body.text, staff=staff)
    return PhraseResponse(**phrase)


@router.delete("/{phrase_id}")
async def delete_quick_phrase(
    phrase_id: UUID,
    staff: StaffContext = Depends(require_role("doctor")),
) -> dict:
    await doctor_phrases.delete_phrase(phrase_id, staff=staff)
    return {"status": "deleted"}
