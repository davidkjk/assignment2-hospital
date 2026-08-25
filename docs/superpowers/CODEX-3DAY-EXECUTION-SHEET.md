# 🤖 코덱스 3일 자율 실행 시트 — 직원웹 Task 4~30

> **누가 읽나**: 앞으로 ~3일간 이 저장소를 **판단 없이 실행**할 Codex 코디네이터(첫 창) + 그가 띄우는 워커들.
> **왜 있나**: 원래 코디네이터(Claude Opus)가 3일간 자리를 비운다(사용자 Claude 토큰 소진). 그동안 **교차 판단·마이그 번호·seam 배선 같은 「Claude가 잡던 함정」을 미리 다 박아두어**, Codex가 이 문서 하나로 스스로 진행하게 한다.
> **관계**: 「어떻게 워커를 띄우나(스폰 메커니즘·세션 죽음 대비)」는 자매 문서 **`IMPL-ORCHESTRATION-PLAYBOOK.md`**가 정본. 이 문서는 그 위에 얹는 **「무엇을 어떤 순서로·어떤 모델로·어떤 파일에」** = 실행 시트다. 둘 다 옆에 두고 본다.
> **한 줄 요약**: seam 라우터 1개 배선 → Task 4 스캐폴딩(직렬) → Task 5·6·7·13·17 기반(병렬) → 화면 15개(폴더 격리 병렬). 마이그 번호는 **아래 표와 `MIGRATION-LEDGER.md`가 정본**, 플랜 산문 번호는 무시.

---

## 0. 읽는 순서 (콜드 스타트 5분)

1. **이 문서** 전체 (§1~§9).
2. `docs/superpowers/IMPL-ORCHESTRATION-PLAYBOOK.md` — 워커 스폰·세션 죽음 대비·orca 명령.
3. `HANDOFF.md` 최상단 블록 — 지금 커밋 상태.
4. `docs/design/spec-index/MIGRATION-LEDGER.md` — 마이그 번호 원장(**번호 정본**).
5. 각 태스크 착수 직전에만: `docs/superpowers/plans/2026-08-15-staff-web.md`의 해당 `## Task N` 절 + 거기서 가리키는 `docs/design/screen-behaviors.md` 규칙 줄범위.

> ⚠️ **추측 금지.** "이 규칙/값이 있나?"는 기억으로 답하지 말고 grep/read로 원문 확인. 특히 **"없다"는 단정이 위험**(있는 걸 없다고 하면 다시 만든다). `⏳`·「미결」을 읽으면 그 주제어로 한 번 더 grep(낡은 미결이 많다).
>
> 🧠 **컨텍스트 하드 게이트**: 모든 Task 시작·종료에 `/status`. **40%부터 새 Task/큰 문서/새 dispatch 금지, 50% 절대 상한.** ACTIVE 1명+STANDBY 1명 바통 절차와 명령의 정본은 `IMPL-ORCHESTRATION-PLAYBOOK.md` §4-A. §11에 `ctx 시작 N% → 종료 N%`를 반드시 기록한다.

---

## 1. Codex가 가진 스킬 / 없는 스킬 (2026-08-24 실확인)

**⭐ Codex엔 superpowers가 이미 설치·활성이다** (`~/.codex/config.toml` → `[plugins."superpowers@openai-curated"] enabled = true`, `[features.multi_agent_v2]` 켜짐). 즉 아래를 **네이티브로 그냥 쓴다**(Claude의 파일 경로를 읽을 필요 없음):
- `test-driven-development` · `systematic-debugging` · `brainstorming` · `writing-plans` · `executing-plans`
- `dispatching-parallel-agents` · `subagent-driven-development` (multi_agent_v2 켜져 있어 **병렬 워커 작동**)
- `requesting-code-review` · `receiving-code-review` · `verification-before-completion`
- `using-git-worktrees` · `finishing-a-development-branch`
- 별도 네이티브: **`.system/review-agent`**(결함 우선 read-only 리뷰) · **`supabase-postgres-best-practices`**(마이그·RLS·쿼리 — 백엔드 워커 브리프에 참조로).

**❗ 유일하게 없는 것 = `frontend-design`** (그건 별도 Claude 플러그인이라 curated superpowers에 없다). 이 하나는 이렇게 메운다:

1. ⭐ **이 프로젝트의 React 직원웹은 「자유 디자인」이 아니라 「포팅」**이라 사실 frontend-design이 없어도 된다.
   `demo/`가 **이미 그 스킬을 적용하고 사용자 검수까지 끝낸 시각 결과물**이다. 플랜 §「시각 레퍼런스」(line 117~) 규약: 데모 컴포넌트의 **구조·레이아웃·간격·컴포넌트 분해를 그대로 가져오고, 가짜 데이터→React Query, 하드코딩 값→`tokens.css`로만 바꾼다.** 워커는 **해당 데모 `.tsx`를 읽어 옮긴다**(§5 표에 화면별 데모 경로 박음).
   ⚠️ **단 데모는 규칙을 다 반영하지 않는다** — 이 대비가 포팅의 최대 함정이라 **§5 「포팅의 핵심 함정」**에 규칙 워크·신규 요소 판별법을 따로 뒀다. 반드시 읽는다.
