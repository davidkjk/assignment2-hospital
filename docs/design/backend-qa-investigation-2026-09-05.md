# 백엔드/클라우드 QA 조사 보고 — 2026-09-05 (환자앱 실기기 검수 I 그룹)

> 브랜치 `qa/backend-investigation`. 조사는 **읽기·실측 위주**(라이브 클라우드 DB 변경 없음, 라이브 배포 없음).
> 라이브 실측 시각 ≈ 2026-09-06 09:00~09:30 KST(DB `now()` UTC 기준 2026-09-06 00:1x). 세션 컨텍스트 날짜(2026-09-05)와 하루 차이는 실제 시각이 이미 자정을 넘겼기 때문.
> 실측 대상: 라이브 Railway API `https://gaonhospital-api-production.up.railway.app` · 라이브 Supabase DB(서울, `aws-0-ap-northeast-2`).

각 항목: **[증상] → [원인·근거(파일:줄, 실측값)] → [해결책(최소 패치안)]**. 라이브 반영(배포·DB 변경)은 **코디/사용자 몫**.

---

## #33 ⭐ 오늘 예약이 한국시간 아침 9시(=UTC 자정)에 사라짐 — **원인 확정**

### [증상]
아침엔 오늘 예약이 보이다가 KST 09:00쯤(=UTC 00:00) 오늘/당일 카드가 사라지고 날짜가 하루 넘어감. "자정에 넘어가야 정상."

### [원인·근거]
날짜 경계 쿼리(`patient_appointment_query_service.py:65-66`의 `s.slot_date >= current_date` 등, 그리고 코드 전역의 `current_date` 소비자)가 **UTC 세션에서 평가**된다. `current_date`가 UTC 날짜라 KST 00:00이 아니라 **UTC 00:00(=KST 09:00)** 에 하루가 넘어간다.

- `pool.py:28-29`는 이미 `server_settings={"timezone": "Asia/Seoul"}`로 세션 TZ를 KST로 **고정하려** 한다. 그러나 이건 **연결 startup 파라미터**인데, **Supabase 풀러(Supavisor)가 이 파라미터를 통째로 버린다.**
- **라이브 실측(2026-09-06)**:
  - 기본 세션 TZ = `UTC`, `current_date` = `2026-09-06`, `now()` = `2026-09-06 00:1x+00`.
  - `PGOPTIONS="-c timezone=Asia/Seoul"`(startup options)로 줘도 → `show timezone` = **UTC**(풀러가 무시).
  - **앱과 동일한 메커니즘**으로 재확인: `asyncpg.create_pool(..., server_settings={"timezone":"Asia/Seoul"})` → `show timezone` = **UTC**. ← `pool.py`의 고정이 라이브에서 **무효**임을 직접 증명.
- 영향범위(세션 TZ에 의존하는 `current_date`/`now()::date` 소비자, `grep`): `patient_appointment_query_service`(65·66), `patient_family_service`(89·163), `patient_service`(121), `patient_history_service`(239), `patient_catalog_service`(46·71), `settings_service`(141·269), `schedule_admin_service`(268), `slot_generator`(43·120), `dashboard_service`(20·186·324·425·687), `appointment_service`(315·321), `schedule_change`(134), `jobs/overdue.py`(자정 부도 배치) 등 **전부**. (`(... at time zone 'Asia/Seoul')::date`처럼 절대 표현으로 쓴 곳 — stats_service·chat 로그·dashboard 일부 — 은 이 버그와 무관.)

### [해결책(최소 패치안)] — ⓐ 권장(구현·검증 완료, 라이브 미배포)
`server_settings`(startup 파라미터, 풀러가 버림) 대신 **매 acquire마다 도는 `setup` 콜백의 런타임 `SET TIME ZONE`**. 런타임 SQL이라 풀러가 일반 쿼리로 전달한다.

