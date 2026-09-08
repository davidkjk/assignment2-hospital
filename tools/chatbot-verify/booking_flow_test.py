#!/usr/bin/env python3
"""원격 상담봇 예약 대화 흐름 멀티 턴 e2e — 익명(로그인 전) 4단계 + 늦은 관문(④) 401 확인.

기존 bot_test.py는 단일 턴(route_taken)만 본다. 이 테스트는 예약 카드 네비게이션을
실제 배포 API로 끝까지 이어붙인다:
  1) "진료 예약하고 싶어요"  → route=agent, card=department_select (진료과 목록 비어있지 않음)
  2) pick_department        → doctor_select (의사 목록)
  3) pick_doctor            → date_select   (날짜 목록)
  4) pick_date              → time_select   (시간 후보)
  5) pick_target (Bearer X) → 401  ← 늦은 관문 ④(로그인 전 대상 선택 차단)
DB 쓰기 없음(create_booking은 Bearer 필요라 실행 안 함). 자격증명 불필요.
"""
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
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}
    except Exception as e:
        return -1, {"error": str(e)}


def nav(anon, kind, payload):
    """POST /chat/cards/revalidate (익명 nav). 반환 {status, card_payload}."""
    st, resp = post("/chat/cards/revalidate", {"action": {"kind": kind, "payload": payload}}, anon)
    card = (resp.get("card") or {}) if st == 200 else {}
    return st, card.get("payload") or card, resp


fails = []


def check(cond, label, detail=""):
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {label}" + (f"  — {detail}" if detail else ""))
    if not cond:
        fails.append(label)
    return cond


print("=== 예약 대화 흐름 멀티 턴 e2e (익명) ===\n")
anon = "bookflow-" + uuid.uuid4().hex[:12]

# 세션 시작
st, sess = post("/chat/sessions", {"channel": "web"}, anon)
if not check(st == 200, "세션 시작(200)", f"http={st} {sess}"):
    sys.exit(1)

# 1) 예약 의도 → department_select
print("\n1) '진료 예약하고 싶어요' → department_select")
body = {"threadId": sess["threadId"], "aiSessionId": sess["aiSessionId"],
        "content": "진료 예약하고 싶어요", "clientMessageId": str(uuid.uuid4())}
st, resp = post("/chat/messages", body, anon)
check(st == 200, "메시지 200", f"http={st}")
check(resp.get("route_taken") == "agent", "route=agent", f"route={resp.get('route_taken')}")
card = resp.get("card") or {}
check(card.get("card_type") == "department_select", "card=department_select", f"card={card.get('card_type')}")
depts = card.get("departments") or []
check(len(depts) > 0, "진료과 목록 비어있지 않음", f"n={len(depts)}")
if not depts:
    sys.exit(1 if fails else 0)
dept = depts[0]
print(f"     → 진료과 선택: {dept.get('name')} ({dept.get('id')})")

# 2) pick_department → doctor_select
print("\n2) pick_department → doctor_select")
st, dc, raw = nav(anon, "pick_department", {"department_id": dept["id"]})
check(st == 200, "nav 200", f"http={st} {raw if st!=200 else ''}")
check(dc.get("card_type") == "doctor_select", "card=doctor_select", f"card={dc.get('card_type')}")
docs = dc.get("doctors") or []
check(len(docs) > 0, "의사 목록 비어있지 않음", f"n={len(docs)}")
if not docs:
    sys.exit(1 if fails else 0)
doc = docs[0]
print(f"     → 의사 선택: {doc.get('name')} / {doc.get('specialty')} ({doc.get('id')})")

# 3) pick_doctor → date_select
print("\n3) pick_doctor → date_select")
st, dt, raw = nav(anon, "pick_doctor", {"department_id": dept["id"], "doctor_id": doc["id"]})
check(st == 200, "nav 200", f"http={st}")
check(dt.get("card_type") == "date_select", "card=date_select", f"card={dt.get('card_type')}")
dates = dt.get("dates") or []
check(len(dates) > 0, "예약 가능 날짜 비어있지 않음", f"n={len(dates)}")
if not dates:
    print("     (예약 가능 날짜 0 — 슬롯 미생성/기간밖일 수 있음. 시간 단계 건너뜀)")
else:
    d0 = dates[0]
    print(f"     → 날짜 선택: {d0.get('label')} ({d0.get('date')})")

    # 4) pick_date → time_select
    print("\n4) pick_date → time_select")
    st, tm, raw = nav(anon, "pick_date",
                      {"department_id": dept["id"], "doctor_id": doc["id"], "date": d0["date"]})
    check(st == 200, "nav 200", f"http={st}")
    check(tm.get("card_type") == "time_select", "card=time_select", f"card={tm.get('card_type')}")
    cands = tm.get("candidates") or []
    check(len(cands) > 0, "시간 후보 비어있지 않음", f"n={len(cands)}")
    if cands:
        c0 = cands[0]
        print(f"     → 시간 후보 예: {c0.get('label')} slot={c0.get('slot_id')}")

# 5) 늦은 관문(④): pick_target을 Bearer 없이 → 401
print("\n5) 늦은 관문 — pick_target(Bearer 없음) → 401 기대")
st, _, raw = nav(anon, "pick_target",
                 {"department_id": dept["id"], "doctor_id": doc["id"],
                  "slot_id": str(uuid.uuid4()), "for_patient_id": str(uuid.uuid4())})
check(st == 401, "로그인 전 대상 선택 차단(401)", f"http={st}")

print("\n=== 결과 ===")
if fails:
    print(f"  ❌ 실패 {len(fails)}건: {fails}")
    sys.exit(1)
print("  ✅ 전 단계 통과 (진료과→의사→날짜→시간 + 관문 401)")
