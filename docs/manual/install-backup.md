# 설치·백업 안내서 (개발자·운영자용)

> 이 문서는 시스템을 **처음부터 새 계정에 설치**하고, **매일 백업이 실제로 복구되는지**까지 확인하는 절차입니다.
> 지금 시연 환경은 시연용 계정(iansoft Vercel · Junjin Railway · gaonhospital Supabase)에 올라가 있고,
> 실제 납품 때는 **병원이 자기 계정을 만들어 이 문서대로 새로 설치**하는 것을 권장합니다(방법 ②, 아래).

---

## 0. 전체 구성도

```
[환자 앱(Flutter)]  [직원 웹(React/Vite)]  [상담봇 webchat(React/Vite)]
        │                    │                        │
        │  (native, CORS 없음) │  same-origin 프록시      │  same-origin 프록시
        │                    ▼ (Vercel rewrite)        ▼ (Vercel rewrite)
        └──────────────►  [백엔드 API (FastAPI, Railway)]  ◄────────┘
                                      │
                                      ▼
                         [Supabase (PostgreSQL + Auth + Storage)]
                                      ▲
                    [Railway cron 3종: 리마인더·백업·자정부도]
```

- **직원 웹·webchat → 백엔드**: 브라우저가 백엔드를 직접 부르지 않고, 자기 도메인(`/me`, `/chat/...`)으로 부르면
  Vercel의 `vercel.json` rewrite가 백엔드로 넘깁니다(**same-origin 프록시**). 그래서 브라우저 CORS 설정이 필요 없습니다.
- **환자 앱 → 백엔드**: 모바일 네이티브라 CORS 자체가 없습니다.
- **문자(전화 OTP)**: Supabase의 Send SMS Hook 엣지 함수가 SOLAPI로 발송합니다.

### 지금 시연 환경 주소

| 구성 | 주소 |
|---|---|
| 직원 웹 | https://gaonhospital-staff.vercel.app |
| 상담봇 webchat | https://gaonhospital-webchat.vercel.app |
| 백엔드 API | https://gaonhospital-api-production.up.railway.app |
| Supabase 프로젝트 | ref `eebhfnguwdjdusafrain` (region 서울) |

---

## 1. 병원 계정으로 옮기는 두 가지 방법

- **방법 ① 소유권 이전(transfer)**: Vercel·Railway·Supabase 모두 "프로젝트를 다른 팀/계정으로 넘기기" 기능이 있습니다.
  만든 것을 그대로 병원 계정으로 이동 — 주소·데이터가 유지돼 가장 빠릅니다. 단, 결제 주체·권한이 얽혀 있으면 정리가 필요합니다.
- **방법 ② 병원 계정에서 새로 설치(권장)**: 병원이 자기 Vercel·Railway·Supabase 계정을 만들고, **같은 소스코드**를 아래 2~5절대로 새로 배포합니다. 시연 데이터와 완전히 분리되고 결제·보안이 깔끔합니다. **이 문서의 2~6절이 곧 방법 ②의 설치 절차**입니다.

---

## 2. Supabase (데이터베이스 · 인증 · 저장소)

1. **프로젝트 생성**: supabase.com → New Project(region은 서울 `ap-northeast-2` 권장). DB 비밀번호를 안전하게 보관.
2. **마이그레이션 적용**(현재 **71개**):
   ```bash
   supabase link --project-ref <새 ref>
   supabase db push          # supabase/migrations/*.sql 71개를 원격에 순서 적용
   ```
   확인: 테이블이 생겼는지 REST로 점검(대부분 401=RLS 정상이면 OK). 마이그레이션 파일을 **커밋만 하고 적용을 안 하면** 테이블이 없습니다 — `db push`가 실제 적용 단계입니다.
3. **Auth 설정**(대시보드 → Authentication):
   - **Phone provider ON** — 전화 OTP 로그인용. OTP 만료 300초·6자리.
   - 전화 문자 실발송은 **Send SMS Hook**을 켜고, 엣지 함수 `supabase/functions/send-sms-hook`를 배포한 뒤,
     Edge Function secrets에 `SOLAPI_API_KEY`·`SOLAPI_API_SECRET`·`SOLAPI_SENDER_NUMBER`·`SEND_SMS_HOOK_SECRET` 입력.
     (`SEND_SMS_HOOK_SECRET`=대시보드 Send SMS Hook의 `v1,whsec_...` 원문. SOLAPI 키는 IP 제한을 꺼둘 것.)
   - **Email provider ON** — 직원 이메일+비밀번호 로그인용.
