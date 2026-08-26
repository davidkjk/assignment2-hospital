"""[HIST-LIST-15~19][SEARCH-ORDER-04·05][MHIST-LIST-03] 공용 커서 이어받기 부품.

⭐ 여덟 화면이 이 부품 하나를 소비한다(Task 15·24·26·28…). 커서를 화면마다 따로 만들면
   하나만 정렬 키가 달라도 그 화면에서만 `SEARCH-ORDER-05`가 경고한 사고
   (*"같은 사람이 두 번 나오거나 어떤 사람은 아예 안 나온다"*)가 난다.

계약:
- 한 번에 최대 20건(`PAGE_SIZE`)을 준다(HIST-LIST-15).
- 커서로 이어받으면 겹치지도 빠지지도 않는다(HIST-LIST-16). 마지막 동점 키는 항상 유일한
  `id`이므로, 커서가 마지막으로 본 행의 id만 품으면 이어받기가 모호해지지 않는다.
- 마지막 페이지는 `has_more=False`로 끝을 알린다(HIST-LIST-18).
- 동점이어도 정렬은 항상 같다 — 정렬은 마지막에 항상 `id`로 못 박는다(SEARCH-ORDER-05).
- 커서는 「어떤 정렬로 만들어졌는지」를 품는다(MHIST-LIST-03). 정렬을 바꾼 뒤 옛 커서로
  이어받으려 하면 목록이 섞이므로, 정렬이 다르면 이어받기를 거절한다.
"""
import base64
import json
from dataclasses import dataclass

PAGE_SIZE = 20


@dataclass
class Page:
    rows: list[dict]
    has_more: bool
    next_cursor: str | None
    order: tuple[str, ...]


def _normalize_order(order) -> tuple[str, ...]:
    """정렬 절을 정규화하고, 마지막에 유일 동점 키 `id`를 항상 붙인다.

    id 동점 키의 방향은 앞선 절의 방향을 따른다 — desc 목록의 동점은 desc로 이어야
    새로고침 때 순서가 흔들리지 않는다.
    """
    if order is None:
        clauses = ["id asc"]
    elif isinstance(order, str):
        clauses = [order]
    else:
        clauses = list(order)

    last_field = clauses[-1].split()[0]
    if last_field != "id":
        parts = clauses[-1].split()
        last_dir = parts[1] if len(parts) > 1 else "asc"
        clauses.append(f"id {last_dir}")
    return tuple(clauses)


def _parse(clause: str) -> tuple[str, bool]:
    parts = clause.split()
    field = parts[0]
    reverse = len(parts) > 1 and parts[1].lower() == "desc"
    return field, reverse


def _sorted(rows: list[dict], order: tuple[str, ...]) -> list[dict]:
    result = list(rows)
    # 안정 정렬을 덜 중요한 절부터 적용하면 다중 키 정렬이 완성된다.
    for clause in reversed(order):
        field, reverse = _parse(clause)
        result.sort(key=lambda r, f=field: r[f], reverse=reverse)
    return result


def encode_cursor(*, order, last_id=None) -> str:
    payload = {"order": list(_normalize_order(order)), "last_id": last_id}
    raw = json.dumps(payload, default=str).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def decode_cursor(cursor: str) -> dict:
    raw = base64.urlsafe_b64decode(cursor.encode("ascii"))
    return json.loads(raw)


def paginate(rows: list[dict], cursor: str | None = None, order=None) -> Page:
    normalized = _normalize_order(order)

    start = 0
    if cursor is not None:
        decoded = decode_cursor(cursor)
        if tuple(decoded["order"]) != normalized:
            raise ValueError(
                "정렬 기준이 커서와 다릅니다 — 정렬을 바꾸면 이어받기를 다시 시작해야 합니다."
            )
        ordered = _sorted(rows, normalized)
        last_id = decoded["last_id"]
        if last_id is not None:
            # 커서의 last_id는 JSON을 거치며 문자열이 될 수 있다(UUID 등). 행의 id가
            # UUID/int 무엇이든 문자열로 맞춰 비교해 이어받기 앵커를 놓치지 않는다.
            target = str(last_id)
            for i, row in enumerate(ordered):
                if str(row["id"]) == target:
                    start = i + 1
                    break
    else:
        ordered = _sorted(rows, normalized)

    window = ordered[start : start + PAGE_SIZE]
    has_more = len(ordered) > start + PAGE_SIZE
    next_cursor = (
        encode_cursor(order=normalized, last_id=window[-1]["id"])
        if has_more and window
        else None
    )
    return Page(rows=window, has_more=has_more, next_cursor=next_cursor, order=normalized)
