"""[HIST-LIST-15~19][SEARCH-ORDER-04·05][MHIST-LIST-03] 공용 이어받기 부품 계약.

여덟 화면(Task 15·24·26·28 등)이 이 부품 하나를 믿고 쓴다 — 커서 규칙이 여러 벌이 되면
하나만 정렬 키가 달라도 그 화면에서만 "같은 사람이 두 번 나오거나 아예 안 나온다".
"""
import pytest

from app.core.pagination import encode_cursor, paginate

FIXED = "2026-08-01T09:00:00"


def rows_of(n):
    # id는 0..n-1, at은 동일값(정렬은 id 기본키로만 결정됨을 드러낸다)
    return [{"id": i, "at": FIXED} for i in range(n)]


def shuffled(seq):
    seq = list(seq)
    # 결정적 뒤섞기(테스트 재현성): 역순으로 두면 "정렬 안 하면 순서가 다르다"가 드러난다
    return list(reversed(seq))


def test_히스트_15_한_번에_20건을_준다():
    page = paginate(rows_of(50), cursor=None)
    assert len(page.rows) == 20 and page.has_more is True


def test_히스트_16_커서로_이어받으면_겹치지도_빠지지도_않는다():
    first = paginate(rows_of(50), cursor=None)
    second = paginate(rows_of(50), cursor=first.next_cursor)
    ids = [r["id"] for r in first.rows] + [r["id"] for r in second.rows]
    assert len(ids) == len(set(ids)) == 40  # 중복 0 · 누락 0


def test_히스트_18_마지막_페이지는_끝을_알린다():
    last = paginate(rows_of(25), cursor=paginate(rows_of(25), None).next_cursor)
    assert last.has_more is False  # 화면의 `처음부터 모두 보여드렸습니다`


def test_서치_오더_05_동점이어도_순서가_흔들리지_않는다():
    same_time = [{"id": i, "at": FIXED} for i in shuffled(range(10))]
    assert [r["id"] for r in paginate(same_time, None).rows] == sorted(range(10))


def test_커서는_정렬_기준을_품는다():
    with pytest.raises(ValueError, match="정렬 기준"):
        paginate(rows_of(30), cursor=encode_cursor(order="merged_at desc"), order="accessed_at desc")


def test_히스트_17_마지막_페이지가_아니면_다음_커서를_준다():
    assert paginate(rows_of(50), cursor=None).next_cursor is not None


def test_오더_문자열은_id_동점키를_붙여_돌려준다():
    rows = [{"id": i, "occurred_at": i} for i in range(5)]
    assert paginate(rows, None, order="occurred_at desc").order == ("occurred_at desc", "id desc")