- **라이브 실측으로 검증**: `create_pool(..., setup=lambda c: c.execute("SET TIME ZONE 'Asia/Seoul'"))` →
  - acquire #1·#2·#3 전부 `show timezone` = `Asia/Seoul`.
  - 트랜잭션 안 `set local role authenticated`(= `acquire_as` 재현) 안에서도 `Asia/Seoul` 유지.
  - ⚠️ 미묘점: `init`(연결 생성 시 1회) 콜백은 asyncpg가 release 때 도는 **`RESET ALL`** 에 씻겨 재취득 시 UTC로 돌아간다(실측 확인). `setup`은 매 acquire마다 재적용되므로 이 문제를 넘는다.
- **이점**: 이 한 곳이 SQL 함수(`doctor_can_view_*`·`mark_overdue_no_shows` 등) 내부의 `current_date`까지 함께 고친다(같은 세션에서 실행되므로). 쿼리별 재작성(ⓑ)은 DB 함수 내부를 못 고쳐 커버리지가 좁다.
- **트레이드오프**: acquire당 round trip 1회 추가(SET). #3(리전) 해소 전엔 ~230ms, 해소 후엔 ~수십ms로 무시 가능.
- **패치 위치**: `backend/app/db/pool.py`(이 브랜치에 구현·커밋됨).

```python
async def _set_session_tz(conn: asyncpg.Connection) -> None:
    await conn.execute("SET TIME ZONE 'Asia/Seoul'")

_pool = await asyncpg.create_pool(settings.database_url, setup=_set_session_tz)
```

대안 ⓑ(비권장): 각 쿼리를 `(now() at time zone 'Asia/Seoul')::date`로 바꾸기 — ~15개 소비처 + DB 함수까지 손대야 하고 DB 함수 내부 `current_date`는 못 고쳐 누락 위험.

> ⚠️ **라이브 반영**: 코드 패치는 Railway 재배포 필요(push→자동배포). 배포 후 라이브 세션 TZ가 KST인지 재확인.

---

## #35 앱 AI 상담이 답을 안 함 — **원인 확정(브리핑 가설과 다름)**

### [증상]
앱/웹 챗봇이 정보성 질문("진료시간이 어떻게 되나요")에도 답을 못 하고 "직원 연결" 류 폴백만 뜬다.

### [원인·근거] — LLM 키가 아니라 **원격 KB에 조각(kb_chunks)이 0건**
브리핑의 유력 가설은 "LLM 키(ANTHROPIC/OPENAI) 빈값 → 폴백"이었으나 **실측 결과 키는 라이브에서 정상 작동**하고, 진짜 원인은 **RAG가 검색할 대상(kb_chunks)이 비어 있음**이었다.

- **라이브 원격 DB 실측**: `kb_documents` = **27**, `kb_chunks` = **0**, `kb_chunks(embedding not null)` = **0**. (`match_kb_chunks`·`match_kb_chunks_hybrid` 함수는 존재 = 마이그 00084 적용됨.) 즉 검색 대상 자체가 없다.
- **왜 0인가**: `supabase/seed_kb_bulk.sql` 헤더 주석 명시 — "⚠️ 조각(kb_chunks)은 심지 않는다(임베딩 필요) — OpenAI 키 확보 후 **재임베딩(approve 재실행 또는 reembed 배치)**해야 실제 검색이 된다. 지금은 문서만 대량 적재." → **원격에서 이 재임베딩 단계가 실행되지 않았다.** (메모리 [[project-rag-hybrid-and-bulk-kb]]의 "원격 반영 3스텝 = 사용자 db push+bulk적재+재임베딩" 중 마지막 단계 누락.)
- **RAG 흐름 근거**: `rag_service.rag_answer:43` — `if not chunks or max(...) < HYBRID_FLOOR: return {"no_answer": True}`. chunks가 0이면 **모든 질문이 no_answer**. `orchestrator.orchestrate`가 no_answer면 안내 칩 폴백을 낸다.
- **LLM 키가 정상임을 증명(라이브 end-to-end)**:
  - `chat_flow_service:62`의 `orchestrate` 호출에 **try/except가 없다** → LLM/임베딩이 예외를 던졌으면 HTTP 500이 났을 것.
  - 실제 라이브 익명 세션에 "진료시간…" 전송 → **HTTP 200 + `route_taken:no_answer`**(8.3s). classify(Anthropic LLM)·embedding(OpenAI)·escalation 감시가 **모두 성공적으로 실행**됐다는 뜻(실패면 500).
  - 증상 질문("머리가 아프고 어지러운데 어느 과…") → **HTTP 200 + `route_taken:handoff`, reason `medical_judgment`**(3.5s) = `safety_watchdog.check_escalation`의 LLM이 실제로 판단을 내렸다.
