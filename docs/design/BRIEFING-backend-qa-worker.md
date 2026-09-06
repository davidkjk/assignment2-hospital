# 워커 브리핑 — 백엔드/클라우드 QA 조사 (환자앱 실기기 검수 I 그룹)

당신은 **가온병원 시스템의 백엔드 조사 워커**입니다. 코디네이터(다른 창)가 환자앱 UI를 고치는 동안, 당신은 **백엔드·클라우드 원인 조사 4건**만 맡습니다. 아래를 순서대로 따르세요.

## 0) 이 프로젝트가 뭔가 (한 줄)
가온병원 예약·사전문진·AI상담 시스템. 백엔드=FastAPI + Supabase(Postgres, RLS). 클라우드 배포=Railway(백엔드 API·cron) + Supabase(DB/Auth). 환자앱=Flutter(당신은 **안 건드림**).

## 1) 세션 시작 규칙 (먼저 읽기)
작업 전 반드시 이 순서로 읽어 맥락을 잡으세요:
1. `HANDOFF.md` (허브 — 트랙 공용 상태·함정)
2. `HANDOFF-deployment.md` (배포/클라우드 현황 — Railway·Supabase·cron·env, 특히 상단 「지금 상태」)
3. `docs/design/patient-app-device-qa-2026-09-05.md` (이번 검수 체크리스트 — **I 그룹**이 당신 몫)

## 2) 배경 사실 (차갑지 않게)
- **클라우드 자격**: `backend/.env.railway`(gitignore, 값 채워져 있음)에 라이브 Railway `DATABASE_URL`·`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 등이 있습니다. 이걸 source 하면 라이브 조사 가능.
- **라이브 Railway API**: `https://gaonhospital-api-production.up.railway.app`
- **psql**: `/opt/homebrew/opt/libpq/bin/psql` (PATH 미등록, 직접 경로). 조회 시 **`PGTZ=Asia/Seoul`** 붙일 것.
- **데모 환자 계정**: `010-7601-7654`/`demo1234`(김바이, 전화 `+821076017654`). 로그인=Supabase `signInWithPassword(phone,pw)`.
- ⚠️ **공용 로컬 DB에 `pytest` 금지**(teardown이 시드 통째 삭제). 조사는 **읽기 위주**. 라이브 클라우드 DB는 **변경 금지**(조회만).
- ⚠️ **`patient_app/**` 절대 손대지 말 것**(코디가 UI 담당). 당신 경계 = `backend/**` + 클라우드 설정 조사.

## 3) 격리 (워크트리)
코디와 git 인덱스가 섞이지 않게 **별도 워크트리**에서 작업하세요:
```
cd /Users/kimjunkee/dev/vcu/assignment2-hospital
git worktree add /Users/kimjunkee/dev/vcu/assignment2-hospital-bequa -b qa/backend-investigation merge/design-integration
cd /Users/kimjunkee/dev/vcu/assignment2-hospital-bequa
```
(워크트리엔 `HANDOFF*.md`·`.env.railway`가 gitignore로 없을 수 있음 → 읽기·source는 원본 경로 `/Users/kimjunkee/dev/vcu/assignment2-hospital/backend/.env.railway`에서.)

## 4) 조사 과제 4건 (원인+근거+해결책을 보고)

