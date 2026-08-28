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


def test_피티_로우_원본_전화_생년월일은_응답에_없다():
    """[요구사항 :81] 가리라고 한 것은 **전화번호와 생년월일** 둘이다 — 원본 키가 아예 없어야 한다."""
    row = patient_row_dto(patient_id="p1", name="홍길동", phone="01012345678",
                          birth_date=datetime.date(1985, 3, 1))
    assert not ({"patient_name", "phone", "birth_date"} & set(row))


def test_피티_로우_이름은_실명으로_담는다():
    """[SEARCH-RESULT-09][DOCTOR-QUEUE-02] 「이름 · 생년월일(마스킹) · 전화번호(마스킹)」 —

    이름엔 마스킹이 붙지 않는다. 창구 직원이 「황*은 님」을 부를 수는 없다.
    """
    row = patient_row_dto(patient_id="p1", name="홍길동", phone="01012345678",
                          birth_date=datetime.date(1985, 3, 1))
    assert row["name"] == "홍길동"
    assert "masked_name" not in row


def test_피티_로우_통계_드릴다운만_이름을_가린다():
    """[STAT-DRILL-02] 결정 #24 — 관리자 훑어보기 명단 하나만 예외다."""
    row = patient_row_dto(patient_id="p1", name="홍길동", phone="01012345678",
                          birth_date=datetime.date(1985, 3, 1), mask_name_too=True)
    assert row["masked_name"] == "홍*동"
    assert "name" not in row


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
