# 가온병원 예약·진료·상담 시스템

환자 앱(예약·사전문진·알림) · 직원 웹(접수·진료·관리) · AI 상담봇을 갖춘 병원 운영 데모 시스템입니다.

## 접속 주소 (시연 환경)

| 구성 | 주소 |
|---|---|
| 직원 웹 | https://gaonhospital-staff.vercel.app |
| 상담봇 webchat | https://gaonhospital-webchat.vercel.app |
| 백엔드 API | https://gaonhospital-api-production.up.railway.app |
| 환자 앱 | GitHub Release의 `app-release.apk` (아래 설치법) |

> 시연용 계정에 올라가 있습니다. 실제 납품 시 병원 계정으로 옮기는 절차는 [`docs/manual/install-backup.md`](docs/manual/install-backup.md).

## 테스트 계정

모든 비밀번호는 `demo1234`. 전체 목록: [`supabase/demo_accounts.md`](supabase/demo_accounts.md).

- **직원 웹**(이메일+비번): `admin@gaon.local`(관리자) · `reception@gaon.local`(접수) · `doctor1~8@gaon.local`(의사)
- **환자 앱**(전화+비번): `010-1234-5678`

## 환자 앱 설치

- **안드로이드**: [GitHub Releases](../../releases)에서 `app-release.apk`를 내려받아 설치(스토어 제출용은 `app-release.aab`).
- **iOS 시뮬레이터** 실행:
  ```bash
  cd patient_app
  flutter run -d "iPhone 15" --release \
    --dart-define=API_BASE_URL=https://gaonhospital-api-production.up.railway.app \
    --dart-define=SUPABASE_URL=https://eebhfnguwdjdusafrain.supabase.co \
    --dart-define=SUPABASE_ANON_KEY=<anon key>
  ```
- 앱 빌드·서명 절차: [`patient_app/RELEASE.md`](patient_app/RELEASE.md).

## 로컬 개발 실행

```bash
# 백엔드 (FastAPI) — 로컬 Supabase 필요
supabase start                       # 마이그레이션 적용된 로컬 DB
cd backend && uvicorn app.main:app --reload

# 직원 웹
cd frontend && npm install && npm run dev      # http://localhost:5173

# 상담봇 webchat
cd webchat && npm install && npm run dev

# 데모 데이터 시드
cd frontend && npm run seed:demo
```
> ⚠️ 백엔드 pytest는 공용 로컬 DB의 시드를 지웁니다 — 돌린 뒤 `npm run seed:demo`로 재적재하세요.

## 납품 문서 (`docs/manual/`)

| 문서 | 대상 | 내용 |
|---|---|---|
| [staff-guide.md](docs/manual/staff-guide.md) | 접수직원·의사 | 로그인·오늘의 현황·예약·접수·진료·기록 |
| [admin-guide.md](docs/manual/admin-guide.md) | 관리자 | 직원 관리·일정·통계·상담 문의·설정 |
| [knowledge-guide.md](docs/manual/knowledge-guide.md) | 관리자 | 상담봇 지식 자료 추가·승인 |
| [install-backup.md](docs/manual/install-backup.md) | 개발자·운영자 | 처음부터 설치·환경변수·백업/복구 |
| [error-check.md](docs/manual/error-check.md) | 관리자·운영자 | 증상별 1차 점검·로그 보는 법 |
| [scenario-checklist.md](docs/manual/scenario-checklist.md) | 검수 | 10개 완료 시나리오 대본 |

## 저장소 구조

```
backend/       FastAPI 백엔드 (app/, tests/, jobs/, scripts/)
frontend/      직원 웹 (React + Vite)
webchat/       상담봇 웹 위젯 (React + Vite)
patient_app/   환자 앱 (Flutter)
supabase/      마이그레이션(71개)·시드·엣지 함수(send-sms-hook)
docs/          요구사항·설계·납품 문서(manual/)
design-tokens/ 디자인 토큰(색·간격 등) 원본
demo/          디자인 데모(뼈대 참고용)
```

## 시스템 구성 (요약)

- 직원 웹·webchat → 백엔드: **same-origin 프록시**(Vercel rewrite → Railway). 브라우저 CORS 불필요.
- 환자 앱 → 백엔드: 모바일 네이티브(CORS 없음).
- 자동 작업(Railway cron): 리마인더(08:00 KST)·백업(03:00 KST)·자정 부도(00:00 KST).
- 자세한 구성도는 [`docs/manual/install-backup.md`](docs/manual/install-backup.md).
