#!/usr/bin/env python3
"""이상 케이스만 raw JSON 전체를 찍어 handoff_reason 등 증거 확보."""
import json, urllib.request, uuid, ssl

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
    anon = "probe-" + uuid.uuid4().hex[:12]
    st, sess = post("/chat/sessions", {"channel": "web"}, anon)
    body = {"threadId": sess["threadId"], "aiSessionId": sess["aiSessionId"],
            "content": msg, "clientMessageId": str(uuid.uuid4())}
    st, resp = post("/chat/messages", body, anon)
    return st, resp

for msg in ["진료 예약하고 싶어요", "예약을 취소하고 싶어요",
            "요즘 자꾸 어지럽고 두통이 심한데 어느 과에 가야 할까요?",
            "진료시간이 어떻게 되나요?", "위내시경 검사 전에 어떻게 준비하나요?"]:
    st, resp = one(msg)
    print(f"### {msg}")
    print(f"http={st}")
    print(json.dumps(resp, ensure_ascii=False, indent=2))
    print()
