# 예약 중 상담(제한모드, E4): 정보성 안내·진료과 추천만. 행동형 카드 전부 금지, 유일 출구는 "○○과로 계속하기".
# Task 5 orchestrator(restricted=True)와 짝. 앱 DeptBotSheet(환자앱 T20)가 이 엔진을 주입한다.
from app.core.errors import AppError

ALLOWED_CARD_TYPES_RESTRICTED: set[str] = set()   # 시간선택·예약확인·예약완료·취소·문진 카드 전부 금지(카탈로그 §8)


def continue_to_department_label(department_name: str) -> str:
    return f"{department_name}로 계속하기"           # 유일한 행동 출구 — 마법사에 과를 돌려준다


def assert_card_allowed(card_type: str, restricted: bool) -> None:
    if restricted and card_type not in ALLOWED_CARD_TYPES_RESTRICTED:
        raise AppError("예약 중 상담에서는 이 카드를 보낼 수 없습니다.", 409)