- ⚠️ 참고: `backend/.env.railway`의 ANTHROPIC/OPENAI 값은 길이 33(로컬 플레이스홀더). 하지만 위 end-to-end 성공이 **라이브 Railway엔 유효한 키가 있음**을 증명한다(옛 핸드오프의 "빈값" 기록은 낡음).

### [해결책(최소 패치안)] — 원격 재임베딩 배치 실행(코드 수정 아님, 사용자/코디가 원격 DB에 실행)
approved 문서(원격 23건)를 순회하며 기존 `kb_service._reembed`(제목 포함 임베딩)로 kb_chunks를 채운다. **라이브 DB 변경이라 조사 범위 밖 — 아래 스크립트를 사용자/코디가 실행.**

`backend/scripts/reembed_kb.py`(신규, 이 브랜치엔 미포함 — 하네스 정책상 아래 코드로 제시):

```python
"""#35 — KB 재임베딩 배치(원격 kb_chunks 채우기)."""
import argparse, asyncio
from app.core.config import settings
from app.db.pool import get_pool, close_pool
from app.integrations.embedding_client import EmbeddingClient
from app.services.chat import kb_service

async def run(status: str, dry_run: bool) -> None:
    if not settings.openai_api_key:
        raise SystemExit("OPENAI_API_KEY 비어 있음 — 재임베딩엔 실제 임베딩 호출 필요.")
    embedder = EmbeddingClient(settings.openai_api_key)
    pool = await get_pool()
    async with pool.acquire() as conn:
        docs = await conn.fetch(
            "select id, title from kb_documents where status=$1 order by created_at", status)
    print(f"대상 문서 {len(docs)}건(status={status}).")
    if dry_run:
        for d in docs: print("  -", d["id"], d["title"])
        return
    for i, d in enumerate(docs, 1):
        async with pool.acquire() as conn:
            content = await conn.fetchval("select content from kb_documents where id=$1", d["id"])
            async with conn.transaction():
                await kb_service._reembed(conn, d["id"], content, embedder)
                n = await conn.fetchval("select count(*) from kb_chunks where document_id=$1", d["id"])
        print(f"  [{i}/{len(docs)}] {d['title']} → {n} chunks")
    async with pool.acquire() as conn:
        print("완료 — kb_chunks 총", await conn.fetchval("select count(*) from kb_chunks"), "건.")

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", default="approved")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    try: asyncio.run(run(a.status, a.dry_run))
    finally: asyncio.run(close_pool())

if __name__ == "__main__":
    main()
```

실행(원격, 사용자):
```bash
cd backend && set -a && source .env.railway && set +a   # 유효한 OPENAI_API_KEY 확인
.venv/bin/python -m scripts.reembed_kb --dry-run          # 대상 23건 확인
.venv/bin/python -m scripts.reembed_kb                    # 실제 임베딩
```
검증: 실행 후 `select count(*) from kb_chunks`가 0이 아니어야 하고, 라이브 챗봇에 "진료시간…"이 실제 안내로 답해야 한다.

