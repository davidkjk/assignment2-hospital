# 환자앱 시뮬레이터 검수 갭 일괄 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 안드로이드 에뮬 real↔demo 검수(세션3·4)에서 확정된 환자앱 갭을 재구현 없이 표적 수정한다 — 백엔드 500 1건 + 기능 갭 5건 + UI 데모톤 리스킨.

**Architecture:** 세 층으로 나눈다. ① 백엔드 1건(`hospital_settings` 환자 read를 SECURITY DEFINER 함수로 열어 500 해소 → 3화면 동시 복구). ② Flutter 기능 갭(대부분 위젯은 이미 존재 — 파싱·검증·렌더 로직 수정). ③ Flutter UI 리스킨(데모의 조밀 shadcn 톤 + 앱바 아이콘, `frontend-design` 스킬 경유, 골든+데모 대조가 게이트). 각 Flutter 태스크의 합격 = `flutter test`(회귀 가드) **+ 골든 재생성 + real↔demo 눈대조**(jsdom/유닛만으론 시각 충실도 못 잡음 — 메모리 [[feedback-patient-app-golden-gate-mandatory]]).

**Tech Stack:** 백엔드 FastAPI + asyncpg + Supabase RLS(SQL 마이그레이션) · 환자앱 Flutter(Riverpod, 골든 `matchesGoldenFile`) · 검수 = 안드로이드 에뮬 `px`(adb 무점유) + 데모 :5175 헤드리스.

**Spec:** 갭 목록 정본 = `tools/shot/qa-patient/qa-notes.md`(세션3·4 절). 규칙 정본 = `docs/design/screen-behaviors.md`「# 환자 앱」. 데모 = `demo/src/routes/patient/**`(참고, 낡을 수 있음 — 충돌 시 규칙 우선).

## Global Constraints

- **워크트리**: 환자앱 코드는 `.claude/worktrees/patient-app/patient_app/`(브랜치 `feat/patient-app`). 백엔드는 메인 워크트리 `backend/`. ⚠️ 워크트리엔 `HANDOFF*.md`·`CLAUDE.md` 없음(gitignore) — 핸드오프 갱신은 워크트리 밖에서.
- **Flutter SDK**: `/Users/kimjunkee/dev/flutter/flutter/bin/flutter`.
- **색 하드코딩 금지**: 신규 색은 `design-tokens/tokens.json`의 `patientApp.*`에 추가 → `node build.mjs flutter`로 `lib/core/tokens.dart` 재생성(생성물, 직접 편집 금지). 정본 [[project-patient-app-theme-and-golden]].
- **프론트 작업 전 `frontend-design` 스킬 먼저 invoke**(Wave 2·3 전체).
- **커밋은 태스크마다**(구현 단계 규율). 커밋 메시지에 규칙 ID 포함.
- **데모가 낡아 안 따르는 것(수정 대상 아님)**: 문진 객관식(규칙 QADM-FORM-05=short/long/yes_no만) · 알림설정 빨강(규칙=주황) · real이 나은 것(눈아이콘 가림·날짜 한글·선택칩 누적).
- **마이그 번호**: `docs/design/spec-index/MIGRATION-LEDGER.md`가 정본. 환자앱 밴드(00017–32)·직원웹(00033–52) 가득, 데모병합 후속 = 00070–(현재 최신 `00076`). 신규 = **`00077`**, 배정과 동시에 ledger에 등록.

---

## 파일 지도 (수정/생성 대상)

**Wave 1 (백엔드 500)**
- `supabase/migrations/00077_public_hospital_info.sql` (생성) — SECURITY DEFINER 함수
- `backend/app/services/settings_service.py:166-176` (수정) — `get_public_hospital_info`가 함수 호출
- `backend/tests/test_settings.py` (수정) — 환자/익명 컨텍스트 200 회귀

**Wave 2 (기능 갭)** — 워크트리 `.claude/worktrees/patient-app/patient_app/lib/`
- `features/questionnaire/questionnaire_wizard.dart` · `question_field.dart` · `questionnaire_controller.dart` (필수검증 + yes_no 위젯)
- `features/appointments/appointment_list_qnr_line.dart` · `my_appointments_data.dart` (사전문진 줄 파싱/렌더)
- `features/notifications/notification_view.dart` · `notification_data.dart` (유형별 카드)
- `features/appointment/detail_sections.dart` · `features/booking/steps/*` (상태이력줄)

