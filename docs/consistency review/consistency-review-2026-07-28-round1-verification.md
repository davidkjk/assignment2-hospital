# 1차 정합성 검토(`consistency-review-2026-07-28.md`) 계획서 반영 검증

검토일: 2026-07-28

배경: `consistency-review-2026-07-28.md`(1차, 이하 "1차 문서")는 이후 round2~5 및 그 통합본(`round2-5-consolidated.md`)에서 **의도적으로 검토 대상에서 제외**되어(각 문서 서두 참고), 지금까지 "1차 문서 지적이 실제로 계획서에 반영됐는가"를 확인한 기록이 없었다. 이 문서가 그 공백을 메운다.

판정 기준: round2-5 통합본 §6과 동일하게 **계획 문서 수준의 반영 여부**만 본다(실제 코드 구현·`supabase db reset`·pytest/vitest 실행 여부는 별도 확인 필요). 각 항목은 1차 문서가 남긴 근거 줄번호를 시작점으로, 현재 계획서에서 재검색해 판정했다.

## 요약

**[2026-07-28 재검증(1차 문서 보완)]** 아래 최초 판정(19✅/5⚠️/7❌)에서 남아 있던 ⚠️ 5건 + ❌ 7건(iOS 2건은 같은 작업이라 실질 6종) 전부를 서브에이전트 5개(1~5단계 계획서별)로 나눠 **계획 문서 수준에서** 보완했다. 아래 표와 각 단계 절의 판정은 이 보완 작업 이후 기준으로 갱신했다.

| 구분 | 건수 | ✅ 완전반영(계획 수준) | ⚠️ 부분반영 | ❌ 미반영 |
|---|---|---|---|---|
| 즉시 수정 필요 | 15 | 15 | 0 | 0 |
| 높은 우선순위 보완 | 12 | 12 | 0 | 0 |
| 교차 단계 결정 | 4 | 4 | 0 | 0 |
| **합계** | **31** | **31** | **0** | **0** |

**결론**: 31건 모두 계획 문서 수준에서는 반영 완료다. **단, 이 판정은 계획서에 Task/Step·근거·테스트 계획이 추가됐다는 뜻이지, 실제 코드가 그렇게 동작한다는 뜻이 아니다** — round2-5 통합본 §6과 동일한 구분이다. 특히 5단계(배포)는 이번에 CORS·KST타임존·CI(webchat job)·iOS 서명 빌드까지 신규 Task로 추가된 것이라, 실제 구현 착수 전까지는 여전히 배포 리스크가 코드 상으로는 그대로 남아 있다는 점을 유의할 것.

## 1단계(기반) — `2026-07-27-foundation-auth-data-model.md`

| # | 이슈 | 판정 | 근거 |
|---|---|---|---|
| 즉시1 | 완료 진료기록 직접 UPDATE 우회 | ✅ | `revise_medical_record` RPC가 사유·낙관적잠금(`updated_at`)·이력삽입을 원자화(라인 1693~1770). 직접 UPDATE는 트리거가 거부(`raise exception '완료된 진료기록은...'`, 라인 1702) |
| 즉시2 | 다른 의사 예약에 진료기록 작성 가능 | ✅ | 트리거가 `medical_records.doctor_id`와 실제 담당의 일치를 강제(라인 1668~1689) |
| 즉시3 | 예약 상태전이·이력·낙관적잠금이 서비스코드에만 있음 | ✅ | `enforce_appointment_status_transition`(라인 1067~1089), `log_appointment_status_change` 트리거가 SECURITY DEFINER로 DB단 강제. 서비스는 "1차 안내"로 격하(라인 3599) |
| 즉시4 | 슬롯/의사/진료과 정합성, 의사 역할 제약 없음 | ✅ | `enforce_appointment_consistency` 트리거가 의사 활성상태·진료과 일치·슬롯담당의 일치를 모두 검증(라인 1003~1039) |
| 즉시5 | 사전문진 전체 활성직원 열람 가능 | ✅ | `assigned_doctor_can_read_responses` RLS가 예약 담당의(+관리자 예외)만 허용(라인 2011~2022) |
| 우선1 | 슬롯 생성 배치가 설계에만 있음 | ✅ | 2단계 `regenerate_slots`(idempotent, dry_run 미리보기, 휴진/점심시간 반영, 테스트 4건)로 구현 — 2단계 판정표 참고 |
| 우선2 | 30분 무활동 로그아웃 ≠ JWT 만료, 직원 비활성화가 세션 무효화 안 함 | ✅ | **[재검증]** 절대만료 유지 판단 근거를 문서화하고, `deactivate_staff`에 `admin.auth.admin.sign_out(auth_user_id, scope="global")` 호출 추가 — 비활성화 즉시 Auth 세션도 실제로 끊기도록 Task 12에 반영, 검증 테스트 신설 |
| 우선3 | 예약 생성 시 초기 상태를 채널별로 서버가 고정하지 않음 | ✅ | **[재검증]** `ALLOWED_INITIAL_STATUS_BY_SOURCE` 화이트리스트를 `create_appointment`에 도입, 라우터에서 `source="staff"` 강제. app이 "진료완료"를 초기상태로 시도하는 등 부정 케이스 거부 테스트 2건 추가(Task 14) |