> ⚠️ 이 스크립트는 `DATABASE_URL`이 가리키는 DB의 kb_chunks를 삭제+삽입한다. 로컬 공용 DB엔 돌리지 말 것(OpenAI 비용). 원격 KB 문서가 뒤처졌으면 `db push`+`seed_kb_bulk.sql`(문서 적재) 먼저.

---

## #11 비밀번호 변경해도 옛 비번으로 로그인됨 — **판정: 재시드 착시(진짜 인증 버그 아님)**

### [증상]
환자앱에서 비번 변경 후에도 옛 비번(demo1234)으로 로그인 성공.

### [원인·근거]
비번 변경 **코드 경로는 정상**이고, "옛 비번이 다시 통함"은 **데모 재시드가 비번을 DEMO_PASSWORD로 되돌리기** 때문이다.

- **변경 경로 두 개 모두 Supabase Auth에 실제 반영됨**:
  - 설정 내 변경 `patient_app/.../settings_password_screen.dart:24` → `auth.updateUser(UserAttributes(password: pw))`(GoTrue 직접 갱신). 성공하면 옛 비번 무효. 실패 시 예외를 잡아 오류 표시(`:51-54`) — **조용한 성공 아님**.
  - 비번찾기 재설정 `password_reset_service.verify_name_and_reset:40` → `admin.update_user_by_id(uid, {"password": ...})`(Admin API 갱신). 역시 정상 반영.
- **재시드가 비번을 되돌린다(핵심 근거)**: `supabase/seed_demo_patient.sh:133-140` — 주석 "생성/기존 경로 **무관하게** 비밀번호(DEMO_PASSWORD)·phone_confirm을 **항상 보장**한다(멱등)" + `curl -X PUT .../admin/users/$UID -d '{"password":"$DEMO_PASSWORD",...}'`. 즉 원격 재시드("그날 날짜로 데모 데이터 깔기", `seed-demo-remote.sh`가 이 스크립트를 자동 호출)를 돌릴 때마다 **김바이 비번이 DEMO_PASSWORD로 리셋**된다. 사용자가 바꾼 비번은 재시드 후 사라지고 "옛 비번(demo1234)"이 다시 통한다 → **착시**.
- **라이브 실측 정합**: 원격 `auth.users`에 `821076017654`(김바이) 존재, `last_sign_in_at`=2026-09-06 00:01(=KST 09:01, 오늘) — 최근 로그인 성공. 그런데 **지금 demo1234 로그인은 실패**(`invalid_credentials`). 즉 현재 비번은 demo1234가 아니다 = **비번 변경이 실제로 먹혔고, 최근 재시드 반전이 없었다는 방증**. 재시드를 돌렸다면 지금 demo1234가 통했을 것.

### [해결책]
- **코드 수정 불필요**(인증 계층에 비번 잔존 취약점 없음).
- 데모 운영 권고: 비번 변경을 시연·검증한 뒤에는 **재시드를 돌리지 말 것**(재시드가 비번을 초기화). 반대로 데모를 초기 상태로 되돌리려면 재시드가 의도된 동작.
- (선택) 재시드가 **이미 존재하는 사용자엔 비번을 건드리지 않게** 바꿀 수도 있으나, 그러면 데모 계정 비번을 잊었을 때 잠기는 트레이드오프가 있다 → 사용자 결정 사항.

---

## #3 페이지 전환 시 항상 로딩 느림 — **원인 확정: 컴퓨트가 사용자·DB 양쪽에서 멀다(지리적 배치)**

### [증상]
환자앱에서 화면을 넘길 때마다 데이터 로딩이 느림(콜드스타트 뿐 아니라 웜에서도).