**Wave 3 (UI 리스킨)**
- `lib/core/theme.dart` + `design-tokens/tokens.json`(밀도 토큰) · 각 화면 `Scaffold.appBar`(아이콘·타이틀) · `features/appointment/detail_sections.dart`·`features/booking/steps/*`(의사 아바타) · `features/history/history_screen.dart`(연도 바로가기·배지) · `features/appointments/my_appointments_screen.dart`(레이아웃 컴팩트)

---

## Wave 0 — 재실측 전제 정리 (코드 수정 아님 · 확인)

> 검수계정 연결이 재시드로 다시 풀렸고(조도현 2명 모두 `auth_user_id` NULL), 2건은 실측이 있어야 갭 여부가 확정된다. Wave 1 착수 전 한 번에 정리한다.

### Task 0: 검수환경 정상화 + 미확정 2건 실측

**Files:** 없음(DB·에뮬 조작만). 결과는 `tools/shot/qa-patient/qa-notes.md`에 기록.

- [ ] **Step 1: 검수계정 재연결** — 예약 많은 조도현을 본인으로 붙인다.
  ```bash
  docker exec supabase_db_foundation-auth-data-model psql -U postgres -d postgres -c \
   "update public.patients set auth_user_id='cccccccc-0000-0000-0000-000000000001' where id=(select p.id from public.patients p left join public.appointments a on a.patient_id=p.id where p.name='조도현' group by p.id order by count(a.id) desc limit 1);"
  ```
  (⚠️ `appointments` FK 컬럼명 실측 후 확정 — grep `patient` in `supabase/migrations/*appointment*`.)
- [ ] **Step 2: 오늘 예약 1건 심기** — 홈 "오늘의 예약" 카드 렌더/빈상태 판정용. 검수 조도현에게 오늘(`current_date`) 미래 시각 예약 1건 삽입.
- [ ] **Step 3: BOOK-TARGET-DUP 실측** — 에뮬 재기동(핸드오프 「안드로이드 에뮬 재기동」 순서) → 예약 마법사 1단계 스샷. 현재 DB엔 조도현 `patient_family_links` 0행 → **중복이 재현되면** 시드/본인매핑 버그(코드 갭), **안 되면** 이전 관찰이 stale(Wave에서 제외).
- [ ] **Step 4: 홈 오늘예약 카드 실측** — Step 2 후 홈 재로드 스샷. 카드가 그려지면 갭②는 stale, 안 그려지면 도착상태 카드 렌더 버그(Wave 2에 추가).
- [ ] **Step 5: 기록** — qa-notes.md에 BOOK-DUP·홈카드 판정 확정. 갭이면 아래 해당 Wave에 태스크 편입, 아니면 "stale 제외" 명기.

**게이트:** 두 미확정 항목이 "코드 갭 / stale" 중 하나로 확정되어야 Wave 2 범위가 닫힌다.

---

## Wave 1 — 백엔드: 병원정보 500 (최우선 · 3화면 동시 복구)

> **근본원인(실측 확정)**: `settings_service.get_public_hospital_info`가 `acquire_as(None)`(익명)으로 `hospital_settings`를 읽는데, 그 테이블 SELECT 정책은 `staff_can_read_hospital_settings`(`private.is_active_staff()`) **하나뿐** → 익명/환자는 0행 → `dict(None)`류 500. 훼손 3화면: 예약상세 장소·전화(`APPT-INFO-04·05`) / 홈 병원정보줄(`HOME-INFO`) / 설정 병원안내.
>
> **해결(추천 = SECURITY DEFINER)**: 공개 필드(주소·전화)만 반환하는 SQL 함수를 SECURITY DEFINER로 만든다. 함수 소유자 권한으로 RLS를 우회하되 **딱 그 두 컬럼만** 노출 → 내부 설정(운영시간·문구·시크릿) 유출면 0. 대안(환자 read 정책 + 컬럼 GRANT)은 테이블을 넓게 열어 유출면이 크므로 기각.

### Task 1: 병원 공개정보 SECURITY DEFINER 함수 + 서버 배선

**Files:**
- Create: `supabase/migrations/00077_public_hospital_info.sql`
- Modify: `backend/app/services/settings_service.py:166-176`
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Produces: `public.get_public_hospital_info() returns table(hospital_address text, hospital_phone text)` — SECURITY DEFINER, `anon`·`authenticated`에 EXECUTE GRANT. 서비스 `get_public_hospital_info()`는 이 함수를 `select * from public.get_public_hospital_info()`로 호출하고 dict 반환(없으면 빈 문자열 기본, `None` 금지).

