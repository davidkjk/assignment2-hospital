# 직원웹 구현 실행 플랜 (paseo + Opus 4.8)

> **무엇**: 직원웹 화면·백엔드를 **무엇을·어떤 순서로·어떤 파일에** 만드는지의 정본. "어떻게 굴리나"(모델·심박·바통·알림)는 `IMPL-ORCHESTRATION-PLAYBOOK.md`.
> **이 문서의 뿌리**: 2026-08-26에 폐기한 `CODEX-3DAY-EXECUTION-SHEET.md`의 태스크 원천(§2 상태·§4 웨이브·§5 태스크표·병렬 규율·함정)을 **paseo/Opus 4.8 기준으로 옮긴 것**. Codex/Orca 색채는 걷어냈고, "무엇을 만드나"는 그대로 살렸다.
> **정본 관계**: 규칙 = `docs/design/screen-behaviors.md`(무엇이 그렇게 동작하나). 마이그 번호 = `docs/design/spec-index/MIGRATION-LEDGER.md`. 태스크 상세 = `docs/superpowers/plans/2026-08-15-staff-web.md`의 `## Task N` 절.

---

## 1. 지금 상태 (2026-08-26)

- **커밋됨**(전부 `merge/design-integration`): Task 0(시각 토큰 `e86d705`) · Task 1(마이그 00033~35 `2099738`) · Task 2(일정 변경 판정 서비스 + 00036 `8c1a59c`) · Task 3 **부분**(진료문구 서비스+라우터+me, `8c1a59c`) · seam 배선(schedule_change 라우터 2종 `fcb5808`).
- **Task 4 = 재구현 대상(사용자 결정 2026-08-26).** 옛 Codex 트랙이 Task 4(React 스캐폴딩·직원 인증·공통 셸·역할 라우팅)를 만들었으나 **독립 재검증에서 FAIL**(HIGH 3·MEDIUM 6). 이후 4개 커밋(`349ee6a`·`35dc7b7`·`0b7c401`·`d90a1f9`)으로 부분 패치됐지만 **전수 해소가 확인되지 않았다.** → 조각 패치를 쌓지 말고 **Opus 4.8로 Task 4를 깨끗이 다시 구현**한다(§3).
- **다음 빈 마이그 번호**: `00037`. (직원웹 밴드 `00033~00051`.)
- **결번**: **Task 16·Task 23은 없다**(플랜에서 흡수·삭제). 남은 것 = **Task 4(재구현)·5~15·17~22·24~30**.
- **로컬 DB**: 로컬 supabase 기동 필요(`supabase status`, DB_URL `…54322`). 테스트 전 Docker 켜져 있어야 함.

## 2. 실행 순서 — 3파(wave)

```
Wave A  (직렬 — 모든 것의 관문)
  Task 4  React 스캐폴딩 + 직원 인증 + 공통 셸 + 역할 라우팅  ← 재구현. 한 워커가 신중히(구조 1회)

Wave B  (Task 4 후 병렬 — 서로 독립 파일 = 백엔드/기반)
  Task 5  API 클라이언트 레이어         Task 6  patients 라우터 + 마스킹
  Task 13 조회 전용 백엔드              Task 17 일정 백엔드 + 운영시간 판정기 (어려움)
  Task 25 통계 대기지표 백엔드          Task 7  공통 컴포넌트 + 되돌리기(00037) (시각, Task 4 셸 후)

Wave C  (Task 4·5·7 후 — 화면 15개, route 폴더 격리 병렬)
  8·9·10·11·12·14·15·18·19·20·21·22·24·26·27·28·29·30
  (Task 18은 17 후 · Task 30은 28 후 · Task 26은 21 후)
```

**선행 하드 규칙**:
- **Task 4 → 모든 프론트**(스캐폴딩 없으면 화면이 못 뜬다). 직렬, 한 워커가 신중히.
- **Task 5(API 클라)·Task 7(공통 컴포넌트) → 모든 화면**이 소비. Wave C 전에 끝낸다.
- **Task 13 → 화면 8·10·11·12** · Task 17 → 18 · Task 6 → 10·24 · Task 25 → 12.
- 한 파 **병렬 워커 5개 이하**. 화면 15개는 3배치로.

## 3. Task 4 재구현 지침 (첫 태스크)

> 옛 Task 4의 실패 지점을 반복하지 않도록, 재구현 시 아래를 규칙으로 덮는다. 상세 규칙 ID는 `plans/2026-08-15-staff-web.md`의 `## Task 4` 절 + 그 절이 가리키는 behaviors 규칙.

- **범위**: `/login` 직원 인증 + 공통 셸(`StaffShell`: 사이드바 4그룹·헤더 세 문) + 역할 라우팅 + React 스캐폴딩.
- **옛 재검증이 잡은 것(재구현 시 반드시 덮기)**:
  - **HIGH**: ①복구 세션이 아닌 일반 로그인 세션은 **새 비밀번호 화면을 허용하면 안 됨** ②헤더 왼쪽은 **화면명이 아니라 병원명** ③아이콘 경로가 **SVG를 반환**해야 함(프로덕션 빌드에서 SPA HTML 반환 금지).
  - **MEDIUM**: JWT `sub` 누락/invalid UUID → **401 정규화**, 역할표 중복 제거, 권한 차단 기본화면은 **link가 아닌 button**, 축소 내비 focus tooltip/active 딥틸 일치, 비밀번호 변경 `SET-PW-*` 규칙 완전 구현, 복구 redirect는 **frontend origin**(신뢰 `STAFF_WEB_ORIGIN`).