2. **시각 워커는 작업 전 그 SKILL.md를 항상 읽는다**(마크다운이라 경로로 읽힘):
   `/Users/kimjunkee/.claude/plugins/cache/claude-plugins-official/frontend-design/unknown/skills/frontend-design/SKILL.md`
   ⚠️ **가드레일**: 이 렌즈는 **① 데모에 없는 신규 요소 ② 데모가 애매한 미세 판단**(간격·위계)에만 적용한다. **데모가 이미 정한 것은 재설계 금지 = 충실 포팅.** (스킬은 "과감한 미적 결정"을 권하지만, 여기선 데모가 상위 = 재설계 면허 아님.) 「항상 읽기 + 적용은 신규요소·미세판단 한정」이라, 신규요소 감지가 틀려도 렌즈를 놓치지 않는다.

**요약**: 프로세스·TDD·리뷰·병렬 = Codex 네이티브 superpowers 그대로. 백엔드 = `supabase-postgres-best-practices`. 시각 = **frontend-design SKILL.md 항상 읽고** 「데모 포팅」(적용은 신규요소·미세판단만).

---

## 2. 지금 상태 (2026-08-24 밤 기준)

- **완료·커밋됨**(전부 `merge/design-integration`): Task 0(시각 토큰 `e86d705`) · Task 1(마이그 00033~35 `2099738`) · Task 2(일정 변경 판정 서비스 + 00036 `8c1a59c`) · Task 3 **부분**(진료문구 서비스+라우터+me, 같은 커밋 `8c1a59c`).
- **전체 테스트**: `169 passed`(클린 DB에서). 1단계 기반 초록불 위에 얹힘.
- **로컬 DB**: 로컬 supabase 기동 필요(`supabase status`로 확인, DB_URL `…54322`). 테스트 실행 전 Docker 켜져 있어야 함.
- **다음 빈 마이그 번호**: `00037`. (직원웹 밴드 `00033~00051`.)
- **결번**: **Task 16·Task 23은 존재하지 않는다**(플랜에서 다른 태스크로 흡수·삭제됨). 남은 것 = Task 4~15, 17~22, 24~30.

---

## 3. ~~첫 작업 = seam 배선~~ ✅ **완료 (2026-08-24, `fcb5808`)** — Codex는 Task 4부터 시작

> ✅ Claude가 자리 비우기 전에 배선 완료(`backend/app/routers/schedule_change.py` + main.py 등록 + 위임 테스트 2건, 전체 172 passed). **Codex의 첫 작업 = §4 Wave A ② Task 4 스캐폴딩.** 아래는 배선 내용 기록(참고용).

**(완료 내용) 이걸 먼저 끝내야 화면들이 깨끗한 지점에서 시작한다.** 교차 의존(Task 2 서비스 ↔ 라우터)이라 코디네이터가 직접(또는 Luna-max 워커 1개로) 신중히.

- **파일**: `backend/app/routers/schedule_change.py`(신설) + `backend/app/main.py`에 라우터 등록 + `backend/tests/test_staff_web_routers.py`에 테스트 추가.
- **엔드포인트 2개** — **Task 2 서비스를 그대로 노출**(재계산 금지, 규칙 `SCHED-CALC-02`):
  - `POST /appointments/{id}/reschedule` → `schedule_change.reschedule_appointment(appointment_id, ...)`
  - `GET /schedule/affected` → `schedule_change.list_affected_appointments(conn, *, candidate_exception=, exception_id=, deactivating_doctor_id=, for_role=)`
- **테스트**(TDD): `test_reschedule_라우터는_Task2_서비스를_그대로_노출한다` — 라우터가 서비스를 호출만 하고 로직을 다시 구현하지 않음을 검증. 상세 골격 = 플랜 line ~1191.
- **완료 기준**: RED→GREEN, focused 테스트 통과, `db reset` 없이. 커밋: `git add backend/app/routers/schedule_change.py backend/app/main.py backend/tests/test_staff_web_routers.py`.

---

## 4. 실행 순서 — 3파(wave)

의존을 지키는 최소 직렬 + 최대 병렬. **화면들은 각자 자기 route 폴더만 만지므로 병렬 충돌 0**(demo slice2에서 5워커 충돌 0 재현됨). **공용 파일**(`routes.tsx`·`StaffShell`·`_ui`·공용 mockData)은 **워커가 안 건드리고 코디네이터가 병합 때 배선**한다.

