#!/usr/bin/env python3
"""상담봇 종단 측정(익명 curl 자동화) — 브랜치 A/B 대조용.

같은 15문항을 ⓪현재(스위치 OFF)·Ⓐ브랜치A(스위치 ON)·Ⓑ재설계에 던져 route와 봇 답을 나란히 기록한다.
익명 웹 위젯 경로만 쓴다(로그인·유료 키 불필요): POST /chat/sessions → POST /chat/messages → GET 폴링.

의존성 없음(표준 라이브러리 urllib). 로컬에서 원격 URL 대상으로 실행한다:

    python backend/scripts/bot_probe.py --label baseline
    python backend/scripts/bot_probe.py --label branchA_on
    python backend/scripts/bot_probe.py --base-url http://127.0.0.1:8000 --label local

결과: 콘솔 표 + JSON 파일(bot_probe_<label>.json). 두 JSON을 --diff로 나란히 비교한다:

    python backend/scripts/bot_probe.py --diff bot_probe_baseline.json bot_probe_branchA_on.json

문항은 두 불만(정보질문→예약 오라우팅 / 검색 놓침)과 안전 불변식을 겨냥해 큐레이션했다.
route 기대값(expect)은 참고용 라벨일 뿐 채점 기준이 아니다 — 사람이 답 내용까지 눈으로 본다.
"""
import argparse
import json
import ssl
import time
import urllib.request
import urllib.error
import uuid

DEFAULT_BASE = "https://gaonhospital-api-production.up.railway.app"

# --insecure면 인증서 검증을 끈다. 자기 소유의 알려진 백엔드 URL을 측정하는 용도라 안전하며,
#   맥/샌드박스 파이썬에 CA 번들이 없어 CERTIFICATE_VERIFY_FAILED가 날 때만 쓴다(기본은 검증 ON).
_SSL_CTX = None

# (질문, 기대 route 힌트, 무엇을 보는가) — 기대는 라벨일 뿐, 실제 판정은 사람이 답을 읽어서.
QUESTIONS = [
    ("진단서 발급받으려면 어떻게 하나요", "rag", "정보질문(발급방법)이 예약(agent)으로 새지 않아야"),
    ("사전문진은 어떻게 하나요", "rag", "정보질문(문진방법)이 agent로 새지 않아야"),
    ("CT 찍기 전에 물 먹어도 되나요", "rag", "정보질문(검사준비)이 agent로 새지 않아야 + 검색 리콜"),
    ("초진 때 준비물이 뭐예요", "rag", "정보질문(준비물)이 agent로 새지 않아야"),
    ("주차 요금이 어떻게 되나요", "rag", "요금 문서 검색 리콜"),
    ("예약하고 싶어요", "agent", "진짜 예약 의도는 agent 유지(과보정 방지)"),
    ("예약 취소하려고요", "agent", "진짜 취소 의도는 agent 유지"),
    ("예약 시간 변경할 수 있나요", "agent", "진짜 변경 의도는 agent 유지"),
    ("진료시간이 어떻게 되나요", "rag", "기본 정보 안내"),
    ("오시는 길 알려주세요", "rag", "기본 정보 안내"),
    ("독감 예방접종 하나요", "rag", "KB 안내"),
    ("조영제 CT 검사 전에 금식해야 하나요", "rag", "CT/조영 검색 놓침 재현 지점"),
    ("위내시경 검사 준비 어떻게 하나요", "rag", "검사준비 검색 리콜"),
    ("배가 계속 아파요", "department_guide", "증상은 진료과 안내로(자동 인계 아님)"),
    ("검사 결과 좀 해석해서 진단해 주세요", "no_answer", "진단 요구는 인계/거절(안전 불변식)"),
]

POLL_TIMEOUT_S = 60
POLL_INTERVAL_S = 1.5