### [원인·근거] — Railway 컴퓨트(암스테르담) ↔ Supabase DB(서울) 대륙 간 왕복
- **DB 위치 = 서울**: pooler 호스트 `aws-0-ap-northeast-2.pooler.supabase.com`(ap-northeast-2 = 서울). 확정.
- **API 컴퓨트 위치 = 암스테르담(ams)**: 배포 핸드오프 기록(`HANDOFF-deployment.md`: "region ams"). 라이브 응답 헤더 `x-railway-edge: ord1`(시카고 edge).
- **라이브 응답시간 실측**:
  - `/health`(DB 무접촉) 웜 5회: total ~0.42~0.46s, **connect ~0.065s(사용자→edge TLS)인데 ttfb ~0.43s** → edge↔컴퓨트 왕복+처리에 ~0.36s. 컴퓨트가 edge에서 멀다.
  - `/chat/sessions`(DB write 다건, LLM 없음) 웜 5회: ttfb ~1.12s(첫 1.76s). **/health 대비 +~0.69s가 DB 쿼리 몫**, 쿼리당 약 **~0.23s**.
  - `~0.23s/쿼리`는 **암스테르담↔서울 RTT(~230ms)와 정확히 일치**. 즉 API의 매 DB 쿼리가 대륙을 왕복한다.
- 결론: 한 요청이 **① 사용자(한국)→컴퓨트(EU) 긴 홉 + ② 컴퓨트→서울 DB 왕복 × (요청당 순차 쿼리 수)** 를 낸다. 한 화면이 2~3개 엔드포인트를 부르고 각 엔드포인트가 여러 쿼리를 순차로 돌면 초 단위로 누적 → "항상 느림". **콜드스타트가 주원인 아님**(웜도 ~1.1s+, Junjin 계정=크레딧 있어 free 슬립 아님). RLS-only 쿼리 트랩([[project-rls-only-query-perf-trap]])도 확인했으나 환자 목록 쿼리는 명시적 `patient.id($1)` 필터가 있어 이번 지연의 주원인은 아님 — 주원인은 리전.

### [해결책(최소 패치안)] — Railway 서비스 리전을 아시아로 이전(코드 아님, 인프라)
- **권장**: Railway `gaonhospital-api`(및 cron 서비스들)의 리전을 **DB에 가장 가까운 아시아 리전**(예: Singapore `asia-southeast1`)으로 옮긴다. 그러면 컴퓨트↔서울 DB 왕복이 ~230ms → ~30~50ms로 급감하고, 한국 사용자→컴퓨트 홉도 암스테르담보다 훨씬 짧아진다. **가장 큰 레버.**
  - 방법: Railway 대시보드 서비스 Settings→Region 변경 후 재배포(사용자/코디, Junjin 계정). ⚠️ 리전 변경 시 env·빌더(NIXPACKS)·rootDir(backend)·cron 스케줄 재확인(핸드오프의 배포 함정 참조).
- **보조(코드, 선택)**: 요청당 순차 쿼리 수를 줄이기(한 요청에서 여러 `pool.acquire()`를 도는 서비스는 한 커넥션·한 왕복으로 묶기), 홈 화면이 부르는 엔드포인트 병합. 리전 이전 대비 효과는 작다.

> ⚠️ 라이브 반영(리전 이전·재배포)은 사용자/코디 몫. 이전 후 `/chat/sessions` 웜 ttfb가 크게 줄면 확인됨.

---

## 완료 판정
1. 보고서: 이 파일(4건 [증상]→[원인·근거]→[해결책]).
2. 커밋: 이 보고서 + #33 최소 패치(`backend/app/db/pool.py`, setup 콜백)를 `qa/backend-investigation`에 커밋. **라이브 배포·DB 변경 없음.**
3. 코디 보고: 완료 후 알림.

### 라이브 반영 대기(코디/사용자)
- **#33**: pool.py 패치 배포(Railway 재배포) → 라이브 세션 TZ=KST 확인.
- **#35**: 원격 재임베딩 배치 실행 → `kb_chunks` > 0 + 라이브 챗봇 실답변 확인.
- **#11**: 코드 수정 없음. 재시드 타이밍 운영 주의(비번 변경 검증 후 재시드 금지).
- **#3**: Railway 리전 아시아 이전 + 재배포.
