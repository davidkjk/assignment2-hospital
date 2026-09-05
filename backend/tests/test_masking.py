"""[MASK-TEL-01][MASK-DOB-01][MASK-SRV-01] 마스킹 유틸 — 목록류 API가 전부 이것만 쓴다.

마스킹의 목적은 「못 보게」가 아니라 「보려면 흔적이 남게」다(요구사항 3.1 :81·:82).
여기서는 그 「가리기」의 형식만 검증한다 — 뒷자리(동명이인)·연도(나이)·일(동명이인)은
남기고 가운데·월만 가린다.
"""
import random
from datetime import date, timedelta

from app.core.masking import mask_birth_date, mask_phone


def test_전화번호는_중간_네_자리를_가린다():
    """[MASK-TEL-01] 뒷자리를 남긴다 — 한국에서 사람을 구분할 때 실제로 묻는 것이 뒷번호다."""
    assert mask_phone("01012345678") == "010-****-5678"


def test_생년월일은_월만_가린다():
    """[MASK-DOB-01] 연도로 나이를, 일로 동명이인을 구분할 수 있게 남긴다."""
    assert mask_birth_date(date(1958, 3, 12)) == "1958-**-12"


# ⭐⭐ 여기부터 속성 테스트 — 예시 하나로는 못 보는 것을 본다.
#    마스킹은 「글자를 잘라 형식을 맞추는 코드」라 입력이 무한히 많다(휴대폰 11자리 ·
#    서울 유선 9~10자리가 섞인다). 사람이 예시를 다 적을 수 없으므로 성질로 확인한다.
#    확인하는 것은 「보기 좋은가」가 아니라 「가려야 할 것이 절대 안 새는가」다.


def test_전화번호_마스킹은_어떤_번호에서도_가운데를_흘리지_않는다():
    """[MASK-TEL-01][MASK-SRV-01] 길이가 다른 번호 1만 개로 구조 성질을 확인한다.

    앞에서 3-4-4로 자르는 구현은 서울 번호에서 가려야 할 자리를 그대로 내보낸다 —
    그런데 화면에는 그럴듯해 보인다. 그래서 가운데가 「전부 별표인지」를 직접 본다.

    ⚠️ 플랜 예시의 `hidden not in masked` 부분일치 검사는 가운데 4자리가 우연히 뒤 4자리와
       같아지면(1만 회 중 기대 ~1회) 어떤 올바른 구현에서도 오탐으로 실패한다.
       그래서 부분일치 대신 「가운데 구간에 별표만 있다」는 구조를 못 박는다 — 오탐 없이
       한 자리도 안 새는 것을 보장한다.
    """
    for _ in range(10000):
        digits = random.choice(["010", "011", "02", "031", "064"]) + "".join(
            random.choice("0123456789") for _ in range(random.choice([7, 8]))
        )
        masked = mask_phone(digits)
        bare = masked.replace("-", "")

        assert bare.endswith(digits[-4:]), (digits, masked)      # ① 뒷 4자리 보존(동명이인)
        assert "*" in masked, (digits, masked)                   # ② 마스킹이 실제로 걸렸다
        assert bare[:3] == digits[:3], (digits, masked)          # ③ 앞 3자리만 남는다
        assert set(bare[3:-4]) == {"*"}, (digits, masked)        # ④ 가운데는 전부 별표 — 안 샌다
        assert len(bare) == len(digits), (digits, masked)        # ⑤ 자릿수 보존(모양 유지)


def test_생년월일_마스킹은_일자를_월로_착각해_지우지_않는다():
    """[MASK-DOB-01] 1900~2025년 전체 날짜로 확인한다.

    ⚠️ 월과 일이 같은 날이 함정이다 — `1958-03-03`에서 문자열 치환으로 짠 구현은 `03`을
       두 번 다 지워 `1958-**-**`을 만든다. 예시의 3월 12일로는 안 걸리고, 걸리는 날은
       1년에 12일뿐이라 운영 중에도 드물게 터진다. 그날 태어난 환자는 동명이인 구분이
       안 된다. 그래서 전체 문자열을 못 박아 일자 훼손을 잡는다.
    """
    for _ in range(10000):
        d = date(1900, 1, 1) + timedelta(days=random.randrange(46000))
        masked = mask_birth_date(d)

        assert masked == f"{d.year:04d}-**-{d.day:02d}", d      # 연·일 보존, 월만 별표
        assert masked[5:7] == "**", d                           # 월 자리만 가려진다