```
Wave A  (직렬, 코디/단일워커 — 모든 것의 관문)
  ① seam 배선(§3)  →  ② Task 4 스캐폴딩+인증+셸+역할 라우팅

Wave B  (병렬 — Task 4 진행과 동시에 가능, 서로 독립 파일 = 백엔드/기반)
  Task 5  API 클라이언트 레이어        (Luna-max)
  Task 6  patients 라우터 + 마스킹      (Luna-max)
  Task 13 조회 전용 백엔드             (Luna-max)
  Task 17 일정 백엔드 + 운영시간 판정기 (Sol-high)   ← 어려움
  Task 25 통계 대기지표 백엔드          (Luna-max)
  Task 7  공통 컴포넌트 + 되돌리기(00037)(Sol-high)   ← 시각, Task 4 셸 후

Wave C  (Task 4·5·7 완료 후 — 화면 15개, 폴더 격리 병렬)
  8·9·10·11·12·14·15·18·19·20·21·22·24·26·27·28·29·30
  (Task 18은 Task 17 후 · Task 30은 Task 28 후 · Task 26은 Task 21 후)
```

**선행 하드 규칙**:
- **Task 4 → 모든 프론트**(스캐폴딩이 없으면 화면이 못 뜬다). Task 4는 **한 워커가 신중히**(구조는 한 번 잘 깔아야).
- **Task 5(API 클라)·Task 7(공통 컴포넌트) → 모든 화면**이 소비. Wave C 전에 끝낸다.
- **Task 13(조회 백엔드) → 화면 8·10·11·12**가 데이터 소비. Task 17 → Task 18. Task 6 → Task 10·24. Task 25 → Task 12.
- 한 파에서 **병렬 워커는 5개 이하**로(계정 spend limit·리뷰 부하). 화면 15개는 3배치로 나눠 돌린다.

---

## 5. ⭐ 태스크별 실행 표 (번호·모델·파일·데모·seam 다 박음)

> **마이그 번호는 이 표 + `MIGRATION-LEDGER.md`가 정본.** 플랜 산문의 옛 번호(00017 등)는 **+16 시프트**로 무시하고, 플랜의 `Create: supabase/migrations/…` 줄만 믿는다.
> **모델·노력**은 기준선이다 — 실제 난이도를 보고 코디가 라우팅(과투입 금지: 쉬운 로직은 Luna, 정말 어려운 것만 Sol/Terra). 시각 화면 기준선 = **Sol-high**(Sol-medium은 시각에 얕음), 밀도 높은 화면만 **Sol-xhigh/Terra**.
> **배정 하드 게이트**: 해당 행 선택 → §11에 `route` 기록 → 명시적 model/effort로 fresh terminal 생성 → 원격 `/status`에서 model·effort·context <40% 확인 → dispatch. 상세 명령·override·리뷰 규칙은 플레이북 §2-A. 기본 모델 추정 금지.

### ⚠️⚠️ 포팅의 핵심 함정 — **데모는 규칙을 다 반영하지 않는다**

> ⭐ **정본은 `screen-behaviors.md` 규칙이다. 데모는 「어떻게 보이나」의 시각 참고일 뿐, 「무엇이 있어야 하나」의 목록이 아니다.** 데모만 보고 옮기면 **데모가 빠뜨린 규칙이 그대로 빠진다.** 데모는 사용자 검수를 거쳤어도 규칙의 부분집합이다.

**데모가 규칙을 놓치는 4가지 형태(다 겪음)**:
1. **한 상태만 그림** — 데모는 보통 데이터가 찬 「해피 패스」 한 장. 빈 상태·로딩·오류·각 상태 전이는 규칙(`*-EMPTY/STATE/ERR/LOAD/RACE`)에 있고 데모엔 없다. → 규칙이 정의한 **모든 상태를 구현**(디자인 세션의 「상태 모음판」 개념 = 같은 요소의 모든 상태를 다 만든다).
2. **옛 라벨/값** — 예: 기간 선택기 데모 「30일·90일」 vs 정본 `PERIOD-BOX-02` 「1개월·3개월」.
3. **규칙 자체 누락** — 데모가 그 동작을 안 그림.
4. **요구사항 좁힘** — 예: 검색을 데모가 「이름만」으로 좁혔는데 규칙·요구사항은 전화번호도(실제 이 프로젝트에서 갭 6갈래로 터졌던 형태).

**작업 방법 = 「규칙 워크」(데모 워크 아님)**:
- 화면의 `screen-behaviors.md` 규칙을 **한 줄씩 훑으며** 각 규칙의 시각 짝을 데모에서 찾는다.
  - ① 데모에 있고 규칙과 맞으면 → 구조·간격을 **포팅**.
  - ② 데모에 **없거나 규칙과 다르면** → **규칙이 이긴다.** 규칙대로 구현하고, 새 시각이 필요하면 데모의 디자인 시스템(`tokens.css`·간격 리듬) 위에서 그린다. **← 이것이 「신규 요소」**(frontend-design SKILL.md 경로 참조).
