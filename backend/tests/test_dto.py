"""[MASK-SRV-01] 마스킹 경계 — 환자가 섞인 응답은 이 함수를 통과해야만 만들어진다.

⭐ 화이트리스트로 필드를 고른다: 원본 name·phone·birth_date는 마스킹된 값으로 소비되고
   응답에는 아예 실리지 않는다. 옛 계획의 raw `patient_name` 사고는 "여기선 안 가려도
   되겠지"가 아니라 **가리는 지점이 정해져 있지 않아서** 났다.
"""
import datetime

import pytest

from app.core.dto import mask_name, patient_row_dto


def test_마스크_네임_가운데를_가린다():
    assert mask_name("홍길동") == "홍*동"


def test_마스크_네임_두_글자는_뒤만_가린다():
    assert mask_name("김철") == "김*"


def test_피티_로우_원본_필드는_응답에_없다():
    row = patient_row_dto(patient_id="p1", name="홍길동", phone="01012345678",
                          birth_date=datetime.date(1985, 3, 1))
    assert not ({"name", "patient_name", "phone", "birth_date"} & set(row))


def test_피티_로우_마스킹된_값만_담는다():
    row = patient_row_dto(patient_id="p1", name="홍길동", phone="01012345678",
                          birth_date=datetime.date(1985, 3, 1))
    assert row["masked_name"] == "홍*동"


def test_피티_로우_전화는_뒤_4자리만_남긴다():
    row = patient_row_dto(patient_id="p1", phone="01012345678")
    assert row["masked_phone"] == "010-****-5678"


def test_피티_로우_생일은_월만_가린다():
    row = patient_row_dto(patient_id="p1", birth_date=datetime.date(1985, 3, 1))
    assert row["masked_birth_date"] == "1985-**-01"


def test_피티_로우_환자_식별자는_행_이동용으로_남긴다():
    assert patient_row_dto(patient_id="p1")["patient_id"] == "p1"


def test_피티_로우_안전한_부가_필드는_그대로_통과한다():
    row = patient_row_dto(patient_id="p1", queue_no=3, status="진료대기")
    assert row["queue_no"] == 3 and row["status"] == "진료대기"


def test_피티_로우_원본_필드를_부가로_밀어넣으면_거절한다():
    """구조적 방어: 옛 버그 필드 patient_name을 부가 필드로 우회해 넣으려는 시도를 막는다."""
    with pytest.raises(ValueError, match="마스킹"):
        patient_row_dto(patient_id="p1", patient_name="홍길동")
