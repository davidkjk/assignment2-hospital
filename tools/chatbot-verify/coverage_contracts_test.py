#!/usr/bin/env python3
"""원격 상담봇 2차 e2e — 멀티턴 이어가기·계약(멱등/영속)·RAG 커버리지·제한자료.

bot_test.py(단일턴 라우팅)·booking_flow_test.py(예약 멀티턴) 다음의 나머지 검증.
전부 익명·DB 쓰기 없음(채팅 메시지만, bot_test와 동일 성격). 자격증명 불필요.

A. no_answer 칩 재클릭 이어가기 — 잡담→no_answer(FAQ칩)→칩 텍스트 재전송→rag(같은 세션)
B. 멱등성(§8-4) — 같은 clientMessageId 두 번 → 환자 메시지 1행만
C. 메시지 영속/복원 — 전송 후 GET 이력에 환자·봇 메시지가 남는지
D. RAG 커버리지 스윕 — 실제 병원 질문 다수 → 답변/no_answer 집계(빈 곳 발굴)
E. 제한자료 — 검사준비류(is_restricted) → restricted_block 원문+[직원 연결] 여부
"""
import json, urllib.request, uuid, ssl, sys

API = "https://gaonhospital-api-production.up.railway.app"
CTX = ssl._create_unverified_context()


def req(method, path, body, anon):
    r = urllib.request.Request(
        API + path, data=(json.dumps(body).encode() if body is not None else None),
        headers={"Content-Type": "application/json", "X-Anon-Token": anon}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60, context=CTX) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}
    except Exception as e:
        return -1, {"error": str(e)}


def new_session():
    anon = "cov-" + uuid.uuid4().hex[:12]
    st, sess = req("POST", "/chat/sessions", {"channel": "web"}, anon)
    return anon, sess


def send(anon, sess, content, cmid=None):
    body = {"threadId": sess["threadId"], "aiSessionId": sess["aiSessionId"],
            "content": content, "clientMessageId": cmid or str(uuid.uuid4())}
    return req("POST", "/chat/messages", body, anon)


fails = []


def check(cond, label, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f"  — {detail}" if detail else ""))
    if not cond:
        fails.append(label)
    return cond


# ── A. no_answer 칩 재클릭 이어가기 ─────────────────────────────
print("=== A. no_answer 칩 재클릭 이어가기 (멀티턴) ===")
anon, sess = new_session()
# ⚠️ 잡담 문구는 예약/의료/시간·선택 토큰이 없는 명확한 잡담이라야 한다. 옛 문구
# "오늘 저녁 뭐 먹을지 골라줘"는 "골라줘"+"오늘 저녁"을 라우터가 예약(agent)으로 ~40% 오분류해
# 이 게이트가 무작위로 뒤집혔다(세션35 확인, 위험 없는 경계 비결정성=세션33 마스크와 동류).
# 이 절의 목적은 라우터 경계 판단이 아니라 no_answer→FAQ칩→칩재전송→rag 멀티턴 흐름이다.
st, r1 = send(anon, sess, "재미있는 농담 하나 해줘")
check(r1.get("route_taken") == "no_answer", "1턴: 잡담 → no_answer", f"route={r1.get('route_taken')}")
card = r1.get("card") or {}
opts = card.get("options") or []
check(len(opts) > 0, "no_answer 카드에 FAQ 칩 있음", f"칩={opts}")
if opts:
    chip = opts[0]
    print(f"     → 칩 재클릭(재전송): '{chip}'")
    st, r2 = send(anon, sess, chip)   # 같은 세션에서 칩 텍스트 전송
    check(r2.get("route_taken") == "rag", "2턴: 칩 텍스트 → rag(실답변)", f"route={r2.get('route_taken')}")
    check(bool((r2.get("reply") or "").strip()), "봇 실답변 있음", (r2.get("reply") or "")[:70])