4. **Storage 버킷 2개**:
   - `backups` (**private**) — 매일 DB 백업이 올라가는 곳.
   - `doctor-photos` (**public**) — 의사 사진(마이그레이션이 이미 생성).
5. **API 키 확인**(Project Settings → API): `anon key`(공개, 프론트에 심음)·`service_role key`(비밀, 서버 전용)·`JWT secret`.

---

## 3. Railway (백엔드 API + 크론)

1. **New Project → Deploy from GitHub** `davidkjk/assignment2-hospital`, Branch `merge/design-integration`.
2. **Settings → Root Directory = `backend`**. (CLI엔 이 옵션이 없어, 필요 시 Railway GraphQL `serviceInstanceUpdate(rootDirectory:"backend")`로 설정.)
3. 빌드 = NIXPACKS(`backend/railway.json`). `backend/nixpacks.toml`이 `postgresql_16`을 설치 — **백업 크론의 `pg_dump`에 필수**.
4. **환경변수**(아래 4절 표 전체). Start Command는 `railway.json`의 uvicorn.
5. **크론 서비스 3개 만들기** — cron(크론)은 "정해진 시각에 명령을 한 번 돌리고 꺼지는 작은 일꾼"입니다. 아래 과정을 **3번 반복**합니다.

   | 서비스 이름 | Cron Schedule | Start Command | 의미 |
   |---|---|---|---|
   | `cron-reminders` | `0 23 * * *` (KST 08:00) | `python -m app.jobs.reminders` | 예약 리마인더·문진 안내 |
   | `cron-backup` | `0 18 * * *` (KST 03:00) | `python -m app.jobs.backup` | DB 백업(pg_dump→Storage, 14일 보관) |
   | `cron-overdue` | `0 15 * * *` (KST 00:00 자정) | `python -m app.jobs.overdue` | 어제자 예약확정 미도착 부도 처리 |

   > ⏰ Cron 시각은 **UTC 기준**이라 한국시간(KST)보다 9시간 빠릅니다. `0 23`=UTC 23시=**KST 08:00**.

   **① 서비스 생성**: 프로젝트 캔버스 오른쪽 위 **`+ Create`** → **`GitHub Repo`** → `davidkjk/assignment2-hospital`. 새 상자가 생깁니다.

   **② 새 상자 클릭 → `Settings` 탭**:
   - `Service` 섹션 **Name** → `cron-reminders`(등)로 변경.
   - `Source` 섹션 → **Branch** `merge/design-integration`, **Root Directory** `backend`. ⚠️ Root Directory를 `backend`로 안 하면 저장소 최상위에서 빌드하려다 실패합니다.
   - `Deploy` 섹션(아래로 스크롤) → **Custom Start Command**에 `python -m app.jobs.reminders`, **Cron Schedule**에 `0 23 * * *` 입력. (Cron Schedule 칸에 값을 넣으면 "이 서비스는 상시 서버가 아니라 이 시각에 한 번 돌고 꺼지는 일꾼"이 됩니다.)

   **③ 환경변수(Variables)** — 크론도 백엔드와 **같은 env 11개**가 필요합니다(4절 표). 두 방법:
   - **방법 A(추천): 프로젝트 공용 변수(Shared Variables)** — 프로젝트 `Settings → Shared Variables`(환경 `production`)에 11개를 **한 번만** 넣고 모든 서비스가 공유.
   - **방법 B: 참조** — 크론 서비스 `Variables` 탭 → **`Add Reference`** → `gaonhospital-api` 선택 → `${{ gaonhospital-api.DATABASE_URL }}` 형태로 백엔드 값을 그대로 참조.
   - 백업 크론은 특히 `DATABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`BACKUP_BUCKET`이 꼭 있어야 합니다.

   **④ 저장 → 자동 배포**: 설정을 바꾸면 Railway가 새로 빌드합니다. `Deployments` 탭에 초록색 Success면 OK(빌드 때 `nixpacks.toml` 덕에 백업용 `pg_dump`도 설치됨).

   **⑤ 바로 시험(Run now)**: 각 크론 서비스 → **`Run now`**(수동 실행) → `Logs`에서 결과 한 줄 확인:
   - 리마인더: `[reminders] {'reminder_today': N, ...}`
   - 백업: `[backup] uploaded backup-YYYY-MM-DD.sql.gz` (+ Storage `backups`에 파일)
   - 자정 부도: `[overdue] marked N no-show(s)`

   > 발송·만료 크론(`python -m app.jobs.dispatch`, 5분 주기)은 상담봇 예약 백엔드(⑦) 배선 후 추가합니다 — 현재 미구현.

6. **배포 검증**:
   ```bash
   curl -i https://<railway>/health            # 200 {"status":"ok"}
   curl -i https://<railway>/me                # 401 (미인증 차단)
   ```

---

## 4. 환경변수 전체 목록 (백엔드)

`backend/app/core/config.py`가 읽는 이름 그대로입니다(대문자=환경변수). **실제 값은 플랫폼에만 저장하고, 저장소엔 커밋하지 않습니다.**

| 이름 | 어디서 얻나 / 값 | 비고 |
|---|---|---|
| `SUPABASE_URL` | Supabase Settings → API (Project URL) | |
| `SUPABASE_ANON_KEY` | 〃 (anon public) | 프론트에도 동일 값 |
| `SUPABASE_SERVICE_ROLE_KEY` | 〃 (service_role, 비밀) | 백업 Storage 업로드에 사용 |
| `SUPABASE_JWT_SECRET` | 〃 (JWT secret) | 토큰 검증(HS256) |
| `DATABASE_URL` | Supabase Connection Pooler(세션모드 **5432**) + DB 비밀번호 | ⚠️ RLS 우회 역할로 접속(배치가 이 전제 위에서 동작). asyncpg라 **6543(트랜잭션 모드) 금지** |
| `SESSION_TIMEOUT_MINUTES` | `30` | 직원 무활동 세션 만료 |
| `STAFF_WEB_ORIGIN` | 직원 웹 주소(http(s)만, 경로 없이) | 비밀번호 재설정 링크 복귀용. 비면 링크 미발송(fail-closed) |
| `ANTHROPIC_API_KEY` | Anthropic 콘솔 | 비우면 상담봇 stub |
| `OPENAI_API_KEY` | OpenAI 콘솔 | 임베딩/RAG. 비우면 stub |
| `CHAT_MODEL` | `claude-sonnet-5` | |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | |
| `ANON_RATE_LIMIT_PER_HOUR` | `30` | 익명 상담 한도(현재 미배선=⑦) |
| `ANON_CONTACT_ENCRYPTION_KEY` | Fernet base64 키 생성 | 익명 상담 연락처 암호화 |
| `BACKUP_BUCKET` | `backups` | |
| `ALLOWED_ORIGINS` | 직원웹·webchat Vercel 도메인(콤마구분) | **same-origin 프록시라 지금은 비워도 동작** |

**문자/푸시 제공자**(별도 위치):
- 전화 OTP → **Supabase Edge Function secrets**: `SOLAPI_API_KEY`·`SOLAPI_API_SECRET`·`SOLAPI_SENDER_NUMBER`·`SEND_SMS_HOOK_SECRET`.
- 알림 문자/푸시 outbound → `TWILIO_*`·`FCM_SERVICE_ACCOUNT_JSON`(현재 코드 미소비, 7C 배선 시).

---

## 5. Vercel (직원 웹 + 상담봇 webchat)

프로젝트 2개. **CLI 업로드 방식**(GitHub 자동배포 대신):

```bash
# 직원 웹
npx vercel deploy --prod --yes --cwd frontend \
  --build-env VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-env VITE_SUPABASE_ANON_KEY=<anon key>
