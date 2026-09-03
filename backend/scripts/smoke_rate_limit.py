"""익명 채팅 rate limit이 배포 환경에서 실제로 걸리는지 확인 (선택 실행 — 자주 돌리지 말 것).

실행:
    cd backend
    SMOKE_API=https://gaonhospital-api-production.up.railway.app \
    python -m scripts.smoke_rate_limit

⚠️ 알려진 갭 (2026-09-03 실측):
    `settings.anon_rate_limit_per_hour`(config.py, 기본 30)는 **정의만 있고 익명 채팅
    경로 어디에도 배선돼 있지 않다** — 상담봇 ⑦(웹 위젯 채널 완결) 트랙 몫이다.
    따라서 이 스크립트는 지금 시점엔 "한도 도달 시 429가 나와야 한다"는 **미충족 요구를
    문서화·검증하는 게이트**이며, ⑦에서 rate limiter가 배선되기 전까지는 실패(429 미발생)로
    끝난다. 이 실패는 스크립트 버그가 아니라 기능 미구현을 드러내는 것이다.
    (ANTHROPIC/OPENAI 키가 비어 stub 폴백이라 실제 LLM 비용은 발생하지 않는다.)

라우트: 실제 익명 채널 계약 기준(플랜 초안의 /chat/conversations 표기는 낡음).
    POST /chat/sessions        {channel:"web"}  헤더 X-Anon-Token(있으면 복원, 없으면 발급)
        → {threadId, aiSessionId, anonToken, messages}
    POST /chat/messages        {threadId, aiSessionId, content}  헤더 X-Anon-Token
"""
import os

import httpx

API = os.environ["SMOKE_API"].rstrip("/")
LIMIT = int(os.environ.get("SMOKE_RATE_LIMIT", "30"))  # 배포 환경 anon_rate_limit_per_hour와 맞출 것


def main():
    # 익명 세션 발급(토큰 없이 호출 → 서버가 anonToken 발급)
    sess = httpx.post(f"{API}/chat/sessions", json={"channel": "web"}, timeout=15).json()
    headers = {"X-Anon-Token": sess["anonToken"]}
    thread_id = sess["threadId"]
    ai_session_id = sess["aiSessionId"]

    last_status = None
    for i in range(LIMIT + 1):
        res = httpx.post(
            f"{API}/chat/messages",
            json={
                "threadId": thread_id,
                "aiSessionId": ai_session_id,
                "content": "진료 시간 알려주세요",
            },
            headers=headers,
            timeout=30,
        )
        last_status = res.status_code
        if res.status_code == 429:
            print(f"✅ {i + 1}번째 요청에서 429(rate limited) 확인 — 한도 {LIMIT} 근처: {i + 1 > LIMIT - 2}")
            return
    print(f"❌ {LIMIT + 1}번 요청 후에도 429 없음 (마지막 status={last_status}) "
          f"— rate limiter 미배선(상담봇 ⑦ 갭)일 가능성. 배선 후 재실행할 것.")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