- ⭐ **"이 화면 다 됐나"의 판정 = 데모와 닮았나가 아니라 「규칙 ID를 다 덮었나」.** 테스트가 규칙 ID 기반인 이유가 이것 — 데모엔 없어도 규칙 ID가 있으면 테스트로 강제된다.

> **즉 "신규 요소"란 = 규칙엔 있는데 데모엔 없거나 틀린 것.** 그것을 찾는 방법이 바로 위 규칙 워크다. 찾으면 데모 스타일 위에서 새로 그리고(경로 참조), 못 찾으면(데모가 다 맞으면) 그냥 포팅.

| Task | 화면/내용 | 종류 | 마이그 | 모델·노력 | 데모 레퍼런스 (`demo/src/routes/`) | 의존·주의 |
|---|---|---|---|---|---|---|
| **4** | React 스캐폴딩+직원 인증+공통 셸+역할 라우팅(`/login`) | 구조/시각 | — | **Sol-high**(구조 1회) | `staff/auth/Login.tsx`·`staff/StaffShell.tsx`(사이드바 4그룹·헤더 세 문) | **모든 프론트의 관문. 직렬.** |
| **5** | API 클라이언트 레이어 + 오프라인·오류 계약(`OFFX-STAFF-*`·`ERR-*`) | 로직 | — | **Luna-max** | — | 모든 화면 선행 |
| **6** | `patients` 라우터 + 마스킹·열람 기록(`MASK-*`·`SEARCH-LOG-*`) | 로직 | — | **Luna-max** | — | Task 10·24가 소비 |
| **7** | 공통 컴포넌트 + 되돌리기 계약(`PANEL/UNDO/BTN/PICK-*`) | 시각 | **00037** `status_undo` | **Sol-high** | `staff/_ui.tsx`(`Panel`·`PeriodSelect`·StatTile)·`staff/doors/*` | 화면들 선행. Task 4 셸 후 |
| **8** | `/today` 오늘의 현황(`TODAY-*`) | 시각 | — | **Sol-high** | `staff/today/Today.tsx` | Task 13 소비 |
| **9** | `/queue` 대기 목록 + 당일 방문 등록(`QUEUE-*`) | 시각 | 00038 `walkin_visit_time`* | **Sol-high** | `staff/queue/Queue.tsx` | |
| **10** | `/patients/:id` 환자 상세(`PTDET-*`) | 시각 | — | **Sol-high** | `staff/patient/PatientDetail.tsx` | Task 6·13 |
| **11** | `/doctor/console` 의사 진료 콘솔(`DOCTOR-*`) | 시각(밀도) | — | **Sol-xhigh** | `staff/doctor/DoctorConsole.tsx`(3단·작성 칸 위·과거 아래) | Task 3(진료문구)·13 |
| **12** | `/admin/stats` 운영 통계(`STAT-*`) | 시각(밀도) | — | **Sol-xhigh** | `staff/admin/record/Stats.tsx` | Task 13·25 |
| **13** | 조회 전용 백엔드(today 요약·대기·이력·콘솔·통계) | 로직 | — | **Luna-max** | — | 화면 8·10·11·12 선행 |
| **14** | `/calendar` 예약 캘린더 + Realtime(`CAL-*`·`SUPPORT-CAL-*`) | 시각(최고밀도) | 00039 `appointment_time_range_realtime` | **Sol-xhigh** | `staff/calendar/Calendar.tsx`(종일·지금 선·시간축 확대) | Realtime 주의 |
| **15** | `/admin/access-logs` 열람 기록(`ALOG-*`·`SEARCH-LOG-*`) | 시각 | 00040 `access_audit_log_index` | **Sol-high** | `staff/admin/record/AccessLogs.tsx` | Task 6 |
| **17** | 진료과·일정 관리 백엔드 + **운영시간 단일 판정기**(`SCHED-DEPT/SLOT-*`) | 로직(어려움) | 00041 `hospital_hours_closures` | **Sol-xhigh** | — | Task 18 선행. **하드 판단** |
| **18** | `/admin/schedule` 화면 + 라우트 조립(`SCHED-TAB/GRID/WEEK/SAVE/EXC/HOURS-*`) | 시각 | — | **Sol-high** | `staff/admin/config/Schedule.tsx` | **Task 17 후** |
| **19** | `/admin/staff` 직원 관리 + 의사 프로필·캘린더 색(`STAFF-*`·`CAL-COLOR-*`) | 시각 | 00042 `staff_profile_palette` | **Sol-high** | `staff/admin/config/StaffAdmin.tsx` | |
| **20** | `/checkin` QR·예약번호 접수(`CHKIN-*`) | 시각 | 00043 `fix_booking_code_length`(6자리 버그수정) | **Sol-high** | `staff/checkin/Checkin.tsx`·`CheckinForm.tsx`(두 버튼) | |
| **21** | `/admin/patient-merge-candidates` 중복 병합(`MERGE-*`) | 시각(밀도)+**비가역** | 00044 `patient_merges` | **Sol-max + Terra-high 독립리뷰** | `staff/admin/record/MergeCandidates.tsx` | **파괴적 동작 — 신중** |
| **22** | `/admin/questionnaires` 문진표 관리(`QADM-*`) | 시각 | 00046 `questionnaire_versions` | **Sol-high** | `staff/admin/config/Questionnaires.tsx` | 불변 버전 |
| **24** | `/patients` 전역 환자 검색(`SEARCH-*`) | 시각 | — | **Sol-high** | `staff/patients/PatientSearch.tsx` | Task 6 |
| **25** | 운영 통계 — 오래 대기 건수·명단(`STAT-METRIC-04`) | 로직 | 00047 `search_audit_counts` | **Luna-max** | — | Task 12 소비 |
| **26** | `/admin/merge-history` 병합 이력·되돌림(`MHIST-*`) | 시각+**비가역** | — | **Sol-max + Terra-high 독립리뷰** | `staff/admin/record/MergeHistory.tsx` | **Task 21 후. 파괴적** |
| **27** | `/admin/errors` 시스템 오류(`ERRADM-*`) | 시각 | 00048 `system_error_safe_summary` | **Sol-high** | `staff/admin/record/Errors.tsx` | 안전 요약(redaction) |
| **28** | `/messages` 발송 만들기 — 제1문·패널·enqueue(`SEND-*`·`MSGX-*`) | 시각+로직 | 00049 `scheduled_notifications_cancel` | **Sol-high** | `staff/messages/Messages.tsx` | Task 30 선행 |
| **29** | `/admin/settings` 병원 설정(`HSET-*` 71 + `HSETX-*` 19) | 시각(최고밀도) | 00051 `hospital_settings_full`(공유칸 `if not exists`) | **Sol-xhigh** | `staff/admin/config/HospitalSettings.tsx` | **⚠️ 없는 칸 저장값처럼 노출 금지**(`HSETX-DATA-01`) |
| **30** | `/messages` 발송 결과·실패·재시도(`SEND-RESULT/RETRY/FAIL/DEAD-*`) | 시각+로직 | 00050 `notification_log_dispatch` | **Sol-high** | `staff/messages/Messages.tsx` | **Task 28 후**(세로 분할 2/2) |

