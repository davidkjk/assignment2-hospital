import pytest

from app.services.chat import intent_precheck


class TestDetectIntent:
    """B1·B2: 진료시간·의사명단 질문을 결정적 키워드로만 판별(LLM 추가 호출 없음).
    KBADM-EDITOR-17 — 이 둘은 KB가 아니라 DB 단일원본에서 읽는다."""

    @pytest.mark.parametrize("msg", [
        "진료시간이 어떻게 되나요",
        "병원 몇 시에 문 열어요?",
        "운영시간 알려주세요",
        "몇 시까지 진료해요?",
        "점심시간 있나요?",
        "언제 문 여나요",
    ])
    def test_hours_questions_detected(self, msg):
        assert intent_precheck.detect_intent(msg) == "hospital_hours"

    @pytest.mark.parametrize("msg", [
        "진료하는 선생님이 누구예요?",
        "무슨 의사가 있어요?",
        "의사 명단 보여주세요",
        "어떤 선생님이 진료하세요?",
        "의사 목록 알려줘",
    ])
    def test_doctor_list_questions_detected(self, msg):
        assert intent_precheck.detect_intent(msg) == "doctor_list"

    @pytest.mark.parametrize("msg", [
        "예약하려면 어떻게 하나요",
        "주차할 수 있나요",
        "오시는 길이 궁금해요",
        "김서준 선생님 진료 잘 보시나요",  # 단일 의사 평가 — 명단 질문 아님
        "예약 몇 시로 잡았죠",            # 예약 시각 — 진료시간 아님(예약 토큰 우선)
    ])
    def test_unrelated_questions_not_detected(self, msg):
        assert intent_precheck.detect_intent(msg) is None


class TestFormatHours:
    def test_formats_weekday_hours_with_lunch(self):
        rows = [
            {"weekday": 0, "open_time": "09:00:00", "close_time": "18:00:00",
             "lunch_start": "12:30:00", "lunch_end": "13:30:00", "is_closed": False},
            {"weekday": 5, "open_time": "09:00:00", "close_time": "13:00:00",
             "lunch_start": None, "lunch_end": None, "is_closed": False},
        ]
        text = intent_precheck.format_hours(rows)
        assert "월요일" in text and "09:00" in text and "18:00" in text
        assert "점심" in text and "12:30" in text and "13:30" in text
        assert "토요일" in text and "13:00" in text

    def test_empty_hours_returns_none(self):
        # 데이터가 없으면 None → orchestrator가 기존 RAG로 폴백(막다른 길 방지).
        assert intent_precheck.format_hours([]) is None

    def _one_row(self):
        return [{"weekday": 0, "open_time": "09:00:00", "close_time": "18:00:00",
                 "lunch_start": None, "lunch_end": None, "is_closed": False}]

    def test_web_channel_directs_to_book_here(self):
        # Q15: webchat은 대화 안에서 바로 예약 가능 → "여기서 바로 예약", "앱" 언급 금지(misdirect).
        text = intent_precheck.format_hours(self._one_row(), channel="web")
        assert "여기서 바로 예약" in text
        assert "앱" not in text

    def test_app_channel_directs_to_app_screen(self):
        # Q15: 앱 채널은 예약 화면으로 안내(현행 유지).
        text = intent_precheck.format_hours(self._one_row(), channel="app")
        assert "앱" in text and "예약 화면" in text

    def test_default_channel_is_app(self):
        # 채널 미지정(기존 호출부·하위호환)은 앱 문구.
        text = intent_precheck.format_hours(self._one_row())
        assert "앱" in text


class TestFormatDoctors:
    def test_groups_by_department(self):
        rows = [
            {"name": "김서준", "specialty": "내과"},
            {"name": "이하나", "specialty": "내과"},
            {"name": "박민", "specialty": "정형외과"},
        ]
        text = intent_precheck.format_doctors(rows)
        assert "내과" in text and "김서준" in text and "이하나" in text
        assert "정형외과" in text and "박민" in text

    def test_empty_returns_none(self):
        assert intent_precheck.format_doctors([]) is None
