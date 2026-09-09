# chat_flow_service.build_history — 최근 이력 윈도우(최신순 fetch)에서 "방금 저장한 현재 메시지"를
# 빼고 이전 발화만 시간순으로 돌려주는 순수 함수. DB·네트워크 없이 검증한다.
#
# 왜 필요한가: 현재 코드는 메시지를 먼저 저장한 뒤 이력을 다시 조회하므로 현재 발화가 이력에 포함된다.
#   그 이력을 진료과 흐름(dept_guide)에 넘기면 dept_guide가 [*history, message]로 현재 발화를 한 번 더
#   붙여 **현재 메시지가 두 번** 들어간다(리포트 §2.2 확인). 또 반복 감지(check_repeated)가 현재를
#   이력에서 세어 threshold를 1 일찍 친다. 현재 메시지를 이력에서 제외해 둘 다 바로잡는다.
from app.services.chat.chat_flow_service import build_history, format_roled_history


def _row(msg_id, content):
    return {"id": msg_id, "content": content}


def test_build_history_excludes_current_by_id_not_content():
    # fetch는 최신순(order by created_at desc). id=3이 방금 저장한 현재 메시지.
    # id=1은 내용이 같아도(같은 말 반복) 이전 발화라 남고, 현재(id=3)만 빠진다 — id로 제외.
    rows = [_row(3, "무릎이 아파요"), _row(2, "봇 답변입니다"), _row(1, "무릎이 아파요")]
    assert build_history(rows, current_id=3) == ["무릎이 아파요", "봇 답변입니다"]


def test_build_history_returns_oldest_first():
    rows = [_row(2, "둘째"), _row(1, "첫째")]
    assert build_history(rows, current_id=999) == ["첫째", "둘째"]


def test_build_history_empty_when_only_current_message():
    rows = [_row(5, "지금 보낸 것")]
    assert build_history(rows, current_id=5) == []


# ── format_roled_history: 화자 라벨을 붙인 이력(직원 인계 요약 LLM이 누가 말했는지 구분하게) ──
# 리포트 §2.2: 이력이 content만이라 "환자가 말한 사실"과 "봇이 답한 내용"을 모델이 구분 못 한다.

def test_format_roled_history_labels_by_sender_and_excludes_current():
    rows = [
        {"id": 3, "content": "계단에서 넘어졌어요", "sender_type": "patient"},   # 현재(제외)
        {"id": 2, "content": "어떤 불편이 있으세요?", "sender_type": "bot"},
        {"id": 1, "content": "무릎이 아파요", "sender_type": "patient"},
    ]
    assert format_roled_history(rows, current_id=3) == ["환자: 무릎이 아파요", "상담봇: 어떤 불편이 있으세요?"]


def test_format_roled_history_labels_staff_and_system():
    rows = [
        {"id": 2, "content": "확인해 드릴게요", "sender_type": "staff"},
        {"id": 1, "content": "상담이 연결됐어요", "sender_type": "system"},
    ]
    assert format_roled_history(rows, current_id=999) == ["안내: 상담이 연결됐어요", "직원: 확인해 드릴게요"]
