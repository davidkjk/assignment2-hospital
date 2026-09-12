"""브랜치 A — 센티넬 노출 가드(스트리밍) 단위 테스트.

RAG 스트리밍이 조각(delta)을 흘릴 때, 모델이 근거부재(NO_ANSWER)·되묻기(NEEDS_CLARIFY)
센티넬을 내면 그 영어 내부 코드가 조각으로 환자 화면에 잠깐 노출됐다(2026-09-08 실측, webchat·앱 공통).
이 가드는 센티넬이 감지되면 조각 전송을 억제해 노출을 막는다. 최종 판정(reply 전체에 대한 센티넬 검사)은
그대로라 no_answer/되묻기 동작은 불변 — 억제는 '전송'만, '판정'은 아니다.

가드 OFF(기본)면 현재 동작 그대로 모든 조각을 흘린다(on/off 스위치·격리 브랜치).

DB·conftest 불필요 — 순수 헬퍼만 검증한다. `--noconftest`로 공용 DB를 건드리지 않고 돌린다.
"""
import pytest

from app.services.chat import rag_service


class FakeChunk:
    def __init__(self, text):
        self.content = text


class StreamModel:
    """astream으로 조각을 순서대로 흘리는 가짜 모델."""

    def __init__(self, parts):
        self._parts = parts

    async def astream(self, messages):
        for p in self._parts:
            yield FakeChunk(p)


def _collector():
    seen = []
    return seen, (lambda piece: seen.append(piece))


@pytest.mark.asyncio
async def test_guard_suppresses_no_answer_token_in_deltas():
    # 모델이 센티넬을 조각으로 쪼개 낸다("NO_" + "ANSWER").
    seen, on_delta = _collector()
    reply = await rag_service._astream_reply(
        StreamModel(["NO_", "ANSWER"]), [], on_delta, sentinel_guard=True)
    # 조각으로 흘린 텍스트에 센티넬 원문이 없어야 한다(환자 노출 방지).
    assert "NO_ANSWER" not in "".join(seen)
    # 최종 완성본에는 남아 있어야 한다 — 호출부의 no_answer 판정이 이걸 봐야 하므로.
    assert reply == "NO_ANSWER"


@pytest.mark.asyncio
async def test_guard_suppresses_needs_clarify_token_in_deltas():
    seen, on_delta = _collector()
    reply = await rag_service._astream_reply(
        StreamModel(["NEEDS_CLARIFY", ": 어떤 ", "검사인가요?"]), [], on_delta, sentinel_guard=True)
    assert "NEEDS_CLARIFY" not in "".join(seen)
    assert reply.startswith("NEEDS_CLARIFY")
    assert "검사인가요?" in reply


@pytest.mark.asyncio
async def test_guard_passes_normal_answer_fully():
    # 평범한 답변은 가드가 켜져 있어도 전부(끝자락 포함) 조각으로 전달돼야 한다.
    parts = ["진료시간은 ", "평일 오전 9시부터 ", "오후 6시까지입니다."]
    seen, on_delta = _collector()
    reply = await rag_service._astream_reply(
        StreamModel(parts), [], on_delta, sentinel_guard=True)
    assert "".join(seen) == "".join(parts)
    assert reply == "".join(parts).strip()


@pytest.mark.asyncio
async def test_guard_off_emits_sentinel_like_current_behavior():
    # 스위치 OFF(기본) = 현재 동작 보존 — 조각을 그대로 흘린다(센티넬 포함).
    seen, on_delta = _collector()
    reply = await rag_service._astream_reply(
        StreamModel(["NO_", "ANSWER"]), [], on_delta, sentinel_guard=False)
    assert "".join(seen) == "NO_ANSWER"
    assert reply == "NO_ANSWER"