### #33 ⭐ 오늘 예약이 한국시간 아침 9시(=UTC 자정)에 사라짐
- 증상: 아침엔 오늘(9/5) 예약이 많이 보이다가, **한국시간 09:00쯤(=UTC 00:00) 오늘 예약이 사라짐.** 사용자는 "자정에 넘어가야 정상"이라 지적.
- 유력 원인: `backend/app/services/patient_appointment_query_service.py:65-66`의 **`current_date`가 UTC 경계**로 계산됨(연결 세션 TZ가 UTC면 09:00 KST에 날짜가 넘어감).
- 할 일: 라이브 Railway Postgres **세션 TZ 실측**(`show timezone;`, `select current_date, now();` — `.env.railway`의 DATABASE_URL로 psql). UTC면 그게 원인 확정. 코드 전역에서 `current_date`/`now()::date` 쓰는 곳 grep해 영향범위 파악.
- 해결책 후보: ⓐ DB 연결 세션 TZ를 `Asia/Seoul`로(asyncpg 연결 시 `server_settings={'timezone':'Asia/Seoul'}` 또는 Railway `PGTZ`/`TZ` env) ⓑ 쿼리에서 `(now() at time zone 'Asia/Seoul')::date`로 명시. **어느 쪽이 부작용 적은지** 판단해 최소 패치 제안(적용은 코디 승인 후).

### #11 비밀번호 변경해도 옛 비번으로 로그인됨 (보안)
- 증상: 환자앱에서 비번 변경 후에도 **옛 비번으로 로그인 성공**.
- 할 일: 환자 비번 변경 경로를 찾아(백엔드 라우터/서비스 or Supabase Auth 위탁인지) **실제 Supabase Auth에 반영되는지** 확인. 데모 계정이 **주기적 재시드로 초기화**되는지도 확인(seed_demo_patient가 비번을 demo1234로 되돌리는지 — 크론/재시드 타이밍). 라이브에서 재현: 비번 변경 API 호출 후 옛/새 비번 각각 `signInWithPassword` 시도.
- 보고: 진짜 버그인지 vs 재시드 착시인지 판정 + 근거.

### #35 앱 AI 상담이 답을 안 함
- 사실: 앱 chat은 스텁 아님 — `patient_app`이 백엔드 `/chat/*`를 실제 호출(코디 확인함). 
- 유력 원인: 라이브 Railway에 **`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`가 빈값**이라 봇이 폴백(무응답).
- 할 일: Railway 서비스(gaonhospital-api) env에 LLM 키 유무 확인(`railway variables` 또는 대시보드/`.env.railway`). 빈값이면 그게 원인. 라이브 `/chat/*`에 익명 세션으로 질문 1건 던져 실제 응답/폴백 확인(`chat.py` 라우트 경로·바디 형식 코드에서 확인 후). 키 채우면 되는지 vs 다른 배선 문제인지 보고.

### #3 페이지 전환 시 항상 로딩 느림
- 할 일: 원인 후보 규명 — ⓐ Railway 콜드스타트/무료플랜 슬립 ⓑ 느린 쿼리(⚠️ 참고: 이 프로젝트에 **RLS-only 쿼리 성능 함정** 이력 있음 — doctor_id 명시 필터 없이 RLS에만 의존하면 care-continuity 서브쿼리가 병원 전체 행마다 돌아 8.6s 걸린 사례. `backend`에서 유사 패턴 grep) ⓒ N+1/이미지. 라이브 주요 엔드포인트(`/my/appointments`·`/my/history`·`/catalog/...`) 응답시간 실측(curl `-w '%{time_total}'`, 인증 토큰은 데모계정 로그인 토큰). 가장 느린 곳 + 원인 + 개선안 보고.

## 5) 완료 판정 (3겹)
1. **보고서 파일**: `docs/design/backend-qa-investigation-2026-09-05.md`에 4건 각각 **[증상]→[원인·근거(파일:줄, 실측값)]→[해결책(최소 패치안)]** 기록.
2. **커밋**: 조사 보고서(+ 원인 확정 후 최소 코드패치가 있으면)를 `qa/backend-investigation` 브랜치에 커밋. ⚠️ 라이브 배포·DB 변경은 **하지 말 것**(코디/사용자 몫).
3. **코디에게 보고**: 끝나면 "백엔드 조사 4건 완료, 보고서=docs/design/backend-qa-investigation-2026-09-05.md"라고 이 창(코디)에 알림.

막히면 추측하지 말고 원문 grep/실측으로 확인. 결정이 필요하면 코디에게 물으세요.