# 상담봇 webchat (같은 방식, --cwd webchat)
```

- Framework = Vite, Root Directory = `frontend` / `webchat`.
- env 2개: `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`(프로젝트에 영구 저장하면 재배포 시 `--build-env` 불필요).
- **API 주소 변수는 없습니다** — `vercel.json`의 rewrite가 백엔드(Railway)로 넘깁니다. 새 계정으로 옮길 땐 `frontend/vercel.json`·`webchat/vercel.json`의 `destination` Railway 주소를 새 백엔드 주소로 바꾸세요.
- ⚠️ 프록시 함정: `vercel.json`의 API rewrite는 `/:seg/:path+`(`:path+`=1개 이상)여야 합니다. `:path*`(0개 이상)로 하면 `/me` 같은 단일 경로가 `/me/`가 되어 FastAPI가 307 리다이렉트를 냅니다.

---

## 6. 데모 데이터 시드

```bash
# 원격 대상 (PGTZ=Asia/Seoul 필수 — UTC면 '내일'이 '오늘'로 밀림, ON_ERROR_STOP=1로 부분실패 방지)
bash supabase/seed-demo-remote.sh
```
- 직원 11 · 환자 154 · 예약/진료기록/문진/티켓/AI세션/지식문서 등 시연용 데이터가 들어갑니다.
- 끝에서 `seed_demo_patient.sh`가 자동 호출돼 **환자 앱 데모 계정 `010-1234-5678`/`demo1234`**(전화 인증 + 풍부한 데이터)를 생성합니다.
- 계정 목록은 `supabase/demo_accounts.md` 참고. 실운영 전환 시 이 데모 계정들은 삭제하세요.

---

## 7. 백업 구조와 복구 절차 (필수 — 복원 안 되는 백업은 백업이 아님)

- **구조**: 매일 **03:00 KST** 백업 크론이 `pg_dump`로 전체 DB를 떠서 gzip으로 압축, Supabase Storage `backups` 버킷에 `backup-YYYY-MM-DD.sql.gz`로 올립니다. **14일**이 지난 파일은 자동 삭제.
- **수동 확인**: Railway 백업 크론 "Run now" → 로그에 `[backup] uploaded backup-....sql.gz` → Storage `backups`에 파일 확인.

### 복구 리허설 (배포 직후 1회 + 정기)

```bash
# 1) 최신 백업 다운로드 (Supabase 대시보드 Storage 또는 CLI)
# 2) 로컬(또는 임시) DB에 복원
createdb restore_rehearsal
gunzip -c backup-<날짜>.sql.gz | psql restore_rehearsal
# 3) 행 수 검증 — 원격과 대략 일치해야 함
psql restore_rehearsal -c "select count(*) from appointments; select count(*) from medical_records;"
# 4) 정리
dropdb restore_rehearsal
```
Expected: 복원된 행 수가 원격(백업) DB와 일치.

**실제 리허설 결과 (2026-09-03 검증)**: 원격 백업(`backup-2026-09-03.sql.gz`, 3.2MB)을 격리된 임시 DB에 복원한 결과 **백업 행 수 = 복원 행 수 정확히 일치** — appointments 10,534 · medical_records 8,465 · patients 160 · staff 10. 복원 중 에러 2건(`permission denied to set parameter "log_min_messages"`, `permission denied for table secrets`)은 **Supabase 전용 설정·vault 테이블 관련으로 무해**(공개 스키마 데이터는 완전 복원됨). → **백업이 실제로 복원 가능함을 확인.**

> 참고: 로컬에 pg_dump가 없으면 실행 중인 `supabase_db` 컨테이너 안에서 격리된 별도 DB로 리허설할 수 있다(공용 `postgres` DB는 건드리지 않음):
> ```bash
> docker exec -i <supabase_db 컨테이너> psql -U postgres -c "create database restore_rehearsal;"
> gunzip -c backup-<날짜>.sql.gz | docker exec -i <컨테이너> psql -U postgres -d restore_rehearsal -v ON_ERROR_STOP=0 -q
> docker exec -i <컨테이너> psql -U postgres -d restore_rehearsal -c "select count(*) from appointments;"
> docker exec -i <컨테이너> psql -U postgres -c "drop database restore_rehearsal;"
> ```

---

## 8. 스테이징 환경이 필요해질 때

지금은 **프로덕션 단일 환경**입니다. 스테이징이 필요하면:
1. Supabase 새 프로젝트 + 같은 71개 마이그레이션 적용.
2. Railway 새 프로젝트(같은 repo, 다른 브랜치 가능) + 스테이징 env.
3. Vercel은 프로젝트의 **Preview 배포**(브랜치별)를 스테이징으로 활용 가능.
프로덕션과 **DB·키를 반드시 분리**하세요(스테이징 테스트가 실데이터를 건드리지 않도록).

---

## 9. 앱 빌드·서명 (안드로이드/iOS)

- 스크립트: `patient_app/scripts/build_release.sh apk|appbundle|ipa` (프로덕션 값은 `--dart-define`으로 주입: `API_BASE_URL`·`SUPABASE_URL`·`SUPABASE_ANON_KEY`).
- **안드로이드 keystore는 1회 생성, 암호는 병원이 보관**(분실 시 앱 업데이트 영구 불가). 자세한 절차는 `patient_app/RELEASE.md`.
- **iOS는 Xcode + Apple Developer 계정**으로 서명(대화형). 절차는 `patient_app/RELEASE.md`.
- 산출물(apk/aab/ipa)은 GitHub Release에 첨부(저장소에 바이너리 커밋 금지).

---

> 증상별 1차 점검(웹이 안 열림/로그인 안 됨/알림 안 옴/상담봇 무응답)은 `error-check.md` 참고.