- **개인정보 열거 방지**: 로그인 실패는 맞든 틀리든 같은 화면으로.
- **재구현 방식 판단(Task 4 착수 시 지휘자가 결정)**: 기존 4개 패치 커밋을 살릴지(그 위에서 규칙 워크로 전수 덮기) vs 되돌리고 새로 짤지. **되돌림(revert)은 되돌릴 수 없는 판단이 아니므로**, 착수 전 현재 코드 상태를 규칙 대비로 훑어 "패치가 규칙을 얼마나 덮었나"를 먼저 재고 결정한다. 큰 revert면 사용자에게 텔레그램으로 확인.

## 4. ⭐ 태스크별 실행 표

> **마이그 번호는 이 표 + `MIGRATION-LEDGER.md`가 정본.** 플랜 산문 옛번호(00017류)는 **+16 시프트**로 무시하고, 플랜의 `Create: supabase/migrations/…` 줄만 믿는다.
> **모델(사용자 확정 2026-08-26 개정)**: 구현·검증 **전부 Opus 4.8 · 노력 전부 `high`.** ⬅️ 아래 표의 `노력` 열 `xhigh`/`max`는 **전부 `high`로 대체**(이 줄이 우선). 비가역 병합(21·26)은 별도 적대리뷰 에이전트 없이 **코디 리뷰를 더 꼼꼼히** 보는 것으로 보완(이상 징후 시에만 추가). Sonnet 5는 기계작업에만. **독립 검증 PASS 전 완료 주장 금지.**

| Task | 화면/내용 | 종류 | 마이그 | 노력 | 데모 레퍼런스 (`demo/src/routes/`) | 의존·주의 |
|---|---|---|---|---|---|---|
| **4** | React 스캐폴딩+직원 인증+공통 셸+역할 라우팅(`/login`) | 구조/시각 | — | **high**(구조 1회, §3) | `staff/auth/Login.tsx`·`staff/StaffShell.tsx` | **재구현. 모든 프론트의 관문. 직렬.** |
| **5** | API 클라이언트 레이어 + 오프라인·오류 계약(`OFFX-STAFF-*`·`ERR-*`) | 로직 | — | high | — | 모든 화면 선행 |
| **6** | `patients` 라우터 + 마스킹·열람 기록(`MASK-*`·`SEARCH-LOG-*`) | 로직 | — | high | — | Task 10·24가 소비 |
| **7** | 공통 컴포넌트 + 되돌리기 계약(`PANEL/UNDO/BTN/PICK-*`) | 시각 | **00037** `status_undo` | high | `staff/_ui.tsx`·`staff/doors/*` | 화면들 선행. Task 4 셸 후 |
| **8** | `/today` 오늘의 현황(`TODAY-*`) | 시각 | — | high | `staff/today/Today.tsx` | Task 13 소비 |
| **9** | `/queue` 대기 목록 + 당일 방문 등록(`QUEUE-*`) | 시각 | 00038 `walkin_visit_time`* | high | `staff/queue/Queue.tsx` | |
| **10** | `/patients/:id` 환자 상세(`PTDET-*`) | 시각 | — | high | `staff/patient/PatientDetail.tsx` | Task 6·13 |
| **11** | `/doctor/console` 의사 진료 콘솔(`DOCTOR-*`) | 시각(밀도) | — | **xhigh** | `staff/doctor/DoctorConsole.tsx` | Task 3·13 |
| **12** | `/admin/stats` 운영 통계(`STAT-*`) | 시각(밀도) | — | **xhigh** | `staff/admin/record/Stats.tsx` | Task 13·25 |
| **13** | 조회 전용 백엔드(today·대기·이력·콘솔·통계) | 로직 | — | high | — | 화면 8·10·11·12 선행 |
| **14** | `/calendar` 예약 캘린더 + Realtime(`CAL-*`·`SUPPORT-CAL-*`) | 시각(최고밀도) | 00039 `appointment_time_range_realtime` | **xhigh** | `staff/calendar/Calendar.tsx` | Realtime 주의 |
| **15** | `/admin/access-logs` 열람 기록(`ALOG-*`·`SEARCH-LOG-*`) | 시각 | 00040 `access_audit_log_index` | high | `staff/admin/record/AccessLogs.tsx` | Task 6 |
| **17** | 진료과·일정 관리 백엔드 + **운영시간 단일 판정기**(`SCHED-DEPT/SLOT-*`) | 로직(어려움) | 00041 `hospital_hours_closures` | **xhigh** | — | Task 18 선행. **하드 판단** |
| **18** | `/admin/schedule` 화면 + 라우트 조립(`SCHED-TAB/GRID/WEEK/SAVE/EXC/HOURS-*`) | 시각 | — | high | `staff/admin/config/Schedule.tsx` | **Task 17 후** |
| **19** | `/admin/staff` 직원 관리 + 의사 프로필·캘린더 색(`STAFF-*`·`CAL-COLOR-*`) | 시각 | 00042 `staff_profile_palette` | high | `staff/admin/config/StaffAdmin.tsx` | |
| **20** | `/checkin` QR·예약번호 접수(`CHKIN-*`) | 시각 | 00043 `fix_booking_code_length`(6자리 버그수정) | high | `staff/checkin/Checkin.tsx`·`CheckinForm.tsx` | |
| **21** | `/admin/patient-merge-candidates` 중복 병합(`MERGE-*`) | 시각(밀도)+**비가역** | 00044 `patient_merges` | **max + 적대리뷰** | `staff/admin/record/MergeCandidates.tsx` | **파괴적 — 신중** |
| **22** | `/admin/questionnaires` 문진표 관리(`QADM-*`) | 시각 | 00046 `questionnaire_versions` | high | `staff/admin/config/Questionnaires.tsx` | 불변 버전 |
| **24** | `/patients` 전역 환자 검색(`SEARCH-*`) | 시각 | — | high | `staff/patients/PatientSearch.tsx` | Task 6 |
| **25** | 운영 통계 — 오래 대기 건수·명단(`STAT-METRIC-04`) | 로직 | 00047 `search_audit_counts` | high | — | Task 12 소비 |
| **26** | `/admin/merge-history` 병합 이력·되돌림(`MHIST-*`) | 시각+**비가역** | — | **max + 적대리뷰** | `staff/admin/record/MergeHistory.tsx` | **Task 21 후. 파괴적** |
| **27** | `/admin/errors` 시스템 오류(`ERRADM-*`) | 시각 | 00048 `system_error_safe_summary` | high | `staff/admin/record/Errors.tsx` | 안전 요약(redaction) |
| **28** | `/messages` 발송 만들기 — 제1문·패널·enqueue(`SEND-*`·`MSGX-*`) | 시각+로직 | 00049 `scheduled_notifications_cancel` | high | `staff/messages/Messages.tsx` | Task 30 선행 |
| **29** | `/admin/settings` 병원 설정(`HSET-*` 71 + `HSETX-*` 19) | 시각(최고밀도) | 00051 `hospital_settings_full`(공유칸 `if not exists`) | **xhigh** | `staff/admin/config/HospitalSettings.tsx` | **⚠️ 없는 칸 저장값처럼 노출 금지**(`HSETX-DATA-01`) |
| **30** | `/messages` 발송 결과·실패·재시도(`SEND-RESULT/RETRY/FAIL/DEAD-*`) | 시각+로직 | 00050 `notification_log_dispatch` | high | `staff/messages/Messages.tsx` | **Task 28 후**(세로 분할 2/2) |