- [ ] **Step 1: 실패 테스트** — 익명/환자 컨텍스트에서 200 + 두 필드.
  ```python
  # backend/tests/test_settings.py
  async def test_public_hospital_info_readable_without_staff(anon_conn):
      info = await settings_service.get_public_hospital_info(conn=anon_conn)
      assert "hospital_address" in info and "hospital_phone" in info
      assert info["hospital_address"] is not None  # 500/None 아님
  ```
- [ ] **Step 2: 실패 확인** — `Run: cd backend && pytest tests/test_settings.py::test_public_hospital_info_readable_without_staff -v` · Expected: FAIL(0행 → 500/None).
- [ ] **Step 3: 마이그레이션 작성** — `00077_public_hospital_info.sql`:
  ```sql
  create or replace function public.get_public_hospital_info()
  returns table (hospital_address text, hospital_phone text)
  language sql stable security definer set search_path = public as $$
    select hospital_address, hospital_phone from hospital_settings where id;
  $$;
  revoke all on function public.get_public_hospital_info() from public;
  grant execute on function public.get_public_hospital_info() to anon, authenticated;
  ```
- [ ] **Step 4: 마이그 적용** — `Run: cd frontend && npx supabase db push`(또는 로컬 reset 후 seed). ⚠️ 공용 DB reset은 다른 세션 신호 확인 후(메모리 [[project-parallel-tasks-shared-db]]).
- [ ] **Step 5: 서비스 수정** — `settings_service.py` `get_public_hospital_info`의 `query`가 `select hospital_address, hospital_phone from hospital_settings` → `select * from public.get_public_hospital_info()`로. `dict(row)`가 None일 때 빈 문자열 기본값으로 방어.
- [ ] **Step 6: 통과 확인** — `Run: cd backend && pytest tests/test_settings.py -v` · Expected: PASS.
- [ ] **Step 7: 엔드투엔드 실측** — 환자 토큰으로 `GET :8001/catalog/hospital` → 200 + 주소·전화. (라우트 핸들러 위치는 `grep -rn "catalog/hospital" backend/app`로 확인 — `get_public_hospital_info` 호출부.)
- [ ] **Step 8: 3화면 눈대조** — 에뮬 재로드: 예약상세 장소·전화 카드 / 홈 병원정보줄 / 설정 "가온병원" 부제가 살아났는지 스샷.
- [ ] **Step 9: ledger 등록 + 커밋** — MIGRATION-LEDGER.md에 `00077` 등록.
  ```bash
  git add supabase/migrations/00077_public_hospital_info.sql backend/app/services/settings_service.py backend/tests/test_settings.py docs/design/spec-index/MIGRATION-LEDGER.md
  git commit -m "fix(patient): 병원 공개정보 500 해소 — get_public_hospital_info SECURITY DEFINER (APPT-INFO-04·05·HOME-INFO)"
  ```

---

## Wave 2 — Flutter 기능 갭 (데모/규칙이 요구, real 누락)

> ✅ **완료(2026-09-01 세션5)**: Task 3·4·5 구현·유닛·골든·**에뮬 real 검증** 완료(커밋 `1a50bd5`·`12ffb7a`·`3ff04ac`). Task 2·6은 규칙상 폐기. 세 태스크 모두 **원인이 「type/게이트 값 불일치」**(위젯은 이미 존재)였고, 유닛이 한글/잘못된 픽스처로 통과해 놓쳤던 것 — 픽스처를 실 API 계약으로 정렬해 사각지대를 닫음. 검증 정본=`tools/shot/qa-patient/qa-notes.md` 「Wave 2 구현·에뮬 검증」.
>
> 위젯 대부분 이미 존재(`appointment_list_qnr_line.dart` 등) — 파싱·검증·렌더 로직 수정. 각 태스크 합격 = `flutter test` + 골든 재생성 + real↔demo 눈대조.

### Task 2: 사전문진 필수 검증 (QNR-REQUIRED) — ⛔ 폐기(2026-09-01 세션5)