## 2단계(직원 웹) — `2026-07-27-staff-web.md`

| # | 이슈 | 판정 | 근거 |
|---|---|---|---|
| 즉시6 | 일정 CRUD·`/calendar-slots`·라우트 조립·응급표시 미구현 | ✅ | Task 17(백엔드)·18(프론트) 신설, 라인 5088에서 갭을 명시하고 구현 |
| 즉시7 | 일정관리 화면이 하드코딩 `doc1` 수준 | ✅ | Task 17의 실제 API로 교체(라인 6036) |
| 즉시8 | 캘린더 클릭 코드가 `DateClickArg`에 없는 `arg.event` 사용 | ✅ | `eventClick(EventClickArg)`로 수정, 주석으로 이전 버그 명시(라인 4057~4063) |
| 우선4 | 의사화면(대기목록·사전문진·과거기록·수정이력), 환자상세(예약/방문이력·문진·과거기록·가족관계) UI 누락 | ✅ | **[재검증]** `DoctorConsolePage`에 `DoctorQueuePanel`/`AppointmentQuestionnairePanel`/`PatientHistoryPanel`/`RecordRevisionHistoryPanel` 추가(Task 11), `PatientDetailPage`에 방문이력·가족관계 섹션 추가(Task 10), 백엔드에 `get_appointment_questionnaire`/`get_patient_medical_history`/`get_patient_visits`/`get_patient_family` 신설(Task 13, 1단계 RLS 재사용) |
| 우선5 | 운영통계 과/의사별·시간대·장기대기·드릴다운·CSV, 전화 신규환자 등록, 오늘현황 타일 목록이동 | ✅ | **[재검증]** `get_stats(..., by=)`로 과/의사별 분해, `get_stats_detail`+`/stats/detail`로 드릴다운, `StatsPage`에 CSV 다운로드 버튼 추가(Task 12·13). `StatTile onClick`을 실제 상태와 맞는 항목만 `/queue`로 연결하고, 대응 화면이 없는 타일은 임의 연결 대신 사유를 명시(Task 16) |
| 교차 | 취소요청 대기열의 2→3단계 의존 | ✅ | 완료 조건 분리 대신 Consumes 절에 3단계 선행 의존을 명시적으로 문서화(라인 4397~4398) — 숨은 의존이 아니라 드러난 계약으로 전환 |

## 3단계(환자 앱) — `2026-07-27-patient-app.md`

| # | 이슈 | 판정 | 근거 |
|---|---|---|---|
| 즉시9 | 본인 식별자를 literal `'self'`로 전송 | ✅ | `MyProfileController`가 실제 patient UUID 로드, `'self'` 리터럴 코드베이스에서 전면 제거(라인 5452, 5542, 6964~6965) |
| 즉시10 | 예약 변경 UI 없음(진료과·의사·날짜·시간 placeholder) | ✅ | Task 20에서 새 슬롯 선택 다이얼로그 추가, 8단계 예약도 실제 API 연동 위젯으로 교체(라인 5452, 5914~5925) |
| 우선7 | 예약 API의 진료과/의사/슬롯 검증, 문진 템플릿-진료과 매칭 서버 검증 | ✅ | 슬롯-의사-진료과 정합성은 1단계 DB 트리거로 이미 커버. **[재검증]** `submit_response`에 `questionnaire_templates.department_id`와 예약 `department_id` 일치 검증 추가, 불일치 시 400 거부, 부정케이스 테스트 신설(Task 10) |
| 우선8 | 홈 예약카드 병원위치, 변경/취소 재확인 UX, Task27이 BusyButton/OfflineBanner 되돌리지 않음 | ✅ | `BusyButton`/`OfflineBanner`는 그대로 유지(회귀 없음). **[재검증]** `hospital_settings`에 주소·전화번호 컬럼 추가 + `GET /app/hospital-info` 신설, 홈 화면 예약카드에 표시(Task 7·8·13·22). 취소 버튼에 "정말 취소하시겠습니까?" 확인 다이얼로그 추가(Task 20) — 변경 플로우의 의도적 확인창 생략은 그대로 유지 |
| 교차 | 마감 후 환자 취소(별도 취소요청 큐 유지) | ✅ | `cancellation_requested_at` 컬럼 및 2단계 Task16 승인/반려 플로우로 결정대로 구현 |

## 4단계(AI 챗봇) — `2026-07-27-ai-chatbot.md`

