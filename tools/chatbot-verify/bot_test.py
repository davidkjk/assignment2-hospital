#!/usr/bin/env python3
"""원격 상담봇 종합 라우팅 테스트 — 6갈래 전부 실제 호출."""
import json, urllib.request, uuid, sys, ssl

API = "https://gaonhospital-api-production.up.railway.app"
CTX = ssl._create_unverified_context()

def post(path, body, anon):
    req = urllib.request.Request(
        API + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Anon-Token": anon},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
    except Exception as e:
        return -1, {"error": str(e)}

def one(msg):
    anon = "verify-" + uuid.uuid4().hex[:12]
    st, sess = post("/chat/sessions", {"channel": "web"}, anon)
    if st != 200:
        return {"msg": msg, "http": st, "route": None, "reply": "",
                "card": None, "quick": None, "handoff_chip": None,
                "handoff_ticket": None, "raw_keys": None,
                "detail": f"SESSION_FAIL: {sess}"}
    body = {"threadId": sess["threadId"], "aiSessionId": sess["aiSessionId"],
            "content": msg, "clientMessageId": str(uuid.uuid4())}
    st, resp = post("/chat/messages", body, anon)
    card = resp.get("card") or {}
    return {
        "msg": msg, "http": st,
        "route": resp.get("route_taken"),
        "reply": (resp.get("reply") or "")[:110],
        "card": card.get("card_type"),
        "quick": card.get("options") or card.get("quick_replies"),
        "handoff_chip": card.get("handoff_chip"),
        "handoff_ticket": resp.get("handoff_ticket_id"),
        "raw_keys": list(resp.keys()) if st != 200 else None,
        "detail": resp.get("detail") if st != 200 else None,
    }

CASES = [
    ("응급-흉통", "가슴이 너무 아프고 숨쉬기 힘들어요"),
    ("응급-119", "지금 응급실 가야 하나요 119"),
    ("직원연결-타이핑", "직원 연결해주세요"),
    ("직원연결-상담원", "상담원 바꿔주세요"),
    ("직원연결-사람", "그냥 사람과 연결해줘"),
    ("RAG-와이파이", "와이파이 되나요?"),
    ("RAG-주차", "주차장은 어디에 있나요?"),
    ("RAG-진료시간", "진료시간이 어떻게 되나요?"),
    ("RAG-위내시경", "위내시경 검사 전에 어떻게 준비하나요?"),
    ("RAG-오시는길", "병원 오시는 길 알려줘"),
    ("no_answer-무관", "오늘 저녁 메뉴 뭐 먹을지 추천해줘"),
    ("no_answer-잡담", "너 이름이 뭐야 좋아하는 색깔 있어?"),
    ("예약-agent", "진료 예약하고 싶어요"),
    ("취소-agent", "예약을 취소하고 싶어요"),
    ("진료과안내", "요즘 자꾸 어지럽고 두통이 심한데 어느 과에 가야 할까요?"),
]

results = []
for label, msg in CASES:
    r = one(msg)
    r["label"] = label
    results.append(r)
    print(f"[{label:16}] http={r['http']} route={r['route']}")
    if r["reply"]:
        print(f"                   reply: {r['reply']}")
    if r["card"]:
        print(f"                   card={r['card']} quick={r['quick']} chip={r['handoff_chip']}")
    if r["handoff_ticket"]:
        print(f"                   handoff_ticket={r['handoff_ticket']}")
    if r["http"] != 200:
        print(f"                   !! detail={r['detail']}")
    print()

print("\n=== 요약 ===")
from collections import Counter
c = Counter((r["label"].split("-")[0], r["route"]) for r in results)
for (grp, route), n in sorted(c.items()):
    print(f"  {grp:14} -> {route}")