> **폐기 사유**: 확정 결정 **B-29**(`QNR-REQ-01·02·04·10`)이 "필수 비워도 [다음]·[제출] **막지 않는다**"를 명시하고 차단을 명시적으로 기각한다. `required`=병원 확인 표시지 입력 강제가 아님. **real이 이미 규칙대로 맞고 데모가 낡음** — 세션4가 "데모에 있으니 갭"으로 적은 오판. 아래 원안은 참고로 남긴다(실행하지 않음).

**Files:**
- Modify: `lib/features/questionnaire/questionnaire_controller.dart` · `questionnaire_wizard.dart` · `confirm_screen.dart`
- Test: `test/features/questionnaire/questionnaire_required_test.dart`(생성)

**Interfaces:**
- Consumes: 문항 `{text, type, show_to, required}`(규칙 QADM-FORM-05). Produces: 컨트롤러에 `bool get canAdvance`(현재 문항 required && 빈값이면 false) + `bool get canSubmit`(모든 required 채워짐).

- [ ] **Step 1: 실패 테스트** — required 미입력 시 「다음」 비활성 + 제출 차단, 미입력 안내 노출.
  ```dart
  testWidgets('QNR-REQUIRED: 필수 미입력이면 다음/제출 차단', (t) async {
    // required=true 문항 3번을 비운 채 진행 시도
    // expect: 「다음」 disabled, "필수 문항에 답해 주세요" 노출, 제출 버튼 미도달
  });
  ```
- [ ] **Step 2: 실패 확인** — `Run: flutter test test/features/questionnaire/questionnaire_required_test.dart` · Expected: FAIL(현재 통과함).
- [ ] **Step 3: 구현** — 컨트롤러에 `canAdvance`/`canSubmit` + 마법사 「다음」·「제출하기」 `onPressed: canX ? ... : null` + 미입력 안내 텍스트(규칙 색, danger 아님 — 주황/보조). 제출 성공 시 완료 피드백(토스트/완료문구) 추가.
- [ ] **Step 4: 서버 검증 확인** — 제출 API가 required 미충족을 거부하는지 실측(`grep required backend/.../questionnaire*`). 없으면 서버 검증 태스크 별도 편입.
- [ ] **Step 5: 통과 + 골든 재생성 + 커밋** — `flutter test` · 관련 골든 `--update-goldens` · demo 대조 · commit `fix(patient-app): 사전문진 필수 검증·완료 피드백 (QNR-REQUIRED)`.

### Task 3: yes_no 문항 예/아니오 위젯 (QNR-YESNO) — ⚠️ 원인 정정(2026-09-01 세션5)

> **정정**: 위젯은 **이미 존재**(`question_field.dart`: `예/아니오`→큰버튼2·`장문형`→여러줄·`단답형`→한줄). 진짜 버그 = **type 값 불일치** — 백엔드 정본 `QUESTION_TYPES=("short_text","long_text","yes_no")`(영문)을 `get_template`이 그대로 내리는데 위젯·**모든 테스트가 한글 값**(`예/아니오`)으로 분기 → 전부 default(한줄 텍스트칸)로 떨어짐. 수정 = 위젯·테스트를 정본 영문으로 정렬(테스트가 실계약 반영). `long_text` 여러 줄 깨짐도 같이 해소.

**Files:**
- Modify: `lib/features/questionnaire/question_field.dart`
- Test: `test/features/questionnaire/question_field_yesno_test.dart`(생성)

**Interfaces:**
- Consumes: 문항 `type == 'yes_no'`(DB 실측 = 6문항 실존). Produces: `type=='yes_no'`면 텍스트칸이 아닌 세그먼트/토글(예/아니오) 렌더, 값은 `'예'`/`'아니오'`(또는 bool) 저장.

- [ ] **Step 1: 실패 테스트** — `type:'yes_no'` 문항이 TextField 아닌 예/아니오 선택 위젯으로 렌더.
- [ ] **Step 2: 실패 확인** — Expected: FAIL(현재 TextField).
- [ ] **Step 3: 구현** — `question_field.dart` 분기에 `yes_no` case 추가(SegmentedButton 또는 ChoiceChip 2개). 값 저장·복원(resume) 연동. 색은 `patientApp.*` 토큰.
- [ ] **Step 4: 통과 + 골든 + 커밋** — commit `fix(patient-app): yes_no 문항 예/아니오 위젯 (QNR-YESNO)`.

### Task 4: 예약목록 사전문진 줄 렌더 (LIST-QNR-01)

