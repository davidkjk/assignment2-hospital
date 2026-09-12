"""[MASK-TEL-01][MASK-DOB-01][MASK-SRV-01] 공용 마스킹 유틸 (정합성 검토 R5-06).

⭐ 목록류 API는 전부 이것만 쓴다. 마스킹은 DTO를 만드는 곳(서비스)에서 한 번만 한다 —
   서비스가 원본을 반환하고 라우터가 가리는 구조로 두면, 새 목록 API를 만들 때마다 가리는
   것을 잊는다(그리고 잊은 것은 티가 안 난다).

마스킹의 목적은 「못 보게」가 아니라 「보려면 흔적이 남게」다. 그래서 사람을 구분하는 데
꼭 필요한 자리는 남긴다 — 전화 뒷 4자리(동명이인)·생년월일 연도(나이)와 일(동명이인).
"""
import re
from datetime import date


def mask_phone(phone: str) -> str:
    """중간 자리를 가리고 앞 3자리·뒤 4자리를 남긴다.

    ⚠️ 뒤에서부터 4자리를 남기는 것이 핵심이다 — 앞에서 3-4-4로 자르면 길이가 다른
       번호(서울 유선 9~10자리 등)에서 가려야 할 자리를 그대로 내보낸다.
    """
    digits = re.sub(r"\D", "", phone)
    if len(digits) <= 4:
        return "*" * len(digits)
    prefix = digits[:3]
    last4 = digits[-4:]
    middle = digits[3:-4]
    return f"{prefix}-{'*' * len(middle)}-{last4}"


def mask_birth_date(birth_date: date) -> str:
    """월만 가린다 — 연도로 나이를, 일로 동명이인을 구분할 수 있게 남긴다.

    ⚠️ 문자열 치환(`str(d).replace(month, '**')`)으로 짜지 않는다 — 월과 일이 같은 날
       (1958-03-03 등)에서 일자까지 함께 지워 동명이인 구분이 깨진다.
    """
    return f"{birth_date.year:04d}-**-{birth_date.day:02d}"