\* 00038·00045 등 라벨 없는 번호는 원장 「Create 줄 기준」을 따른다. 새 마이그가 필요하면 **직원웹 밴드 다음 빈 번호**를 쓰고 원장을 갱신.

> **📌 상담봇 그룹 화면**(문의함·상담기록·안내자료·미해결·오답·품질·현황)은 이 플랜이 아니라 **`ai-chatbot` 플랜(4단계)이 소유**한다 — 직원웹 3일 범위 밖. 손대지 말 것.

---

## 6. 병렬 워커 규율 (이번에 확립 — 어기면 가짜 실패)

1. **같은 워크트리·다른 파일**(화면별 route 폴더 격리). 공용 파일은 워커 금지 → **코디가 병합 때 배선**.
2. **커밋은 코디네이터가** worker_done마다. 워커는 **자기 파일만 `git add`**(`git add -A` 금지 — 남의 미커밋까지 삼킴).
3. 워커는 **`supabase migration up`만**(`db reset` 절대 금지 — 공유 DB라 남의 데이터 날림). **focused 테스트만** 돌린다.
4. **전체 회귀는 코디가 클린 DB(`supabase db reset`)에서 1회**. ⚠️ **코디가 검증을 반복하면 공유 DB가 오염돼 가짜 실패**가 난다 — 리셋하면 사라지는 실패는 오염이지 진짜 버그가 아니다.
5. 격리 워크트리(`orca worktree create`)를 쓰면 `.venv`·`node_modules` 없음 → 워커 브리프에 **`python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt` / `cd frontend && npm install` 먼저**를 반드시 넣는다.
6. 창구는 브리프에 `Consumes:`/`Produces:`로 **이름 명시**(우리말 서술은 기계가 못 봄). DB 칸이 나오면 서버층 짝 확인.

---

## 7. 워커 브리프 템플릿 (복붙용)

> 워커는 콜드 스타트다 — 브리프는 **자체완결**이어야 한다. 아래 골격에 태스크별 값만 채운다. **개행 없이 한 줄로** `orca terminal send`(TUI 조기 제출 방지). `!`·작은따옴표 넣지 말 것.

