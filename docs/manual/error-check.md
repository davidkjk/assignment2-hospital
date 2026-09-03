# 오류 확인 안내서 (관리자·운영자용)

> "무언가 안 될 때 **어디를 먼저 보는지**"를 정리한 문서입니다. 개발 지식 없이도 1차 점검이 가능하도록 썼습니다.

---

## 1. 가장 먼저: 관리자 화면 "시스템 오류"

관리자(김관리)로 직원 웹에 로그인 → 좌측 메뉴 **"시스템 오류"**(`/admin/errors`).

- 최근 발생한 오류가 최신순으로 쌓입니다(기간 필터·이어보기 지원). 오래된 기록은 1년 뒤 자동 정리됩니다.
- 각 줄은 **안전 요약만** 보여줍니다(개인정보·비밀키는 자동으로 가려짐).
- **"서비스 장애" 배지**가 붙은 줄은 외부 서비스(문자·상담봇 AI 등) 쪽 문제라는 표시입니다 — 이 경우 앱 자체 버그가 아니라 외부 연동을 점검합니다.
- 이 화면은 **읽기 전용**입니다(여기서 고치는 게 아니라, 무슨 일이 있었는지 파악하는 용도).

> 대부분의 "알림이 안 왔어요 / 상담봇이 답을 안 해요" 류는 여기서 실패 기록을 먼저 확인하면 원인이 보입니다.

---

## 2. 플랫폼별 로그 보는 법

### 2-1. Railway (백엔드 API·크론)
- Railway 프로젝트 → 서비스 선택 → **Deployments / Logs** 탭.
- 백엔드 서비스(`gaonhospital-api`): API 오류·요청 로그.
- 크론 서비스(리마인더·백업·자정부도): 각 서비스 로그에서 실행 결과 한 줄을 확인
  - 리마인더: `[reminders] {'reminder_today': N, ...}`
  - 백업: `[backup] uploaded backup-....sql.gz`
  - 자정 부도: `[overdue] marked N no-show(s)`
- 크론을 지금 당장 돌려보려면 각 크론 서비스의 **"Run now"**.

### 2-2. Vercel (직원 웹·상담봇 webchat)
- Vercel 대시보드 → 프로젝트(`gaonhospital-staff` / `gaonhospital-webchat`) → **Deployments** → 최신 배포 → **Logs / Runtime Logs**.
- 화면이 하얗게 뜨거나 안 열리면 여기서 빌드 실패 여부를 먼저 확인.

### 2-3. Supabase (데이터베이스·인증·문자)
- Supabase 대시보드 → **Logs**(Postgres·Auth·Edge Functions 별로 있음).
- 전화 문자(OTP)가 안 오면 **Edge Functions → `send-sms-hook`** 로그 확인(SOLAPI 응답이 여기 남습니다).
- 로그인/인증 문제는 **Auth Logs**.

---

## 3. 증상별 1차 점검표

| 증상 | 먼저 볼 곳 | 흔한 원인 |
|---|---|---|
| **직원 웹이 안 열려요**(하얀 화면) | Vercel → 해당 프로젝트 Deployments/Logs | 빌드 실패, 또는 env(`VITE_SUPABASE_*`) 누락 |
| **로그인이 안 돼요**(직원) | Supabase Auth Logs + `/admin/errors` | 이메일/비번 오타, Email provider 꺼짐, JWT secret 불일치 |
| **로그인이 안 돼요**(환자 앱) | Supabase Auth Logs + `send-sms-hook` 로그 | Phone provider 꺼짐, SOLAPI 키/발신번호 문제, 계정 미연결(auth_user_id) |
| **문자(OTP)가 안 와요** | Supabase Edge Functions `send-sms-hook` 로그 | SOLAPI 키 IP 제한, 발신번호 미등록, `SEND_SMS_HOOK_SECRET` 불일치 |
| **알림(리마인더)이 안 와요** | Railway 리마인더 크론 로그 + `/admin/errors` | 크론 미등록/실패, 발송 제공자 키 문제 |
| **상담봇이 답을 안 해요** | `/admin/errors`("서비스 장애" 배지) + Railway 백엔드 로그 | `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` 문제 → 안내 문구로 폴백 |
| **백업이 안 보여요** | Railway 백업 크론 로그 + Supabase Storage `backups` | 크론 미등록, `pg_dump` 없음(nixpacks), service_role 키 문제 |
| **예약을 잡았는데 반영이 안 돼요** | Railway 백엔드 로그 + `/admin/errors` | API 오류, DB 연결(DATABASE_URL 풀러) 문제 |
| **API가 자꾸 401/이상해요** | 백엔드 `/health`(200인지) → `/me`(401인지) | 백엔드 다운, JWT secret 불일치, 프록시(vercel.json) 문제 |

---

## 4. 빠른 자가진단 명령 (운영자)

```bash
# 백엔드 살아있나
curl -i https://gaonhospital-api-production.up.railway.app/health     # 200 기대
# 직원 웹이 백엔드로 프록시되나
curl -i https://gaonhospital-staff.vercel.app/health                  # 200 기대(백엔드로 넘어감)
# 상담봇 백엔드 프록시
curl -X POST https://gaonhospital-webchat.vercel.app/chat/sessions \
  -H "Content-Type: application/json" -d '{"channel":"web"}'          # 세션 JSON 기대
```
`backend/scripts/smoke.py`로 핵심 흐름 전체를 한 번에 점검할 수도 있습니다(설치·백업 안내서 참고).

---

> 외부 서비스(문자·AI) 키를 일부러 막아도 **예약·진료 같은 핵심 기능은 계속 동작**하도록 설계돼 있습니다.
> 알림·상담봇 실패는 `/admin/errors`에 기록만 되고 본 기능을 막지 않습니다.