| # | 이슈 | 판정 | 근거 |
|---|---|---|---|
| 즉시11 | 챗봇 예약 출처가 `app`으로 고정 저장 | ✅ | `create_booking(..., source="chatbot")` 명시 호출 + 테스트로 검증(라인 3752, 3833) |
| 즉시12 | 순차 문진 상태 미저장(라우팅 오류) | ✅ | `chat_conversations.active_flow`/`flow_step`/`flow_collected` 컬럼과 라우터 로직 추가(라인 76, 147, 2604~2677) |
| 즉시13 | 예약 확정 API가 소유권·nonce·카드 필드 미검증 | ✅ | 서버 발급 일회용 `nonce`로만 확정, 재사용 시 409, 카드 필드는 클라이언트를 신뢰하지 않고 DB에서 조회(라인 1823~1838, 4030~4067) |
| 우선9 | 업무시간외 응답시점 반영, 익명 인계 연락처 경합, 의료판단 티켓 재배정 권한 | ✅ | 재배정 권한은 R2-06으로 완전 반영(라인 2731~3066), 익명 연락처 저장은 조건부 UPDATE라 경합에도 안전(라인 2990~3004). **[재검증]** `is_business_hours()`를 `_handoff()`에 실제 연결해 업무시간 중/외로 "빠른 시일 내"/"다음 영업일에" 안내 문구를 분기, 검증 테스트 신설(Task 11) |
| 교차 | 웹 상담 방식(독립 webchat + iframe 위젯) | ✅ | `webchat/` Vite 앱 + `widget/loader.ts`로 결정대로 구현, 5단계 문서와 계약 공유 명시(라인 4870~4886) |

## 5단계(배포) — `2026-07-27-deployment.md`

| # | 이슈 | 판정 | 근거 |
|---|---|---|---|
| 즉시14 | iOS는 시뮬레이터까지만 계획 | ✅ | **[재검증, 사용자 Apple 개발자 계정 보유 확인]** Task 10에 Step 4.5 신설 — Xcode Team 연결→App ID 등록→Distribution Certificate/Provisioning Profile→`flutter build ipa`→`codesign -dv` 서명검증→TestFlight 업로드(스토어 심사 제출은 범위 밖 명시) |
| 즉시15 | 웹 상담 산출물 계약 충돌(webchat vs web-widget) | ✅ | 4단계와 동일 계약(`webchat/dist/widget.js`, `HospitalChatWidget.init`)으로 통일(라인 1808~1860) |
| 우선10 | KST 08:00 크론과 UTC `date.today()` 날짜 경계 오류 | ✅ | **[재검증]** `reminders.py`/`backup.py`/시드 스크립트에 `_today_kst()`(`zoneinfo("Asia/Seoul")`) 헬퍼 도입, Railway 컨테이너가 UTC라는 근거 명시(Task 6·7·9) |
| 우선11 | `ALLOWED_ORIGINS` 기반 CORS 및 preflight 스모크 테스트 | ✅ | **[재검증]** `.env.example`에 `ALLOWED_ORIGINS` 추가, `CORSMiddleware` 설정 Step 신설(Task 14), `smoke.py`에 `check_cors_preflight()`로 OPTIONS preflight 검증 추가(Task 19) |
| 우선12 | CI/배포 게이트에 웹 상담 앱 포함, Claude/OpenAI/FCM 장애·티켓 fallback·익명 rate limit 배포 검증 | ✅ | **[재검증]** CI에 `webchat` job(vitest/build/widget 빌드) 및 `deploy-webchat` job 신설(Task 11·17). 스모크에 `smoke_rate_limit.py`(익명 rate limit)와 OpenAI/FCM 장애 시나리오 검증 추가(Task 19) |
| 교차 | iOS 납품 범위(Apple 계정 등록 후 서명된 IPA) | ✅ | 위 즉시14와 동일 Task로 반영 완료 |

## 다음 단계 제안

**[2026-07-28 재검증 완료]** 위 31건은 이제 계획 문서 수준에서 전부 반영됐다. 다음 단계는 실제 코드 구현이다 — 이 문서의 판정은 "계획서가 실행 가능한 수준으로 작성됐는지"이지 "코드가 그렇게 동작하는지"가 아니라는 점을 다시 강조한다(§요약 참고).

1. **5단계(배포) 신규 반영분**을 가장 먼저 실제 구현 권고 — CORS는 배포 즉시 웹 상담·직원 웹이 API를 호출 못 하는 실사용 장애로 직결되므로 최우선.
2. 1단계 "예약 초기상태 화이트리스트"와 3단계 "문진 템플릿-진료과 매칭"은 같은 성격(클라이언트 입력을 서버가 검증 없이 신뢰)이라 구현도 함께 묶어 처리 가능.
3. 2단계 "의사화면/환자상세 UI"는 항목이 많으니(대기목록·문진·과거기록·수정이력·방문이력·가족관계) 백엔드 4개 엔드포인트 → 프론트 4개 패널 순으로 나눠 구현.
4. iOS 서명 빌드(즉시14/교차4)는 Apple 개발자 계정 보유가 확인됐으므로 Task 10 Step 4.5부터 바로 착수 가능 — 단 Xcode/macOS 환경이 필요해 원격 코딩 에이전트로는 어려울 수 있다는 점 사용자에게 미리 안내.
5. 계획 문서 수정 후 실제 코드 반영 전이므로, 각 항목의 실패 테스트가 실제로 실패하는지(TDD의 red 단계) 먼저 실행해 계획과 실제 코드 상태가 일치하는지 확인하고 시작하는 것을 권장.