### 백엔드 워커 (로직/마이그)
```
저장소=병원 예약 시스템(FastAPI+Supabase). 브랜치 merge/design-integration. 로컬 supabase :54322 기동중.
스킬: supabase-postgres-best-practices 를 참조로 읽어라(마이그·RLS).
범위: Task {N} = {한 줄 요약}. 읽을 것: docs/superpowers/plans/2026-08-15-staff-web.md 의 ## Task {N} 절 전체 + 거기 가리키는 screen-behaviors.md 규칙 줄범위 + MIGRATION-LEDGER.md.
마이그 번호는 {00037 등}(원장 정본, 플랜 산문 옛번호 무시). 
TDD: RED(실패 테스트 먼저)→GREEN→REFACTOR. 테스트 한 줄에 규칙 ID 하나, assert에 값 하나.
DB: supabase migration up 만(db reset 금지). focused 테스트만.
컨텍스트: Task 시작·종료 /status. 40%부터 새 읽기·탐색·하위 dispatch 금지→가장 가까운 GREEN/커밋 후 context_handoff 보고. 50% 이상은 상태 저장·보고만. 수치 확인 불가면 다음 Task 연속 수행 금지.
커밋: 매 GREEN마다, 자기 파일만 git add({파일 목록}). 공용 파일(main.py 등 공유) 손대면 코디에 보고.
경계: {건드리지 말 것}. 끝에 DONE + 커밋한 것 1줄.
```

### 시각 화면 워커 (포팅)
```
저장소=병원 직원 웹(React+TS+Vite). 브랜치 merge/design-integration.
작업 전 항상 읽어라: /Users/kimjunkee/.claude/plugins/cache/claude-plugins-official/frontend-design/unknown/skills/frontend-design/SKILL.md (시각 설계 렌즈). 단 적용은 데모에 없는 신규요소·데모가 애매한 미세판단(간격/위계)에만 — 데모가 이미 정한 것은 재설계 금지, 충실 포팅.
범위: Task {N} = {화면}. 읽을 것: plans/2026-08-15-staff-web.md 의 ## Task {N} 절 + screen-behaviors.md 규칙 줄범위.
⭐ 시각 레퍼런스(포팅 원본): demo/src/routes/{경로}.tsx — 구조·레이아웃·간격·컴포넌트 분해를 그대로 옮기고, 가짜 데이터→React Query(Task5 API클라 사용), 하드코딩 값→src/styles/tokens.css(Task0). 자유 리디자인 아님.
⚠️ 데모는 규칙의 부분집합이다(다 반영 안 함). 정본=screen-behaviors 규칙. 규칙을 한 줄씩 훑어(규칙 워크) 데모에 없거나 틀린 규칙을 찾아라 — 모든 상태(빈/로딩/오류/각 상태), 옛 라벨(예 기간 30일→1개월), 누락 동작, 좁혀진 요구사항. 그런 것=신규 요소 → 데모 스타일(tokens·간격) 위에서 새로 그린다(필요시 frontend-design SKILL.md 경로 참조). "다 됐나"의 판정=데모와 닮았나가 아니라 규칙 ID를 다 덮었나.
격리: 자기 route 폴더만 생성/수정. 공용 파일(routes.tsx·StaffShell·_ui·공용 mockData) 절대 금지 — 코디가 배선.
새 워크트리면: cd frontend && npm install 먼저.
TDD: 규칙 ID 기반 테스트(비가시 엣지 *-STATE/ERR/LOAD/RACE/LIVE·세션 제외). tsc --noEmit 0 + vitest 통과.
컨텍스트: Task 시작·종료 /status. 40%부터 새 읽기·탐색·하위 dispatch 금지→가장 가까운 GREEN/커밋 후 context_handoff 보고. 50% 이상은 상태 저장·보고만. 수치 확인 불가면 다음 Task 연속 수행 금지.
커밋: 자기 파일만 git add. 끝에 DONE + 커밋한 것 1줄.
```

---

## 8. ✅ 코디네이터(Codex) 자기점검 — 커밋·병합 전마다

- [ ] 워커가 **자기 파일만** 손댔나? (`git status`로 공용 파일 오염 확인)
- [ ] 마이그 번호가 **이 표/원장과 일치**하나? 번호 중복 없나? (`python3 docs/design/spec-index/plan-migration-check.py` = exit 0)
- [ ] **전체 회귀를 클린 DB에서 1회** 돌렸나? (`supabase db reset` 후 `pytest`) — 반복 검증으로 오염 만들지 말 것.
- [ ] 시각 화면이면: 데모 컴포넌트 대비 **구조·간격이 포팅**됐나? 하드코딩 색이 `tokens.css`를 쓰나?
- [ ] 선행 의존이 먼저 끝났나? (Task 5·7 없이 화면 병합 금지 / Task 17 없이 Task 18 금지)
- [ ] 비가역 화면(Task 21·26)이면: 빨간 버튼이 **확인창 안에만** 있나? 막다른 길 없나? 되돌림 경로 있나?
- [ ] 커밋 메시지에 Task 번호·마이그 번호 명시. 병합은 `git merge --no-ff`.
- [ ] `HANDOFF.md` 최상단 + 이 문서 §10에 **어디까지 했나 1줄** 갱신.

