# 마이그레이션 번호 원장 (C2 정본)

> **무엇**: `00017` 이후 모든 신규 마이그레이션의 **단일 번호 배정표**. ⑦ 구현 때 물리적 파일을 만들 때 이 표의 번호를 그대로 쓴다.
> **왜**: 두 트랙(직원웹·환자앱)과 챗봇·배포가 같은 `00017+` 대역을 공유한다. 각자 임의로 번호를 잡으면 충돌해 배포가 물리적으로 깨진다(지난 C2 클러스터 = 15개 중복 + 유령 `00025`).
> **강제**: `python3 docs/design/spec-index/plan-migration-check.py` — 4플랜의 `Create: supabase/migrations/…` 선언을 전수 대조해 **충돌·구멍**을 잡는다(현재 exit 0). ⚠️ 검사기는 **밴드를 하드코딩하지 않는다** — 「같은 번호를 둘이 선언」만 잡는다. 밴드 규율은 이 문서가 정본.
> **출처**: C2 재번호(커밋 `a6e226c`·`5f09a61`·`8b481cd`, 2026-08-20). 이 표는 각 플랜의 실제 `Create:` 줄에서 추출(2026-08-20 재확인).

## 밴드 배정

| 대역 | 소유 | 플랜 |
|---|---|---|
| `00001`–`00016` | **기반(1단계)** — 이미 적용됨 | (적용 완료, `supabase/migrations/`) |
| `00017`–`00032` | **환자앱(3단계)** | `2026-08-17-patient-app.md` |
| `00033`–`00051` | **직원웹(2단계)** | `2026-08-15-staff-web.md` |
| `00052`–`00058` | **챗봇(4단계)** | `2026-08-18-ai-chatbot.md` |
| `00059`– | **배포(5단계)** | `2026-07-27-deployment.md` |

**다음 빈 번호**: 환자앱 `00033`은 이미 직원웹 것 → 환자앱 밴드는 `00032`까지 **가득**. 직원웹 다음 = `00052`(챗봇 시작 전까지). 새 마이그가 필요하면 **자기 트랙 밴드의 다음 빈 번호**를 쓰고, 밴드가 차면 이 문서를 갱신해 대역을 넓힌다.

## 전체 배정 (Create 줄 기준 = 정본)

### 환자앱 `00017`–`00032`
| # | 파일 | 내용 |
|---|---|---|
| 00017 | `patient_identity_rls` | 환자 신원 + `patient_owns()` + 환자용 RLS (T1) |
| 00018 | `patient_family_link_rpcs` | 가족 링크 RPC (T3) |
| 00019 | `bookable_slots` | 예약 카탈로그 + 시간 판정 (T4) |
| 00020 | `booking_idempotency` | 예약 생성 멱등성 + `auto_confirm_app_bookings` `if not exists` (T5) |
| 00021 | `questionnaire_completion` | 사전문진 완료 판정 (T7) |
| 00022 | `wait_estimate` | 당일 대기·예상 시간 (T8) |
| 00023 | `device_tokens` | 알림 dispatcher + `sms_enabled` `if not exists` (T9) |
| 00024 | `patient_consents` | 동의 (T13) |
| 00025 | `cancellation_actor` | 취소 주체 4칼럼 (C2 유령 00025 해소) |
| 00026 | `notifications_seen_at` | 알림 읽음 (T18) |
| 00027 | `cancel_rejected` | 취소 반려 저장칸(`cancel_rejected_at`·`_reason`) (T22) |
| 00028 | `patients_gender_check` | 성별 CHECK |
| 00029 | `patients_app_created_by` | 앱 생성자 |
| 00030 | `family_link_requests` | 가족 연결 요청 (T26) |
| 00031 | `patient_notification_prefs_and_public_hours` | 알림 설정 + 공개 운영시간 |
| 00032 | `patient_withdrawal` | 회원 탈퇴 (T29) |

