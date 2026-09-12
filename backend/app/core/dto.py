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

    ⚠️ **목록 화면은 이것을 쓰지 않는다.** 요구사항(`고객요구사항.txt:81`)이 가리라고 한 것은
       **전화번호와 생년월일 둘뿐**이고, `SEARCH-RESULT-09`·`DOCTOR-QUEUE-02`·`MERGE-LIST-03`은
       모두 「이름 · 생년월일(마스킹) · 전화번호(마스킹)」로 **이름을 실명**으로 못박았다.
       쓰는 곳은 **관리자 통계 드릴다운 명단 하나뿐**이다(`STAT-DRILL-02`, 결정 #24).
       ⭐ 2026-08-28 이전에는 모든 목록에 걸려 있어 창구 직원이 「황*은 님」을 부를 수 없었다.

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
    mask_name_too: bool = False,
    **safe_extra,
) -> dict:
    """환자 식별자 + 표시값 + 안전한 부가 필드만 담은 한 행을 만든다.

    - `patient_id`는 행→환자상세 이동용으로 항상 남긴다(결정24).
    - phone·birth_date는 **항상** masked_* 로만 실린다(원본 키는 없다) — 요구사항 :81.
    - ⭐ **이름은 기본이 실명(`name`)이다.** 요구사항이 가리라고 한 것에 이름은 없고, 창구
      직원이 이름을 부르지 못하면 접수가 안 된다. `mask_name_too=True`를 준 곳만 `masked_name`
      (`홍*동`)으로 나간다 — 지금은 **관리자 통계 드릴다운 하나뿐**(`STAT-DRILL-02`, 결정 #24).
    - `safe_extra`는 환자 원본이 아닌 값(queue_no·status·occurred_at 등)만 허용한다.
    """
    forbidden = _FORBIDDEN_EXTRA & set(safe_extra)
    if forbidden:
        raise ValueError(
            f"환자 원본 필드({', '.join(sorted(forbidden))})는 마스킹 없이 담을 수 없습니다."
        )

    row: dict = {"patient_id": patient_id}
    if name is not None:
        if mask_name_too:
            row["masked_name"] = mask_name(name)
        else:
            row["name"] = name
    if phone is not None:
        row["masked_phone"] = mask_phone(phone)
    if birth_date is not None:
        row["masked_birth_date"] = mask_birth_date(birth_date)
    row.update(safe_extra)
    return row