### 8-R. Codex 자체 코드 리뷰 (3일 동안, 병합 전)

> Claude가 없으니 리뷰도 Codex가 한다. **코드를 쓴 워커가 자기 리뷰를 하지 않는다** — 별도 창/워커가 본다(자기 코드는 눈이 먼다).

- **리뷰 스킬은 Codex 네이티브다** — 파일 경로를 읽을 필요 없이 그냥 쓴다:
  - `.system/review-agent` — 결함 우선 read-only 리뷰(다른 에이전트가 위임한 diff/브랜치/커밋을 검토, 발견만 반환). **리뷰 워커의 기본기.**
  - `requesting-code-review` — 무엇을 확인하나(요구사항 충족·엣지·계약). `receiving-code-review` — 발견을 무비판 수용/무조건 반박 말고 검증.
  - `verification-before-completion` — "됐다"고 말하기 전 **증거(실행한 명령·출력)를 먼저** 확인. 이 프로젝트의 핵심 규율.
- **태스크 하나가 끝나면**(병합 전) 코디가 **리뷰 워커 1개**(Luna-max로 충분, `review-agent` 스킬로)를 띄워 확인시킨다. 리뷰 브리프:
  ```
  Task {N}의 diff를 리뷰만 한다(코드 수정 금지, 발견만 보고). review-agent 스킬로. 읽어라: plans/2026-08-15-staff-web.md 의 ## Task {N} 절 + 해당 screen-behaviors 규칙.
  확인: (1) 규칙 ID를 테스트가 실제로 지키나(빈 assert·항상참 테스트 아님) (2) 마이그 번호가 원장과 맞나 (3) 시각 화면이면 데모 구조 포팅됐나·하드코딩 색 없나 (4) 비가역 동작이 확인창 안에만 있나·막다른 길 없나 (5) 자기 파일 밖(공용 파일) 안 건드렸나.
  출력: 심각도순 발견 목록 + 각 발견의 파일:줄. 없으면 "이상 없음". 끝에 DONE.
  ```
- 코디는 발견을 보고 **원 워커에게 수정 지시**(또는 코디 직접). **모든 발견 처리 후에만 병합.**
- ⚠️ **performative 동의 금지**: 리뷰 발견이 틀릴 수도 있다 — 무비판 수용도, 무조건 반박도 아니고 **원문·테스트로 검증**하고 판단(`receiving-code-review` 정신).

---

## 9. 함정 모음 (계속 적용)

- **마이그 번호**: 플랜 산문의 `00017`류는 낡음(+16). `Create:` 줄과 `MIGRATION-LEDGER.md`만 믿는다. 다음 빈 번호 **00037**.
- **Task 16·23은 결번** — 찾지 말 것.
- **공유 DB 오염 = 가짜 실패**: 리셋하면 사라지는 실패는 버그 아님. 워커 `db reset` 금지, 코디 회귀는 클린 1회.
- **`git add -A` 금지**: 남의 미커밋 삼킴. 자기 파일만.
- **공용 파일은 코디만**: `routes.tsx`·`StaffShell`·`_ui`·공용 mockData·`main.py`. 워커가 만지면 병합 충돌.
- **환자 노출 문구**: "취소 요청 접수/등록" 금지 → **"상담(직원 확인)으로 연결"만**.
- **되돌릴 수 없는 동작은 눈에 덜 띄게**(빨간 버튼은 확인창 안에서만). **막다른 길 금지**(막으면 해결 경로 함께). **끌 수 없는 스위치 금지**.
- **개인정보 열거 방지**: 맞든 틀리든 같은 화면으로 진행.
- **이모지 금지** — 아이콘은 SVG `<symbol>`+`<use>`.
- **낡은 `⏳`/미결**을 그대로 믿지 말 것 — 주제어 grep 재확인.
- **Codex는 codex 창을 새로 못 띄운다**(auto 분류기 차단). 첫 창은 사람이 ORCA 앱에서 열고, 이후 codex↔codex 팬아웃. 조종(list/read/wait/send)은 통과 — 상세 `IMPL-ORCHESTRATION-PLAYBOOK.md §4`.

---

## 10. 🔁 3일 뒤 Claude(원 코디네이터) 복귀 리뷰 체크포인트