\* 라벨 없는 번호는 원장 「Create 줄 기준」. 새 마이그가 필요하면 **직원웹 밴드 다음 빈 번호**를 쓰고 원장 갱신.

> **📌 상담봇 그룹 화면**(문의함·상담기록·안내자료·미해결·오답·품질·현황)은 이 플랜 밖 — **`ai-chatbot` 플랜(4단계) 소유**. 손대지 말 것.

## 5. ⚠️ 포팅의 핵심 함정 — 데모는 규칙을 다 반영하지 않는다

> **정본은 `screen-behaviors.md` 규칙이다. 데모는 「어떻게 보이나」의 시각 참고일 뿐, 「무엇이 있어야 하나」의 목록이 아니다.** 데모만 보고 옮기면 데모가 빠뜨린 규칙이 그대로 빠진다(사용자 검수를 거쳤어도 규칙의 부분집합).

**데모가 규칙을 놓치는 4형태**: ①한 상태만 그림(빈/로딩/오류/전이는 `*-EMPTY/STATE/ERR/LOAD/RACE` 규칙에 있고 데모엔 없음) ②옛 라벨/값(예 기간 「30일·90일」 vs 정본 `PERIOD-BOX-02` 「1개월·3개월」) ③규칙 자체 누락 ④요구사항 좁힘(검색을 「이름만」으로 좁힘 vs 규칙은 전화번호도).

**작업 방법 = 「규칙 워크」**: 화면의 규칙을 한 줄씩 훑으며 각 규칙의 시각 짝을 데모에서 찾는다. ①데모에 있고 규칙과 맞으면 → 포팅. ②데모에 없거나 규칙과 다르면 → **규칙이 이긴다.** 규칙대로 구현하고, 새 시각은 데모 디자인 시스템(`tokens.css`·간격 리듬) 위에서 그린다(=「신규 요소」, frontend-design 스킬 렌즈). **"다 됐나"의 판정 = 데모와 닮았나가 아니라 「규칙 ID를 다 덮었나」.**

## 6. 병렬 워커 규율 (어기면 가짜 실패)

1. **같은 브랜치 기반·다른 파일**(화면별 route 폴더 격리) 또는 worktree 격리. **공용 파일**(`routes.tsx`·`StaffShell`·`_ui`·공용 mockData·`main.py`)은 **워커 금지 → 코디가 병합 때 배선**.
2. **커밋은 코디네이터가** 완료 회수마다. 워커는 **자기 파일만 `git add`**(`git add -A` 금지).
3. 워커는 **`supabase migration up`만**(`db reset` 절대 금지 — 공유 DB). **focused 테스트만.**
4. **전체 회귀는 코디가 클린 DB(`supabase db reset`)에서 1회.** ⚠️ 코디가 검증을 반복하면 공유 DB 오염→가짜 실패.
5. 격리 워크트리면 브리프에 `python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt` / `cd frontend && npm install` 먼저.
6. 창구는 브리프에 `Consumes:`/`Produces:`로 **이름 명시**. DB 칸 나오면 서버층 짝 확인.

## 7. 코디네이터 자기점검 (커밋·병합 전마다)

- [ ] 워커가 **자기 파일만** 손댔나? (`git status`로 공용 파일 오염 확인)
- [ ] 마이그 번호가 **이 표/원장과 일치**·중복 없나? (`python3 docs/design/spec-index/plan-migration-check.py` = exit 0)
- [ ] **전체 회귀를 클린 DB에서 1회** 돌렸나? (`supabase db reset` 후 `pytest`)
- [ ] 시각 화면이면: 데모 대비 **구조·간격 포팅**·하드코딩 색이 `tokens.css`를 쓰나? **규칙 ID를 다 덮었나(규칙 워크)?**
- [ ] 선행 의존이 먼저 끝났나? (Task 5·7 없이 화면 병합 금지 / Task 17 없이 18 금지)
- [ ] 비가역 화면(21·26)이면: 빨간 버튼이 **확인창 안에만**·막다른 길 없나·되돌림 경로 있나?
- [ ] **독립 검증(fresh Opus 4.8) PASS** 받았나? (자기 코드 자기 리뷰 금지)
- [ ] 커밋 메시지에 Task·마이그 번호. 병합은 `git merge --no-ff`.
- [ ] `HANDOFF.md` 최상단 심박 + 이 문서 §9 진행 로그 1줄 갱신.

