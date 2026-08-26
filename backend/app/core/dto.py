"""[MASK-SRV-01] 마스킹 경계 — 환자가 섞인 목록/명단 응답은 여기를 반드시 통과한다.

⭐ `patient_row_dto`는 화이트리스트다. 원본 name·phone·birth_date는 **명명된 인자로만**
   받아 마스킹된 값으로 소비하고, 응답 dict에는 원본 키를 절대 넣지 않는다. 새 컬럼을
   `select *`로 끌어와 `**record`로 넘겨도, name/phone/birth_date는 마스킹으로 흡수되고
   그 밖의 알려진 원본 필드명(`patient_name` 등)은 거절된다.

   옛 계획의 raw `patient_name` 사고는 규율("가리는 걸 잊지 말자")이 아니라 **구조**
   (가리는 지점이 하나로 정해져 있지 않았다)에서 났다 — 그 지점을 여기로 못 박는다.
"""
from datetime import date

from app.core.masking import mask_birth_date, mask_phone

# safe_extra로 우회해 들어오면 안 되는 원본 필드명(구조적 차단).
# name·phone·birth_date는 명명된 인자라 애초에 safe_extra에 닿지 않는다.
_FORBIDDEN_EXTRA = {"patient_name", "name", "phone", "birth_date"}


def mask_name(name: str) -> str:
    """가운데를 가린다 — 홍길동 → 홍*동, 김철 → 김*.

    한 글자 이하는 그대로 둔다(가릴 자리가 없다). 두 글자는 뒤만, 세 글자 이상은
    첫·끝만 남기고 가운데를 별표로 채운다.
    """
    if len(name) <= 1:
        return name
    if len(name) == 2:
        return name[0] + "*"
    return name[0] + "*" * (len(name) - 2) + name[-1]


def patient_row_dto(
    *,
    patient_id,
    name: str | None = None,
    phone: str | None = None,
    birth_date: date | None = None,
    **safe_extra,
) -> dict:
    """환자 식별자 + 마스킹된 표시값 + 안전한 부가 필드만 담은 한 행을 만든다.

    - `patient_id`는 행→환자상세 이동용으로 항상 남긴다(결정24).
    - name·phone·birth_date가 주어지면 masked_* 로만 실린다(원본 키는 없다).
    - `safe_extra`는 환자 원본이 아닌 값(queue_no·status·occurred_at 등)만 허용한다.
    """
    forbidden = _FORBIDDEN_EXTRA & set(safe_extra)
    if forbidden:
        raise ValueError(
            f"환자 원본 필드({', '.join(sorted(forbidden))})는 마스킹 없이 담을 수 없습니다."
        )

    row: dict = {"patient_id": patient_id}
    if name is not None:
        row["masked_name"] = mask_name(name)
    if phone is not None:
        row["masked_phone"] = mask_phone(phone)
    if birth_date is not None:
        row["masked_birth_date"] = mask_birth_date(birth_date)
    row.update(safe_extra)
    return row
