"""resp_text: 실제 ChatAnthropic이 content를 블록 리스트로 줄 때 문자열로 정규화한다.

심(stub) 모델은 content를 문자열로 줘서 `.strip()`이 통과했지만, 진짜 모델은
`[{'type':'text','text':...}]` 리스트를 줘 `'list' object has no attribute 'strip'`로 터졌다.
"""
from app.integrations.langchain_client import resp_text


class _Resp:
    def __init__(self, content):
        self.content = content


def test_string_content_passes_through():
    assert resp_text(_Resp("예약")) == "예약"


def test_list_of_text_blocks_is_flattened():
    resp = _Resp([{"type": "text", "text": "정형"}, {"type": "text", "text": "외과"}])
    assert resp_text(resp) == "정형외과"


def test_list_with_plain_strings():
    assert resp_text(_Resp(["a", "b"])) == "ab"


def test_list_ignores_nontext_blocks_gracefully():
    # tool_use 등 text 없는 블록은 빈 문자열로(크래시 금지).
    resp = _Resp([{"type": "tool_use", "id": "x"}, {"type": "text", "text": "답"}])
    assert resp_text(resp) == "답"


def test_empty_list_returns_empty_string():
    assert resp_text(_Resp([])) == ""


def test_flattened_result_is_strippable():
    # 호출부는 resp_text(resp).strip()을 쓴다 — 리스트여도 .strip()이 물려야 한다.
    assert resp_text(_Resp([{"type": "text", "text": "  rag  "}])).strip() == "rag"