## 8. 함정 모음 (계속 적용)

- **마이그 번호**: 플랜 산문 `00017`류 낡음(+16). `Create:` 줄과 원장만. 다음 빈 번호 **00037**.
- **Task 16·23은 결번** — 찾지 말 것.
- **공유 DB 오염 = 가짜 실패**: 리셋하면 사라지는 실패는 버그 아님.
- **`git add -A` 금지**, 공용 파일은 코디만.
- **환자 노출 문구**: "취소 요청 접수/등록" 금지 → **"상담(직원 확인)으로 연결"만**.
- **되돌릴 수 없는 동작은 눈에 덜 띄게**(빨간 버튼은 확인창 안). **막다른 길 금지**. **끌 수 없는 스위치 금지**. **개인정보 열거 방지**.
- **이모지 금지** — 아이콘은 SVG `<symbol>`+`<use>`.
- **낡은 `⏳`/미결** 그대로 믿지 말 것 — 주제어 grep 재확인.

## 9. 진행 로그 (세션 간 이어쓰기 — 각 Task: `Task N — 커밋 — 미결로 판단한 것`)

- **2026-08-26**: Codex/Orca 체제 폐기 → paseo/Opus 4.8로 이 플랜·플레이북 재작성. 텔레그램 알림봇 연결(`.claude/orchestration/notify.sh`).
- **Task 4 — `c08bea9` — PATCH-FORWARD로 완주**: 독립 재검증(`.claude/orchestration/task4-verification.md`) 결과 옛 코드 8/9 해소·핵심 로직 정상이라 revert 아닌 patch-forward 판정. 남은 갭 2건만 수정 — G1(헤더 왼쪽 화면명→**병원명** 비링크, 화면제목은 본문 `<main><h1>`, `HOSPITAL_NAME` 상수 신설 `shell/brand.ts`) + G2(Sidebar active 배경 하드코딩 hex→`--color-primary-wash` 토큰). 약화됐던 `Header.test.tsx` 2건(SHELL-HDR-01·NAV-SHELL-12) 정본대로 복원. 프론트 57/0·백엔드 24/0 GREEN. **판단: 병원명은 Task 29(병원설정) 붙기 전까지 상수(`가온병원`)로 둠 — 되돌리기 쉬운 임시.** ⚠️ 플랜 Task 4 절의 테스트 스펙 중 그룹순서 `['업무','기록','설정','상담봇']`·접수직원 8항목은 **낡음**(정본 behaviors 2026-08-24 개정 = `업무→기록→상담봇 관리→설정`·6항목). 코드가 정본을 따름 — 후속 워커는 플랜 낡은 값에 맞추지 말 것.
- **Task 5 — 커밋대기 → 커밋 — 갭 #14는 이미 닫혀 있었다**: `apiFetch`/`ApiError`(서버 문장 그대로·`BTN-TIME-01` 시간제한 없음)·`useConnectivity`(연결판정 단일지점)·시각3(`OfflineBanner`/`EmptyState`/`InlineError`, frontend-design 렌즈+토큰만) + api 래퍼 5(`appointments/patients/medicalRecords/quickPhrases/schedule`). **판단/발견**: 플랜이 "백엔드 6곳 `AppError(str(exc))` 고쳐라"였으나 커밋 `e40a67f`에서 이미 `pg_error_to_app_error()` 경유로 마스킹 완료 → 백엔드 프로덕션 무변경, `test_error_messages.py`는 회귀 가드로만 신설. 프론트 95/0·백엔드 9/0 GREEN. ⚠️ **코디 배선 TODO**(공용 파일이라 워커가 안 함, 셸/App 붙일 때 필요): ①온라인 401→세션만료(`isSessionExpiry`→`rememberReturn(path, staffId)`→logout→/login, 키 `staff-session-return`) ②`apiFetch` 성공 시 `markServerOk()` ③`ConnectivityProvider`+`OfflineBanner` 셸 마운트. `patients.ts`는 Task 6 라우터 계약 경로로 미리 얇게 감쌈.
- **Task 6 — 절반 완료(커밋대기)**: Steps 1–5(=`core/masking.py` `mask_phone`/`mask_birth_date`·`routers/patients.py` `GET /patients`·`/{id}`·`/{id}/contact`·`audit_service.log_access` 확장(검색어·nullable patient_id)·`patient_service` search/detail/reveal) 완료, pytest 14/0. ⚠️ **Steps 6–10 = 가족 연결 저장 창구(R5-01)는 미완** — 내가 브리프에 Files 블록만 인용해 빠뜨림(플랜 Files 블록 자체가 Step 6~10과 불일치). **후속 Task 6b 필요**: `00045_family_link_verification.sql` + `patient_service.link_family_member`/`unlink_family_member` + `POST/DELETE /patients/{id}/family`(라우터) + `test_family_link.py`. Task 10·13의 가족 저장이 이걸 소비. ⚠️ **코디 배선**: `main.py`에 `patients.router` 등록. **판단**: 검색 audit는 서비스역할 풀로 씀(00004가 authenticated UPDATE 미grant), staff_id는 검증세션값이라 위조위험 없음 — RLS로 바꾸려면 별도 마이그 필요(미생성, 후속 검토).
- **Task 6 `b2fad2e` · Task 7 `e9796de` (Batch2 병렬 커밋)**. Task 7: `00037_status_undo.sql`(역전이표, 한 칸 뒤로만) + `undo_status`/`UNDO_TRANSITIONS`/`can_undo`/`reason_required`(DB예외 `pg_error_to_app_error` 마스킹) + 공통 컴포넌트 10(`PanelHost`+Provider·`ConfirmDialog`·`IdentityConfirmDialog`·`ReasonPromptDialog`·`BusyButton`·`UndoControl`·`StatTile`·`SelectableList`+`PickBar`+`useSelection`, 딥틸 토큰만, 캘린더 PICK 제외). 프론트 134/0. **판단**: `test_error_messages` 가드 `==6`→`>=6`(undo_status가 7번째 정당 마스킹, 개수 아니라 원문노출 회귀가 목적). **코디 배선 TODO**: PanelProvider/PanelHost 셸 마운트·undo HTTP 엔드포인트(응답에 서버판정 `reason_required` 실어 `UndoControl.requiresReason` 채움). ⚠️ **전체 회귀서 `test_doctor_cannot_invite_staff_via_api` 1건 실패는 공유 DB 순서 오염**(격리 PASS) — 클린 DB 회귀 때 재확인.
- **Task 6b `151546c`**: 가족연결 저장(00045, link/unlink + POST/DELETE /patients/{id}/family, 의사 403, 재연결 허용). Task 6 완결. focused 6/0.
- **Task 13 `f666fba`**: 조회 백엔드(`core/pagination.py` 공용커서·`core/dto.py` 마스킹경계·dashboard/history/stats 서비스·라우터 2). focused 54/0. **BLOCKED 이월**: ①`/calendar`는 Task 17 `resolve_day`(빗금 유일판정기) 없어 인터페이스+`NotImplementedError`만, 라우트 미등록 → **Task 17 후 배선** ②`ALOG-LIST-13` 상세 payload는 `access_audit_log`에 payload 칸 없어 미룸(마이그 필요) → **Task 15에서 처리** ③리스케줄 영향분은 calendar와 묶여 미룸. **코디 배선**: main.py에 dashboard.router·stats.router 등록.
- **모델정책 개정(2026-08-26)**: 노력 전부 high. **병렬 축소 → 앞으로 한 번에 하나씩**(중간 한도컷 시 콜드 재읽기 낭비 회피, 사용자 논의). 200k/1M은 비용차 미미(태스크가 200k 미만)라 유지.
- **Task 25 `d53cfdc`**: long_wait 지표(백엔드 절반, 프론트=Task12와). **Task 17 `3c988b4`**: `resolve_day` 단일 판정기(의사예외>병원휴무>요일규칙, source)·`00041 hospital_hours_closures`·schedule_admin_service(save_week_rules 원자·overview_grid·진료과 CRUD, 진료과중지는 활성의사 있으면 막고 /admin/staff)·slot_generator·department is_active. `core/errors.py` 공유변경(AppError detail, 하위호환). **전체 회귀 349/0.**
- **✅ Wave B 백엔드 완료**(4·5·6·6b·7·13·25·17) + **✅ 코디 통합 배선 완료** + **✅ 독립검증 PASS**(fresh Opus 4.8 `d081f171`, 계약·규칙 위반 0건) + **✅ 클린DB 회귀 PASS**(백엔드 358/0·프론트 141/0). **다음 = Wave C(화면 15개, 하나씩)**.
  - 검증 지적(비기능, 처리): ①`get_calendar` docstring 「BLOCKED」 낡음 → **역참조로 해소**(커밋). ②`affected_appointment_ids`가 `[from,to]` 창 밖 id 포함 가능 — 무해(프론트가 그리는 막대만 ⚠ 표시), 최적화 여지만 → HAND-REVIEW 이월.