### 직원웹 `00033`–`00051`
| # | 파일 | 내용 |
|---|---|---|
| 00033 | `staff_web_settings_phrases` | 설정 확장 + 진료문구 (T1) |
| 00034 | `access_audit_log_events` | 열람 감사 사건 확장 + `patient_id` nullable + 검색어 (T1) |
| 00035 | `questionnaire_admin_rls` | 문진 답변 RLS admin 예외 제거 (T1) |
| 00036 | `schedule_change_ack` | 일정 변경 확인 (T2) |
| 00037 | `status_undo` | **예약 상태 한 칸 역전이**(갭 #82·잔여3 — 기반에서 넘어옴) (T7) |
| 00038 | `walkin_visit_time` | 워크인 방문 시각 |
| 00039 | `appointment_time_range_realtime` | 캘린더 Realtime (T14) |
| 00040 | `access_audit_log_index` | 열람 감사 인덱스 (T15) |
| 00041 | `hospital_hours_closures` | 운영시간·휴진 (T17) |
| 00042 | `staff_profile_palette` | 의사 프로필·캘린더 색 (T19) |
| 00043 | `fix_booking_code_length` | **예약번호 6자리 보장**(갭 #127 — 기반 `generate_booking_code()` 버그) (T20) |
| 00044 | `patient_merges` | 중복 환자 병합 (T21) |
| 00045 | `family_link_verification` | 가족 연결 대행 검증 |
| 00046 | `questionnaire_versions` | 문진표 버전 (T22) |
| 00047 | `search_audit_counts` | 검색 감사 건수 (T25) |
| 00048 | `system_error_safe_summary` | 시스템 오류 안전 요약 (T27) |
| 00049 | `scheduled_notifications_cancel` | 예약 발송 + 수신자 명단 고정 (T28, C1-5) |
| 00050 | `notification_log_dispatch` | 발송 로그·디스패처 (T30) |
| 00051 | `hospital_settings_full` | 병원 설정 전체 + `auto_confirm`·`sms_enabled` `if not exists` (T29) |

### 챗봇 `00052`–`00058`
| # | 파일 | 내용 |
|---|---|---|
| 00052 | `chat_core_schema` | 대화 코어 |
| 00053 | `chat_sessions_tickets` | 세션·티켓 |
| 00054 | `anonymous_chat_notifications` | 익명·배칭 |
| 00055 | `chat_sources_retention` | 근거·보존 |
| 00056 | `chat_orchestration_state` | 오케스트state |
| 00057 | `kb_pgvector` | KB pgvector |
| 00058 | `chat_quality` | 품질 |

### 배포 `00059`–
| # | 파일 | 내용 |
|---|---|---|
| 00059 | `overdue_no_shows` | 자정 부도 배치 (배포 T7B) |

## 공유 칸 — 순서 무관(`if not exists`)

두 트랙이 같은 칸을 만들 수 있으나, **먼저 적용하는 쪽이 만들고 뒤는 no-op**이 되도록 `add column if not exists`로 쓴다(C2-4, 커밋 `8b481cd`). 충돌 아님.

| 칸 | 만드는 곳 | 원소유(설정 화면) |
|---|---|---|
| `hospital_settings.auto_confirm_app_bookings` | 환자앱 `00020` **또는** 직원웹 `00051` | 직원웹 T29 |
| `hospital_settings.sms_enabled` | 환자앱 `00023` **또는** 직원웹 `00051` | 직원웹 T29 |

## ⚠️ 낡은 산문 참조 (Create 줄만 믿을 것)

직원웹 플랜의 **일부 산문·주석**은 재번호 전 **옛 논리 번호**를 그대로 쓰고 있다(Create 줄은 정정됨, 산문은 누락). **+16 시프트**로 읽는다:

| 산문의 옛 번호(직원웹) | 실제 | 위치 예 |
|---|---|---|
| `00017` | `00033` | Task 1 헤딩·`git add` 줄·`00004·00017` 서술 |
| `00018` | `00034` | 「00018이 patient_id nullable」 주석 6곳 |
| `00019` | `00035` | Task 1 `git add` 줄 |
| `00021` | `00037` | 「Task 7의 00021이 역전이」 주석 2곳 |

→ ⑦ 구현자는 **`Create: supabase/migrations/…` 줄과 이 원장**을 따르고, 산문 번호는 무시한다. (산문 정정은 후순위 정리 과제.)