**Files:**
- Modify: `lib/features/appointments/appointment_list_qnr_line.dart` · `my_appointments_data.dart`
- Test: `test/features/appointments/list_qnr_line_test.dart`(생성/수정)

**Interfaces:**
- Consumes: `AppointmentView`의 문진 3필드(`questionnaireState`·`answered`·`total`, T31 파싱 — `fromJson` 확인). Produces: 문진 미작성/작성중 예약 줄 아래 `사전문진 미작성 · 작성하기 ›`(하늘색, 규칙상 목록 줄의 유일한 예외 줄).

- [ ] **Step 1: 실패 테스트** — 문진 미작성 예약 줄에 사전문진 안내줄 존재.
- [ ] **Step 2: 실패 확인** — Expected: FAIL(현재 안 보임 — 파싱/조건 문제).
- [ ] **Step 3: 원인 확인** — `my_appointments_data.dart`가 문진 3필드를 파싱하는지, `appointment_list_qnr_line.dart` 표시 조건이 맞는지 실측(핸드오프 「환자앱 T31」 함정). null이면 `LIST-QNR-03`의 `(3/8)`이 빈다.
- [ ] **Step 4: 구현 + 통과 + 골든 + 커밋** — commit `fix(patient-app): 예약목록 사전문진 줄 렌더 (LIST-QNR-01·03)`.

### Task 5: 알림함 유형별 카드 (UI-NOTI)

**Files:**
- Modify: `lib/features/notifications/notification_view.dart` · `notification_data.dart`
- Test: `test/features/notifications/notification_typed_test.dart`(생성)

**Interfaces:**
- Consumes: 알림 레코드의 유형 필드(`type`/`kind` — 실측). Produces: 유형별 아이콘·제목(확정☑·변경❗·문진📋·전날📅·상담💬) + 구체 제목·이름·내용. 데모 = `demo/src/routes/patient/**` 알림 카드.

- [ ] **Step 1: 실패 테스트** — 확정 알림이 "예약이 확정되었어요" 유형 제목·아이콘으로 렌더(제네릭 "안내입니다" 아님).
- [ ] **Step 2: 실패 확인** — Expected: FAIL(현재 전부 제네릭).
- [ ] **Step 3: 유형 매핑 실측** — 알림 레코드가 유형을 담는지(`notification_data.dart` + 서버 payload). 없으면 유형은 payload에서 파생. 규칙 `NOTI-*` 대조.
- [ ] **Step 4: 구현** — 유형→아이콘·제목 맵 + 카드 위젯. 아이콘 = SVG symbol 재사용 원칙(이모지 금지).
- [ ] **Step 5: 통과 + 골든 + demo 대조 + 커밋** — commit `fix(patient-app): 알림함 유형별 카드 (UI-NOTI)`.

### Task 6: 예약상세·완료단계 상태이력줄 (UI-DETAIL) — ⛔ 폐기(2026-09-01 세션5)

> **폐기 사유**: 데모 ApptDetail:130에만 있고 **환자앱 규칙 없음.** real은 상태 배지(`APPT-HEAD-01`)+확정전 안내(`APPT-HEAD-05`)+도착후 안내(`APPT-BTN-04`)로 이미 규칙대로 그린다. step7 의사 아바타는 Wave 3(Task 8) 리스킨 몫으로 별개. 아래 원안은 참고로 남긴다(실행하지 않음).

**Files:**
- Modify: `lib/features/appointment/detail_sections.dart` · `lib/features/booking/steps/`(최종확인/완료)
- Test: `test/features/appointment/detail_status_history_test.dart`(생성)

**Interfaces:**
- Consumes: 예약 상태 + 접수처·시각. Produces: 배지 아래 `상태: 진료대기 · 접수처 · 시각` 이력 텍스트줄(데모 `ApptDetail:130`).

- [ ] **Step 1: 실패 테스트** — 예약상세에 상태이력 텍스트줄 존재.
- [ ] **Step 2~4: 실패확인 → 구현 → 통과+골든+커밋** — commit `fix(patient-app): 예약상세 상태이력줄 (UI-DETAIL)`.

---

## Wave 3 — UI 데모톤 리스킨 (frontend-design · 골든+데모 대조 게이트)

> 사용자 결정: **전 화면 데모(조밀 shadcn) 톤으로 리스킨 + 앱바 아이콘 추가.** 규칙 우선(강조색 주황 유지 등), 밀도·컴포넌트는 데모 방향. `frontend-design` 스킬 먼저 invoke.