- **Task 8 `/today` 화면 `51fa001`**(시각): TODAY-* 규칙 화면 + 라우터 배선(App.tsx `/today`→TodayPage). 프론트 17/0·tsc0. **⚠️ 백엔드 갭 = Task 13b 필요**: `get_today_summary`가 tiles·long_wait·needs_attention만 제공 → **`TODAY-NOSHOW`(미접수·시각지남)·`TODAY-YDAY`(전일 미완료, #37 자정경계)·`TODAY-DOC-01`(의사별 대기)** 데이터 미제공으로 미구현(스펙 `ui-design-decisions.md:3602`이 TODAY-DOC-01 「요약API에 추가 vs /queue서 프론트 셈」 **미결**로 기록). `TODAY-RESCHED`(리스케줄 영향)·`TODAY-LIVE`(realtime)는 **Task 14(calendar/realtime)와 함께**. → **13b: get_today_summary에 NOSHOW/YDAY/DOC 목록 추가**(DOC-01 기본=요약API 단일소스) 후 /today 카드 완성.
- **✅ Task 9 `/queue` `b5db19e`**(시각+로직): 대기목록 7탭·순번 필터이전(ORDER-03)·도착처리·순서변경(사유필수)·긴급 + **당일 방문등록(갭#85 해소)**: `00038_walkin_visit_time`(공유DB up 적용) + `create_appointment(walkin_visit_time)` 미래시각 서버가드(WALK-16) + `WalkinVisitTimePicker` 위젯. 백엔드 46/0·프론트 180/0·tsc0. **이월 3건**: ①**워크인 패널 전체 조립**은 Task 6 환자검색 **프론트**(`searchPatients` 스텁)+PanelHost 배선 후(=Task 24/공통패널) ②**`QUEUE-ARRIVE-02` [진료대기] 원클릭**: `VALID_TRANSITIONS`에 `예약확정→진료대기` 직행 없어 **도착→진료대기 2단 체이닝**으로 구현(직행 원하면 전이표 마이그 필요, 임의 스키마 안 만듦) ③`WALK-08` 다음자리=갭#87·DnD 드래그물리=시각폴리시 이월. ⚠️ **00038은 공유DB엔 적용됐으나 클린DB 회귀(reset) 미검증** — 다음 체크포인트에서.
- **✅ Task 13b `873af07`**: `get_today_summary` +3필드(not_arrived/yesterday_unfinished/doctor_waiting) + /today 카드 완성. 백엔드 24/0·프론트 22/0·tsc0. **/today 완성**(단 `TODAY-RESCHED`·`TODAY-LIVE`는 Task 14 realtime과 함께). ⚠️ **미접수/전일미완료 행 action은 네비게이션 배선**(도착·원문공개 mutation 엔드포인트 부재) → **Task 9 `/queue`가 `?tab=not_arrived&action=…` 인라인 도착/접수 mutation 완성**. ⚠️ 이 과정에서 **Max 한도컷 1회**(7:30pm 밴쿠버 리셋 후 재개 성공).
- **코디 통합 배선 목록**(main.py·셸 공유파일, 코디가): ①main.py 라우터 4 등록: `patients`(T6)·`dashboard`·`stats`(T13)·`schedule_admin`(T17) ②`resolve_day` 소비처 연결: T13 `/calendar`(NotImplementedError 해제)·`appointment_service` 예약생성 ③셸: `ConnectivityProvider`+`OfflineBanner` 마운트·`PanelProvider`/`PanelHost` 마운트·401 세션만료(`isSessionExpiry`→`rememberReturn`→logout)·`markServerOk` ④undo HTTP 엔드포인트(`undo_status` 호출, 응답에 `reason_required`).
- **✅ 코디 통합 배선 완료(epoch2, 배선 워커 `54a09667`)** — 커밋 예정. ①main.py 라우터 4 등록 ②(a) `get_calendar` 구현(`resolve_day` 유일판정기로 예약막대+빗금(점심·휴진)+⚠affected id 조립, `dashboard.py`에 `GET /calendar`) ③셸: `main.tsx`에 `ConnectivityProvider`·`AppShell`에 `PanelProvider`+`OfflineBanner`+`PanelHost`+`ServerEffects`(`serverEffects.ts` 신설: 성공→`markServerOk`/온라인401→`isSessionExpiry`→`rememberReturn`→`logout`) ④`POST /appointments/{id}/undo`(서버판정 `reason_required`, 사유 없으면 막지 않고 `executed:false,reason_required:true` 반환=막다른 길 금지). 백엔드 43/0·프론트 35/0.
  - **②(b) `appointment_service` 예약검증 = Task 14로 이월**(임의 구현 안 함): `SCHED-SLOT-11`이 요구하는 `resolve_day` 예약가드는 **격자 밖 5분 단위 슬롯 예약(`CAL-TIME-09`)** 대상인데, 현재 `create_appointment`는 시각을 **slot_id로만** 받는다(slot 경로는 slot_generator가 이미 `resolve_day`로 보호=암묵). 오프그리드 예약 경로 자체가 없어 지금 붙일 소비처가 없다 → **Task 14(/calendar 5분 예약)에서 오프그리드 예약칸과 함께 `resolve_day` 가드 추가.** 워크인(slotless)은 `QUEUE-WALK-18`=갭 #85(시각 칸 없음)라 별개이고, "휴진 의사 워크인 차단" 규칙은 원문에 없음(default=차단 안 함, 상태 유지).
- **✅ Task 10 `/patients/:id` `7db6cf3`(epoch4 시각)**: 환자 상세 — 헤더 요약 + 2열 섹션 그리드(㉰안, 결정 #1), 섹션별 독립 쿼리(`useQuery`/`useInfiniteQuery`/`useQueries`)로 한 섹션 실패해도 나머지 유지(PTDET-LOAD-02). `PTDET-QNR-03`은 화면분기 + **관리자·접수직원 role일 때 문진 요청 자체를 안 보냄**(`questionnaireHit===false` 검증, AD-050/결정 #14). 신규 10파일+`format.ts`(공용 표시헬퍼·SectionState, 순환참조 회피) + 테스트 4종, `api/patients.ts` 상세 fetch 추가(경로 전부 백엔드 실측 일치: dashboard 라우터 prefix 없음, `/patients/{id}/visits·medical-records·family·notes`·`/appointments/{id}/questionnaire`). **App.tsx `/patients/:id` 배선=코디**(Placeholder→PatientDetailPage, RequireRole 역할셋 유지). 프론트 22/0·tsc0. **이월/BLOCKED**(서버 계약 부재, 프론트 흐름만 완성): `HEAD-05` sms_dead(상세응답에 필드 없음, 갭#123 — `sms_failed_at` 오면 표식) · `VISIT-03·07` 서버 정렬·페이징 동점키(Task 13) · `FAMILY-03·04·05` OTP·예외 서버판정(Task 13) · `SUPPORT-*` 전체(support_tickets=4단계 상담봇) · `ACTION-02` OTP/Auth API(갭 #19, `onRequestCode`/`onConfirm`이 501 거절). **판단**: 라우트 역할가드는 기존 `[receptionist,doctor,admin]` 유지 — `PTDET-ACTION-06`(의사/비활성 403+복귀경로)은 컴포넌트가 API 403을 받아 자체 처리(테스트가 그렇게 검증), 라우트에서 doctor 배제 시 QNR-03(담당의사 문진열람)과 충돌하므로 변경 안 함. ⚠️ VisitSection/RecordSection의 **진료과·담당의사**는 `patient_history_service` 방문응답이 아직 미포함 → 필드 오면 그리도록만 대기.
- **✅ Task 11 `/doctor/console` `46c1f7e`(epoch4 시각·xhigh)**: 의사 진료 콘솔 — 3단 패널(큐·컨텍스트/문진/이력·진료기록) + 브라우저 초안보관(`DOCTOR-DRAFT-01~03`)·**3초/30초 자동저장**(`DOCTOR-RECORD-04`)·상용구 칩·관리(`AD-064`)·열폭 조절(`AD-062`). **환자 행 여는 것 자체가 `진료대기→진료중` 전이**(`DOCTOR-START-01~02`, 버튼 없음). 문진 담당의사만(`ROLE-DOC-01`). 내부메모=`/patients/:id`와 같은 저장소(`AD-063`, NoteSection 재사용). 신규 21파일(소스14+테스트7, `useDraftStore`/`useAutoSaveDraft`/`ColumnResizer`/`api/doctorConsole.ts` 포함). **코디 배선**: App.tsx `/doctor/console`(pageFor) + 딥링크 `/:appointmentId`(결정 #9) + `navItems.normalizeNavPath`에 `/doctor/console/` 접기(사이드바 강조·가드 일관). 프론트 **전체 251/0**·tsc0. **⚠️ 후속 배선 2건(BLOCKED, 통로만 만듦)**: ①**START-01 자동전이 서버계약 갭** — `get_doctor_queue` 응답에 `updated_at` 없어 `PATCH /appointments/{id}/status`의 `expected_updated_at` 못 채움→실서버 422. **큐 응답에 `updated_at` 추가 필요**(Task 13 dashboard 후속·작은 백엔드 수정) ②**DRAFT-03 ②③ 로그아웃/자동로그아웃 시 초안삭제** — 워커가 `clearConsoleDraftsOnSignOut` 통로만 export, 셸 `signOut`/`useIdleLogout`에 호출 배선은 코디 후속(①완료 즉시 삭제는 동작). ⚠️ cwd에 무관 개인문서 `복습_전략.md`(미추적) 존재 — 손대지 않음.
- **✅ Task 12 `/admin/stats` `e37130c`(epoch4 시각·xhigh)**: 운영 통계 — 기간(공용 `PERIOD-*` `PeriodPicker` 자기완결, 이후 화면 재사용)·지표 카드·차원별 표·시간대 방문·유입원·챗봇 지표·드릴다운 모달·CSV. **개인정보 억제 핵심**: `exportCsv.ts`의 `suppressForExport(rows,k=5)`(직접+보완추론 차단)를 **CSV 경로에만** 연결, 화면 렌더는 공개 집계 그대로(1건 셀도 표시·클릭, `STAT-MASK-01` 두 경로 각각 테스트, 결정 21). 드릴다운 명단=서버 마스킹, 행→`/patients/:id`(결정 24). **드릴다운 감사는 서버가 `/stats/detail` 안에서 남겨 이중기록 방지**, CSV만 프론트 `POST /audit/stats`(payload PII 없음, 결정 22). 신규 14파일(`api/stats.ts` 포함). **코디 배선**: App.tsx `/admin/stats`(pageFor). 프론트 29/0·tsc0. **넘김**: `STAT-SHELL-01·02`(nav·역할게이트)=`RequireRole`+`AppShell` 책임(배선으로 적용) · `STAT-METRIC-02·07`(표시명 DTO·유효전이 재집계)=Task 13 소관, 프론트 계약만 · `STAT-METRIC-04` 오래대기 상세목록=계약 미존재로 버튼 미표시(플랜대로). BLOCKED 없음.
- **✅ Task 14 `/calendar` 완료(epoch4, 최대 태스크 — 순차 4분할)**: `14a` 백엔드 `3c70e63`(마이그 00039: start_at/end_at 신설[00038 아님·브리핑정정]·allow_overlap 사실기록·GiST 배제제약 WHERE NOT allow_overlap·같은시각 unique·realtime publication 3테이블·취소계열 제외 + `create_phone_appointment` 과거/5분스냅/닫힌시간 resolve_day 가드=400·겹침/같은시각=409·end_at=slot_duration + `POST /appointments/phone` 배선. ⚠️00038도 미적용이라 `up --include-all`) · `14b-1` 기반유닛 `81a53cf`(snap·useZoom·useCalendarRealtime·SlotBlock·TimeAxis·DoctorChips·CalendarNav+api, 46/0) · `14c` 카탈로그 `9d52df3`(get_calendar에 doctors={id,name,department_name,palette_index=null}, staff.department_id 존재확인, palette=Task19 00042가 채움) · `14b-2` 격자조립 `4c80b2b`(CalendarPage·DayGrid/WeekGrid[주간=DayGrid재사용]·MiniCalendar·PhoneBookingPanel[환자찾기 자체구축=WalkInPanel 부재]·AppointmentPanel·GapWarningDialog+gridModel/layout, doctors 소비·palette null→i%10 폴백, App.tsx CalendarRoute 래퍼 배선). 프론트 전체 385/0·tsc0·백엔드 14/0+7/0. **⚠️ 이월(contract/jsdom BLOCKED, 구체적)**: ①`CAL-VIEW-04`(한명선택 시 생년월일·초진/재진) — **캘린더 막대 DTO에 birth_date·visit_type 없음** → 후속 백엔드 DTO 추가 필요 ②`CAL-NAME-02`「N분」·`CAL-TIME-05` 예약 미리보기 종료시각 — **doctors 카탈로그에 slot_duration_minutes 없음**(막대길이서 기본15 도출) → 카탈로그에 slot 추가 시 정확 ③`CAL-COLOR-15`(팔레트 ink ΔE≥20) — Task 0 tokens.css 검증 소관 ④`CAL-TIME-05` 호버 px·`CAL-ZOOM` 드래그 px — jsdom rect=0(로직은 14b-1 유닛검증 완료) ⑤`NAV-STFSUP-08·14` 왕복복원 — 티켓모델=ai-chatbot 플랜. **⚠️ 00038·00039 적용됐으나 클린DB 전체회귀 미검증**(다음 체크포인트, 사용자 신호 후 reset).
- **✅ Task 15 `/admin/access-logs` 완료(epoch4, 백엔드/프론트 2분할)**: `15a` 백엔드 `569a7a8`(마이그 00040 안정정렬 인덱스 `(accessed_at desc, id desc)` B-19 · `audit_query_service.list_access_logs`[관리자만·patient_row_dto 마스킹·from포함/to제외·커서200] · `GET /admin/access-logs`+main.py 등록 · `paginate` page_size 인자 · 검색적재는 patient_service가 이미 `log_access` 호출[중복 안 함] · **ALOG-LIST-13 payload 불필요 판정**, 10/0) · `15b` 프론트 `70735a7`(AccessLogPage·LogFilterBar[PeriodPicker 재사용]·LogTable·LogKindBadge·BulkRevealRow+logRows[대량열람 한 줄 접기→개별 ALOG-GROUP-01·02] + PeriodPicker `applyLabel` 하위호환 prop, App.tsx 배선, 프론트 전체 415/0·tsc0). **계약**: `GET /admin/access-logs?patient_id&from&to&cursor`→`{rows[{id,accessed_at,resource_type,search_term,staff_name,patient{masked_*}|null}],next_cursor,total_hint}`. ⚠️ **BLOCKED(적재쪽 미완, 표시층 준비됨)**: `ALOG-LIST-12` 사유(reason 필드=Task 21) · `ALOG-AUDIT-02`/`GROUP-03` 저장 전수·미열람 무기록(쓰기=Task 6·28). ⚠️ 코디: BulkRevealRow 3000행 테스트 timeout 15s로 상향(jsdom 렌더속도, 로직 아님). ⚠️ 00040 로컬 --include-all 적용·원격 미적용.
- **✅ Task 18 `/admin/schedule` 완료(epoch4 시각·`2e9c9dd`)**: 진료 일정 관리 — 왼쪽 세로줄4(전체현황·진료과·의사별스케줄·특정날짜, `SCHED-TAB-01`)+오른쪽. OverviewGrid(행=의사·열=요일7)·DoctorWeekTable(7행 상시 비교·6칸)·DepartmentList(⛔삭제없음·활성의사 있으면 중지막고 `[직원 관리로 가기]` SCHED-DEPT-03/05)·DateExceptionPanel·HospitalHoursTable·**useDirtyMap(의사별 미저장 분리 갭#106)**·DirtyDot(세층 공용 `●`). 신규 19파일+`api/scheduleAdmin.ts`. **코디 배선**: App.tsx `/admin/schedule`(pageFor). 프론트 전체 474/0·tsc0. ⚠️ 워커 진행 중 일시적 timeout 1회→같은 워커 `send_agent_prompt` 재개(손실 없음). 토큰 `--color-warn`(규칙/플랜의 `--color-warning`은 낡음). **⚠️ BLOCKED/이월(구체적)**: ①`SCHED-WARN-01~11` 다이얼로그 본체 — **Task 2 `AffectedAppointmentsDialog`가 저장소에 없음** → `ConfirmDialog`로 로컬 조립(건수·자리 미리보기), Task 2 생기면 교체 ②**백엔드 조회 GET 부재** — Task 17이 hours/closures/date-exceptions에 PUT/POST만 있고 **GET 없음** → `scheduleAdmin.getHours/listClosures/listDateExceptions` 얇게 뚫어 prop 구동(테스트 GREEN), **라이브 배선 시 이 GET 엔드포인트 백엔드 추가 필요**(부제목 「다음 휴무·평일 운영시간」도 의존) ③`SCHED-HOURS-15·16` 결합팝업=Task 2 의존 ④`SCHED-EXC-16·18`·`NAVX-STAFF-02`=Task 29(`/admin/settings`).
- **미결(사용자 결정 대기, 진행 막지 않음)**: **갭 #94** — 특정 날짜에 그날만 점심시간 이동, 실제 필요한가? (요구사항에 없음)
- **살아있는 갭·미결**(HANDOFF에서 이관, 잃으면 안 됨):
  - **갭 #128**: 의료판단 이관 티켓의 **의사 도착 화면이 없다**(`SHELL-NAV`=의사는 진료·환자검색만). Task 17은 이관 드롭다운에 활성 직원 전부 넣되 도착 화면은 안 만듦. 해소는 이후 `SHELL-NAV`·의료 escalation 모델과 함께.
  - **백엔드 계약 갭 2건**: ① `GET /staff/chat/tickets/{id}`(요약5+대화, Task 9 Produces 미명시) ② `reassign_ticket(ticket_id,to_staff_id)`+`POST .../reassign`(Task 2 목록에 없음). 부수: `.../read`(UNREAD-02)·`GET /staff/active`.
  - **`SEARCH-LOG-06` N 판정** — 「조각 하나로 N명 이상」의 N(병원 감사 정책). `spec-index/HANDOVERS.md` 이월 — 데이터(`result_count`·`fragment_count`)는 `00031`이 쌓고 판정만 미룸.