# ── B. 멱등성(§8-4) ─────────────────────────────────────────
print("\n=== B. 멱등성 — 같은 clientMessageId 두 번 → 환자 1행 ===")
anon, sess = new_session()
cmid = str(uuid.uuid4())
send(anon, sess, "주차 되나요?", cmid=cmid)
send(anon, sess, "주차 되나요?", cmid=cmid)   # 동일 cmid 재전송
st, hist = req("GET", f"/chat/threads/{sess['threadId']}/messages", None, anon)
msgs = hist.get("messages") or []
same = [m for m in msgs if m.get("clientMessageId") == cmid and m.get("senderType") == "patient"]
check(len(same) == 1, "같은 cmid 환자 메시지 정확히 1행", f"n={len(same)} (전체 {len(msgs)})")

# ── C. 메시지 영속/복원 ─────────────────────────────────────
print("\n=== C. 메시지 영속 — GET 이력에 환자·봇 남음 ===")
anon, sess = new_session()
send(anon, sess, "와이파이 되나요?")
st, hist = req("GET", f"/chat/threads/{sess['threadId']}/messages", None, anon)
msgs = hist.get("messages") or []
senders = {m.get("senderType") for m in msgs}
check("patient" in senders, "환자 메시지 저장됨", f"senders={senders}")
check("bot" in senders, "봇 메시지 저장됨", f"n={len(msgs)}")

# ── D. RAG 커버리지 스윕 ────────────────────────────────────
print("\n=== D. RAG 커버리지 스윕 (실제 병원 질문) ===")
QUESTIONS = [
    "진료비는 카드로 결제되나요?", "예약 변경은 어떻게 하나요?", "진료 예약 취소는 어떻게 하나요?",
    "주차 요금 있나요?", "휠체어 대여 되나요?", "수유실 있나요?",
    "진단서 발급 받으려면 어떻게 하나요?", "실손보험 서류 떼려면요?", "야간 진료 하나요?",
    "일요일에 문 여나요?", "감염 예방 수칙 알려줘", "마스크 꼭 써야 하나요?",
    "약 처방전 재발급 되나요?", "검진 결과는 언제 나오나요?", "앱으로 뭘 할 수 있어요?",
    "보호자도 같이 들어갈 수 있나요?",
]
tally = {"rag": [], "no_answer": [], "기타": []}
for q in QUESTIONS:
    a, s = new_session()
    st, r = send(a, s, q)
    route = r.get("route_taken")
    key = route if route in ("rag", "no_answer") else "기타"
    tally[key].append((q, route))
print(f"  답변(rag) {len(tally['rag'])}건 / no_answer {len(tally['no_answer'])}건 / 기타 {len(tally['기타'])}건")
if tally["no_answer"]:
    print("  ⚠️ no_answer (KB 커버리지 빈 곳 후보):")
    for q, _ in tally["no_answer"]:
        print(f"      - {q}")
if tally["기타"]:
    print("  ℹ️ 기타 라우팅:")
    for q, route in tally["기타"]:
        print(f"      - [{route}] {q}")
# 스윕은 게이트가 아니라 관찰 — fails에 넣지 않음

# ── E. 제한자료 처리 ────────────────────────────────────────
print("\n=== E. 제한자료(검사준비류) — restricted_block 원문 여부 ===")
RESTRICTED_Q = [
    "CT 조영제 검사 전에 어떻게 준비하나요?",
    "바륨 검사 준비 방법 알려줘",
    "대장내시경 검사 전 준비 알려줘",
    "건강검진 전날 준비할 게 있나요?",
]
for q in RESTRICTED_Q:
    a, s = new_session()
    st, r = send(a, s, q)
    route = r.get("route_taken")
    rb = (r.get("restricted_block") or "").strip()
    reply = (r.get("reply") or "").strip()
    mark = "제한원문O" if rb else "제한원문X"
    print(f"  [{route}|{mark}] {q}")
    if rb:
        print(f"      restricted_block: {rb[:80]}")
    elif reply:
        print(f"      reply: {reply[:80]}")
print("  (제한원문X만 나오면 원격 is_restricted 미반영 상태 — 배포 백로그 G② 대기 신호. 코드버그 아님)")

print("\n=== 결과 ===")
if fails:
    print(f"  ❌ 계약/멀티턴 실패 {len(fails)}건: {fails}")
    sys.exit(1)
print("  ✅ A~C 계약·멀티턴 전부 통과 (D 스윕·E 제한은 관찰 리포트)")