### Task 7: 밀도 토큰 + 앱바 아이콘·타이틀 공통화

**Files:**
- Modify: `design-tokens/tokens.json`(밀도 토큰) → `node build.mjs flutter` → `lib/core/tokens.dart`(생성) · `lib/core/theme.dart` · 각 화면 `Scaffold.appBar`
- Test: `test/features/home/shell_tabbar_test.dart`(회귀) + 골든

**Interfaces:**
- Produces: 카드 패딩·간격·라운드 토큰(데모 밀도) + 앱바 공통 위젯 `PatientAppBar(title, icon)` — 📅나의 예약·👥가족·🕐이력·💬AI상담(SVG symbol, 이모지 아님). 앱바 타이틀 규칙 정정: 예약목록 "예약" → **"나의 예약"**(`LIST-ROLE`).

- [ ] **Step 1: 토큰 추가** — `tokens.json` `patientApp.density.*`(gap/pad/radius) 데모 값 → 재생성.
- [ ] **Step 2: 공통 앱바 위젯** — `PatientAppBar` + 전 화면 타이틀·아이콘 배선. "예약"→"나의 예약".
- [ ] **Step 3: 회귀 통과 + 전 골든 재생성** — `flutter test` + `--update-goldens`. real↔demo 앱바 대조.
- [ ] **Step 4: 커밋** — `feat(patient-app): 밀도 토큰·공통 앱바 아이콘·나의 예약 타이틀 (UI 리스킨 · LIST-ROLE)`.

### Task 8: 의사 이니셜 아바타

**Files:** Modify `lib/features/appointment/detail_sections.dart` · `lib/features/booking/steps/`(의사선택·최종확인) · 공통 아바타 위젯. Test: 골든.
- [ ] Step 1~4: 이니셜 아바타 위젯(데모 DoctorAvatar) → 예약상세·step7·의사선택 배선 → 골든 → 커밋 `feat(patient-app): 의사 이니셜 아바타 (UI-DETAIL·UI-BOOK)`.

### Task 9: 이력 연도 바로가기 + 상태 배지

**Files:** Modify `lib/features/history/history_screen.dart` · `history_row_detail.dart`. Test: 골든.
- [ ] Step 1~4: 연도 바로가기 칩(`[2026년][2025년]`) + 상태 배지화(진료완료/취소됨·취소시각) → 골든 → 커밋 `feat(patient-app): 이력 연도 바로가기·상태 배지 (UI-HISTORY)`.

### Task 10: 예약목록 컴팩트 레이아웃 + 잔여 시각 정리

**Files:** Modify `lib/features/appointments/my_appointments_screen.dart` · `appointment_list_row.dart` · `appointment_list_status.dart`. Test: 골든.
- [ ] Step 1~4: 큰 컬러블록 시각 → 컴팩트 리스트(데모) · 대상 이름+관계 라벨 · QR 버튼 줄바꿈 해소 · 설정 전화변경 링크 이질감·비번 규칙 박스 묶음 정리 → 골든 → 커밋 `feat(patient-app): 예약목록 컴팩트 레이아웃·잔여 UI 정리 (UI-LIST·UI-SETTINGS·UI-PW)`.

---

## Self-Review 체크

- **Spec 커버리지**: qa-notes 세션4 핵심 갭 ①~⑨ 매핑 — ①병원정보500=Task1 / ②알림함=Task5 / ③예약목록 사전문진줄=Task4 / ④아바타·상태이력=Task6·8 / ⑤QNR-REQUIRED=Task2 / ⑥yes_no=Task3 / ⑦BOOK-DUP=Task0(실측) / ⑧이력 연도=Task9 / ⑨밀도=Task7·10. **빠짐 없음.**
- **데모 낡음 제외 확인**: 문진 객관식·알림설정 빨강·눈아이콘/한글날짜/선택칩 = Global Constraints에 "수정 대상 아님" 명기.
- **실측 의존**: BOOK-DUP·홈 오늘예약 카드는 Task0 게이트 후 Wave 편입 여부 확정(현재 미편성 — stale 가능성).
- **타입 일관성**: `get_public_hospital_info`(Task1) → 3화면 위젯은 기존 `hospitalInfoProvider` 경유(신규 시그니처 없음). Flutter 신규 인터페이스(`canAdvance`/`canSubmit`·`PatientAppBar`)는 정의 태스크에서 생성.