> Claude가 토큰 회복 후 돌아왔을 때, Codex가 3일간 쌓은 것을 **효율적으로 이어받아 리뷰**하는 절차. Codex의 §8-R(진행 중 리뷰)와 **중복 아님** — 이건 복귀 시 한 번, 넓게 훑는 스윕이다.

**복귀 즉시 순서**:
1. **어디까지 갔나**: `git log --oneline 8c1a59c..HEAD` (마지막 Claude 커밋 `8c1a59c` 이후 전부) + 이 문서 §11 진행 로그 + `HANDOFF.md` 최상단.
2. **번호 무결성**: `python3 docs/design/spec-index/plan-migration-check.py`(exit 0) + `ls supabase/migrations/`가 원장 `00033~`와 순서·번호 일치하나(빠진 번호·중복 없나).
3. **초록불 확인**: `supabase db reset` → 전체 `pytest`(백엔드) + `cd frontend && npx tsc --noEmit && npx vitest run`. **클린 DB 1회**(§6). 숫자를 눈으로 확인(verification-before-completion).
4. **태스크별 대조 리뷰**(커밋된 것마다): 그 Task의 `## Task N` 절 + `screen-behaviors.md` 규칙 vs 실제 코드. **규칙 ID가 테스트로 실제 지켜지나**(빈 테스트·항상참 아님). Codex가 놓치기 쉬운 것 = **교차 계약**(라우터가 서비스를 재구현했나 / DB 칸과 서버층 짝 / seam이 재계산 안 하나).
5. **시각 스윕**: `cd frontend && npm run dev`(또는 데모와 나란히) — 화면이 데모 구조를 포팅했나, 하드코딩 색이 `tokens.css`를 쓰나, 막다른 길·확인창 밖 빨간 버튼 없나. (Claude 브라우저 확장 연결되면 직접 캡처, 아니면 사용자에게 `npm run dev` 요청.)
   ⚠️ **판정 기준은 「데모와 닮았나」가 아니다** — 데모는 규칙의 부분집합이라, Codex가 **데모만 보고 옮겨 규칙을 빠뜨렸을 위험이 여기 몰린다**(특히 빈/로딩/오류/각 상태, 옛 라벨, 좁혀진 검색). 화면마다 `screen-behaviors.md` 규칙을 훑어 **규칙 ID를 다 덮었나**로 본다(§5 「포팅의 핵심 함정」).
6. **비가역 화면 정밀**(Task 21·26): 파괴 버튼이 확인창+읽음체크 뒤에만, 되돌림/정정 경로 있나 — 여기만 Terra급 주의로 코드를 정독.
7. **결정 정합**: Codex가 **미결을 스스로 판단해 진행한 곳**이 있나? 그런 건 사용자 확인 대상 → 결정로그(`2026-07-31-ui-design-decisions.md`)에 없으면 사용자에게 하나씩(묶어 객관식 금지, CLAUDE.md 소통 규칙).

**리뷰 산출**: `/code-review` 슬래시(현 diff/브랜치 대상)로 자동 리뷰 1패스 + 위 4~7의 수기 대조. 발견은 심각도순, 사용자에게 요약 보고 후 수정 착수.

> ⭐ **Codex에게 남길 표식**: 3일 동안 §11 진행 로그에 **각 Task 커밋 해시 + 미결로 스스로 판단한 것**을 반드시 적게 한다(위 7번이 이것에 의존). "판단한 것"이 로그에 없으면 Claude가 그 지점을 놓친다.

---

## 11. 진행 로그 (세션 간 이어쓰기 — 여기에 어디까지 했나 1줄씩)

- **2026-08-24**: Task 0·1·2 + Task 3(진료문구 부분) 커밋(`8c1a59c`). 이 실행 시트·AGENTS.md·플레이북 커밋(`89e6a8c`). **seam 배선 완료(`fcb5808`) — schedule_change 라우터 2종, 전체 172 passed.** 미결로 판단한 것: reschedule 권한을 `receptionist·admin`으로 둠(서비스가 역할 제약을 따로 안 걸어 라우터에서 최소 권한 부여 — Task 18 화면 붙일 때 재확인).
- **2026-08-24 컨텍스트·모델 규율 확정**: 매 Task `/status`; 40% 인계 준비·50% 절대 상한; ACTIVE/STANDBY 단일 지휘권 바통. 모델은 §5 행 → 명시적 실행 → `/status` 검증. 상세 정본=플레이북 §2-A·§4-A·§4-B. 이후 로그 형식=`Task N — route model/effort/이유 — 커밋 — ctx 시작 N% → 종료 N% — 미결 판단`.
- **다음(Codex) = §4 Wave A ② Task 4 스캐폴딩 → Wave B 병렬 백엔드/기반.**
- (Codex가 이어서 여기에 추가 — 각 Task: `Task N — 커밋해시 — 미결로 스스로 판단한 것(있으면)`)