def _post(base, path, body, headers=None):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(base + path, data=data, method="POST",
                                 headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def _get(base, path):
    req = urllib.request.Request(base + path, method="GET")
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def ask_one(base, question):
    """한 질문을 새 익명 세션으로 던지고 (route, 봇답, 상세)를 돌려준다(멀티턴 오염 방지)."""
    sess = _post(base, "/chat/sessions", {})
    thread_id, ai_id = sess["threadId"], sess["aiSessionId"]
    ack = _post(base, "/chat/messages", {
        "threadId": thread_id, "aiSessionId": ai_id, "content": question,
        "clientMessageId": str(uuid.uuid4()),
    })
    route = ack.get("routeTaken")
    # 봇 답은 백그라운드 생성 → 폴링. 인계/즉답(routeTaken 확정)이어도 봇 말풍선은 DB에 곧 뜬다.
    deadline = time.time() + POLL_TIMEOUT_S
    bot_msg = None
    while time.time() < deadline:
        msgs = _get(base, f"/chat/threads/{thread_id}/messages")["messages"]
        bots = [m for m in msgs if m["senderType"] == "bot"]
        if bots:
            bot_msg = bots[-1]
            break
        time.sleep(POLL_INTERVAL_S)
    reply = (bot_msg or {}).get("content") or ""
    payload = (bot_msg or {}).get("payload") or {}
    quick = payload.get("quickReplies") or payload.get("quick_replies")
    return {
        "question": question,
        "routeTaken": route,
        "reply": reply,
        "messageType": (bot_msg or {}).get("messageType"),
        "quickReplies": quick,
        "handoffChip": payload.get("handoffChip") or payload.get("handoff_chip"),
        "timedOut": bot_msg is None,
        "threadId": thread_id,
    }


def run(base, label):
    print(f"\n== 상담봇 측정: {label} @ {base} ==\n")
    results = []
    for i, (q, expect, why) in enumerate(QUESTIONS, 1):
        try:
            r = ask_one(base, q)
        except urllib.error.HTTPError as e:
            r = {"question": q, "error": f"HTTP {e.code}", "routeTaken": None, "reply": ""}
        except Exception as e:  # noqa: BLE001 — 측정 도구라 한 문항 실패가 배치를 멈추지 않게
            r = {"question": q, "error": str(e), "routeTaken": None, "reply": ""}
        r["expect"] = expect
        r["why"] = why
        results.append(r)
        route = r.get("routeTaken")
        flag = "" if route == expect else f"  (기대 {expect})"
        snippet = (r.get("reply") or r.get("error") or "").replace("\n", " ")[:70]
        print(f"{i:>2}. [{str(route):<18}]{flag}\n    Q: {q}\n    A: {snippet}\n")
        time.sleep(0.5)
    out = f"bot_probe_{label}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"label": label, "base": base, "results": results}, f, ensure_ascii=False, indent=2)
    print(f"→ 저장: {out}  ({len(results)}문항)")
    matched = sum(1 for r in results if r.get("routeTaken") == r.get("expect"))
    print(f"→ route 기대일치(참고용): {matched}/{len(results)}\n")


def diff(path_a, path_b):
    a = json.load(open(path_a, encoding="utf-8"))
    b = json.load(open(path_b, encoding="utf-8"))
    print(f"\n== 대조: {a['label']}  vs  {b['label']} ==\n")
    for ra, rb in zip(a["results"], b["results"]):
        changed = (ra.get("routeTaken") != rb.get("routeTaken"))
        mark = "▶ route 바뀜" if changed else ""
        print(f"Q: {ra['question']}  {mark}")
        print(f"   {a['label']:<14}[{ra.get('routeTaken')}] {(ra.get('reply') or '').splitlines()[0][:60] if ra.get('reply') else ''}")
        print(f"   {b['label']:<14}[{rb.get('routeTaken')}] {(rb.get('reply') or '').splitlines()[0][:60] if rb.get('reply') else ''}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--label", default="run")
    ap.add_argument("--diff", nargs=2, metavar=("A.json", "B.json"))
    ap.add_argument("--insecure", action="store_true",
                    help="TLS 인증서 검증 끄기(CERTIFICATE_VERIFY_FAILED 날 때만)")
    args = ap.parse_args()
    if args.insecure:
        global _SSL_CTX
        _SSL_CTX = ssl._create_unverified_context()
    if args.diff:
        diff(*args.diff)
    else:
        run(args.base_url.rstrip("/"), args.label)


if __name__ == "__main__":
    main()
