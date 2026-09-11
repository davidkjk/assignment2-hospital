# 마이그레이션 번호 원장 (C2 정본)

> **무엇**: `00017` 이후 모든 신규 마이그레이션의 **단일 번호 배정표**. ⑦ 구현 때 물리적 파일을 만들 때 이 표의 번호를 그대로 쓴다.
> **왜**: 두 트랙(직원웹·환자앱)과 챗봇·배포가 같은 `00017+` 대역을 공유한다. 각자 임의로 번호를 잡으면 충돌해 배포가 물리적으로 깨진다(지난 C2 클러스터 = 15개 중복 + 유령 `00025`).
> **강제**: `python3 docs/design/spec-index/plan-migration-check.py` — 4플랜의 `Create: supabase/migrations/…` 선언을 전수 대조해 **충돌·구멍**을 잡는다(현재 exit 0). ⚠️ 검사기는 **밴드를 하드코딩하지 않는다** — 「같은 번호를 둘이 선언」만 잡는다. 밴드 규율은 이 문서가 정본.
> **출처**: C2 재번호(커밋 `a6e226c`·`5f09a61`·`8b481cd`, 2026-08-20). 이 표는 각 플랜의 실제 `Create:` 줄에서 추출(2026-08-20 재확인).

> ⭐ **원격 적용 실측 정정(2026-09-10, `supabase migration list`)**: 원격(eebhfnguwdjdusafrain)은 **`00099`까지 전부 적용됨**. 아래 `00083`~`00099` 행(및 §밴드 산문)의 「⚠️ 원격 미적용 — 배포 시 db push」 표기는 **전부 낡았다** — 그 사이 누군가 push했다. **실제 유일한 원격 미적용 = `00100`**(support_tickets_realtime, 실시간 트랙). `00096`(chat_messages_realtime)도 이미 원격에 있다. KB 재임베딩 동반(00084·00097)도 이미 반영됨. ~~00083~00099 원격 미적용~~ ✅ **해소(2026-09-10 실측)**. 다음 세션은 개별 「원격 미적용」 산문을 믿지 말고 이 배너 + `supabase migration list` 실측을 정본으로 본다.

## 밴드 배정

| 대역 | 소유 | 플랜 |
|---|---|---|
| `00001`–`00016` | **기반(1단계)** — 이미 적용됨 | (적용 완료, `supabase/migrations/`) |
| `00017`–`00032` | **환자앱(3단계)** | `2026-08-17-patient-app.md` |
| `00033`–`00052` | **직원웹(2단계)** | `2026-08-15-staff-web.md` |
| `00053`–`00059` | **챗봇(4단계)** | `2026-08-18-ai-chatbot.md` |
| `00060`–`00069` | **배포(5단계)** | `2026-07-27-deployment.md` |
| `00070`– | **직원웹 데모병합 후속(2단계 오버플로)** | `2026-08-27-staff-web-demo-first-merge.md` |

**다음 빈 번호**: 환자앱 `00033`은 이미 직원웹 것 → 환자앱 밴드는 `00032`까지 **가득**. 직원웹 원래 밴드(`00033`–`00052`)는 S18 `merge_questionnaire_count`(`00052`)로 **가득 찼다**.
⭐ **데모병합 후속(A2·A3·A4…)은 새 밴드 `00070`–에 둔다**(2026-08-28 결정). 그래야 챗봇(`00053`–`00059`)·배포(`00060`–`00069`) **번호를 한 칸도 안 밀고** 그 상세 스펙의 산문 인용이 낡지 않는다(과거 재번호가 「낡은 산문 참조」 사고를 낸 선례 — 아래 절). `00053`–`00069`는 아직 파일 없는 **예약 구멍**이지만, 이 프로젝트는 DB 리셋 재적재라 **있는 파일만 순서대로 적용**돼 무해하다. 새 마이그가 필요하면 **자기 밴드의 다음 빈 번호**(데모병합 후속은 `00070`부터)를 쓰고, 밴드가 차면 이 문서를 갱신한다.
- **배정됨**: `00070` = `system_error_service_outage`(A2, 서비스 전체 장애 배지 `ERRADM-NOTI-02`) · `00071` = `appointment_urgent_flag_attribution`(A4-b, 응급표시 「누가·언제」 `QUEUE-URG-06`). `00078` = `chat_ticket_reassign_staff_read`(⭐ **챗봇 Task 17 오버플로** — 티켓 상세가 소비하는 `reassign_ticket`·`staff_mark_ticket_read` definer. 챗봇 밴드 `00053`–`00059`가 다 차고 `00060`–`00069`는 배포 밴드라, 밴드를 안 밀려고 오버플로 규율대로 꼬리 번호에 둔다). `00080` = `overdue_no_shows`(⭐ **배포 Task 7B** — 갭 #28·CARD-LATE-10 자정 부도 처리 `mark_overdue_no_shows()` + `appointment_status_history.changed_by` nullable 완화. 배포 밴드 `00060`–`00069`가 앞서 챗봇 오버플로로 다 밀려, 오버플로 규율대로 꼬리 번호에 둔다). `00081` = `patient_phone_change_requests`(⭐ **배포 Task 7D** — 갭 #19·결정 #4 직원 대행 전화번호 변경 OTP 요청 겸 감사 이력. verified_at 행이 「누가·언제·어느 번호→어느 번호」 변경 한 줄). `00082` = `staff_family_link_requests`(⭐ **배포 Task 7E** — 결정 #3 ㉠ 직원 대행 가족 연결 B 번호 OTP 요청 겸 감사 이력. verified_at 행이 「누가·언제·누구를 어떤 관계로 OTP 확인해 연결했나」 한 줄. `family_link_requests` 00030은 requesting_patient_id NOT NULL이라 재사용 불가 → 별도 표). `00083` = `patient_chatbot_booking_source`(⭐ **챗봇 Task ⑦** — 웹 상담봇 예약 실행. `patients_can_create_own_appointments`(00017) with check가 `source='app'`만 허용해 `create_booking(source='chatbot')`이 RLS로 막히던 잠재 버그 정정 → `source in ('app','chatbot')`. 챗봇 예약 경로가 처음 통했다. `patient_owns` 소유권 검증·기존 app 예약 불변, 추가 허용만·되돌림 가능. ⚠️ 원격 미적용 — 배포 시 db push. 챗봇 밴드 `00053`–`00059` 소진·`00060`–`00069` 배포 밴드라 꼬리 번호). `00084` = `kb_hybrid_search`(⭐ **챗봇 ⑦ RAG 품질** — pg_trgm 트라이그램 + `match_kb_chunks_hybrid` 하이브리드 검색·RRF 융합. "와이파이" 등 외래어 인계 문제 해소. 표 참조. ⚠️ 원격 미적용 — db push + bulk KB 재임베딩). `00085` = `unresolved_questions_nullable_ticket`(⭐ **챗봇 no_answer 칩 `WEBCHAT-NOANS`** — 자동 인계 폐기·칩 안내로 바꾸며 미해결을 티켓 없이도 기록하려 `unresolved_questions.ticket_id` NOT NULL 해제. 표 참조. ⚠️ 원격 미적용 — db push). `00086` = `chat_messages_route_taken_no_answer`(⭐ **챗봇 no_answer 칩 `WEBCHAT-NOANS` 보정** — `chat_messages.route_taken` CHECK(00057)에 `'no_answer'` 허용값 추가. A-①이 코드·00085만 넣고 이 제약을 빠뜨려 no_answer 경로가 봇 메시지 저장 시 500나던 함정. 표 참조. ⚠️ 원격 미적용 — db push). `00087`–`00090` = **보안 감사 수정(C, 2026-09-05, lane/security-fixes)** — F-02 문진이동 authz(`00087`)·F-04 광고동의 제외상태(`00088`)·F-05v2 자가INSERT 봉인(`00089`)·F-01 relink 봉인(`00090`). 표 참조. ⚠️ 원격 미적용 — 배포 시 db push. F-03(콜백 서명)은 마이그 없음(`config solapi_webhook_secret` 배포 env 필요, 없으면 fail-closed). `00091` = `stats_audit_payload`(⭐ **챗봇 B / `STAT-AUDIT-02`·`BOTSTAT-DASH-15`** — 통계 드릴다운·CSV 감사에 담을 비개인정보 payload 칸 6종(지표·기간2·대상 건수·CSV 행 수·억제 여부). 00034가 patient_id nullable + stats_drilldown/export 종류만 열고 칸이 없어 `audit_service.log_stats_*`가 값을 버리던 것 해소. 표 참조. ⚠️ 원격 미적용 — db push). `00092` = `booking_window_weeks_setting`(⭐ **예약 가능 기간 관리자 창구 `SCHED-WINDOW-*`** — `REGENERATION_WEEKS=8` 파이썬 상수를 `hospital_settings.booking_window_weeks`(1~26, 기본 8)로 승격. 슬롯 생성·예약 검증·문자 예약·대시보드 지평이 이 값을 읽는다. 줄이면 전 의사 재생성 시 범위 밖 빈 자리 삭제(예약된 자리는 유지·SCHED-SLOT-05). ⭐ **`appointment_slots`에 DELETE grant 추가**(잠재 버그 정정 — RLS 정책 `receptionist_admin_can_manage_slots`는 ALL 허용인데 테이블 GRANT에 DELETE가 빠져 슬롯 재생성의 빈자리 삭제가 authenticated에서 막히던 것. 환자는 DELETE 정책 없어 여전히 차단). ⚠️ 원격 미적용 — db push). `00093` = `staff_grant_delete`(미수락 계정 삭제 GRANT, `STAFF-DELETE-01`). `00094` = `staff_activated_at`(⭐ **미수락 판정 자체 표식** — `staff.activated_at` 추가 + 백필. 초대/복구 링크 클릭만으로 채워지는 `last_sign_in_at` 대신 「비밀번호 설정 완료」 시각으로 미수락/수락을 가른다. `STAFF-ACTIVATED-01`·`STAFF-LIST-08`·`STAFF-PEND-01`·`STAFF-DELETE-01` 4곳 통일. ⚠️ 원격 미적용 — db push). `00095` = `delete_patient_chat_thread`(⭐ **챗봇 B3 지난 상담 진짜 삭제 `CHAT-HISTORY-DELETE-01`** — 사용자 결정 2026-09-08 하드삭제. 요구사항 §6.3은 「환자정보·진료기록」 한정이라 상담 대화는 대상 아님. chat_threads 자식 FK가 전부 cascade 없고 support_tickets↔ai_chat_sessions 순환 참조라 단순 delete 불가 → 소유권 검사 후 순환 FK를 null로 끊고 자식→부모 순서로 지우는 SECURITY DEFINER 함수. notification_log·qa_example_bank 등 로그·큐레이션은 링크만 null(보존). service_role EXECUTE. ⚠️ 원격 미적용 — db push). `00097` = `kb_search_keywords`(⭐ **챗봇 RAG 품질 — 검색 전용 키워드** — `kb_documents.search_keywords` 컬럼 추가. `kb_service._reembed`의 임베딩 입력에만 합쳐져(제목+키워드+본문) 환자 음역·별칭('씨티','컴퓨터단층촬영','주차비')이 표준어 문서('CT','주차 요금')를 찾게 한다. 화면·LLM 근거·검색 title엔 노출 안 함. `match_kb_chunks_hybrid` 함수 불변. 2026-09-09 평가 후4: alias-ct-hangul/full·single-building이 recall 0→1.00, 안전 무손. seed_kb_bulk에 7개 문서 UPDATE 동봉. ⚠️ 원격 미적용 — db push + 재임베딩. 꼬리 번호(챗봇 밴드 소진)). `00098` = `chat_messages_route_taken_needs_clarification`(⭐ **챗봇 계기판 — 되묻기 route_taken 구분**, 커밋 ba1a7fb, **타 브랜치**·이미 **remote 적용됨**. 이 브랜치 대장이 이 항목을 몰라 아래 00099 충돌을 냈다 — 브랜치별 대장 분기의 실제 사고). `00099` = `chat_pending_handoff_reason`(⭐ **챗봇 인계 확인 항상 물어보기 `SUPPORT-HANDOFF-CONFIRM-ALL`** — 안전 감시(check_escalation) 인계도 즉시 자동 대신 확인 칩 경유로 바꾸며, 확인 프롬프트 턴과 칩 클릭 턴 사이에 원래 사유를 잇도록 `ai_chat_sessions.pending_handoff_reason` 컬럼 추가(active_flow 00057과 동일 「다음 턴 상태 못박기」 패턴). ⚠️ **처음 00098로 뒀다가 위 ba1a7fb 00098과 충돌 발견 후 00099로 정정**(remote 히스토리 실측 = 00098까지 차 있어 00099가 진짜 빈 번호). ⚠️ 원격 미적용 — db push. 꼬리 번호(챗봇 밴드 소진)). **다음 빈 = `00101`**(`00100`=support_tickets_realtime 사용 / `00096`=chat_messages_realtime 이미 사용 / 00073 schedule 예외 DELETE grant·00074 병합 undo UPDATE grant·00075 전일 미완료 마감 `close_stale_appointment`·00077 환자앱 병원 공개정보 `public_hospital_info`·`00079` 챗봇 Task 19 상담봇 기록 관리자 전수 열람 RLS 사용. 00076은 직원웹 밴드). ⚠️ **A3(의사콘솔)은 무마이그로 끝났다** — `is_urgent_flag`가 `00005`부터 있어 새 칸 불필요(핸드오프의 "A3 urgent칸 마이그" 오판). · `00072` = `search_audit_wide_search`(넓은 검색 감사 `SEARCH-LOG-06`). ⚠️ **A4-a(대기시간 컬럼)도 무마이그** — `appointment_status_history`에 상태 진입 시각이 이미 있어 `get_queue`가 계산만 추가(`QUEUE-ROW-05·06`).

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
| 00052 | `merge_questionnaire_count` | 병합 보존 문진 '건수' 정의자 함수 — 결정#14 유지(내용 아닌 count만), S18 오표시 해소 |

> ℹ️ `00047`(`search_audit_counts`, T25)은 예약만 되어 있고 **파일 미생성**(T25 미구현). 재사용 말 것. ✅ 그 의도(검색 감사 건수 적재)는 **2026-08-29 `SEARCH-LOG-06` 구현이 `00072`로 실제 반영**했다(T25와 무관하게 A4 후속 — `result_count`·`fragment_count` + 넓은 검색 판정).

### 챗봇 `00053`–`00059` (직원웹이 `00052`를 가져간 뒤 확정된 번호 — **이 표가 정본**, 플랜 산문은 +1로 읽는다)
| # | 파일 | 내용 |
|---|---|---|
| 00053 | `chat_core_schema` | 대화 코어 |
| 00054 | `chat_sessions_tickets` | 세션·티켓 |
| 00055 | `anonymous_chat_notifications` | 익명·배칭 |
| 00056 | `chat_sources_retention` | 근거·보존 |
| 00057 | `chat_orchestration_state` | 오케스트state |
| 00058 | `kb_pgvector` | KB pgvector |
| 00059 | `chat_quality` | 품질 |

### 배포 `00060`–`00069`
| # | 파일 | 내용 |
|---|---|---|
| 00060 | `overdue_no_shows` | 자정 부도 배치 (배포 T7B) |

### 직원웹 데모병합 후속 `00070`– (2단계 오버플로 — 챗봇·배포를 안 밀려고 맨 뒤에 신설)
| # | 파일 | 내용 |
|---|---|---|
| 00070 | `system_error_service_outage` | 서비스 전체 장애 배지 칸(A2, `ERRADM-NOTI-02`·결정19) |
| 00071 | `appointment_urgent_flag_attribution` | 응급/주의 표시 「누가·언제」 켰나(A4-b, `QUEUE-URG-06`) — `urgent_flagged_by`·`urgent_flagged_at` |
| 00072 | `search_audit_wide_search` | 넓은 검색 감사(`SEARCH-LOG-06`) — `access_audit_log.result_count·fragment_count` + 설정값 `hospital_settings.wide_search_threshold_count`(기본 20) |
| 00073 | `schedule_exception_delete_grant` | 특정 날짜 변경 되돌리기(`SCHED-EXC-14`) — `doctor_schedule_exceptions`에 빠져 있던 authenticated DELETE grant 추가(00002는 select/insert/update만) |
| 00074 | `patient_merge_undo_update_grant` | 병합 되돌리기(`MHIST-DONE-01`, QA L22) — `patient_merges`에 빠져 있던 authenticated UPDATE grant + `admin_can_undo_patient_merges` RLS 정책(`private.is_admin()`) 추가(00044는 select/insert만). 없어서 라이브 [되돌림 확정]이 500 permission denied였다 |
| 00075 | `close_stale_appointment` | 전일 미완료 「마감 처리」(`TODAY-YDAY-04`, 손검수 2026-08-30) — 상태기계상 도착 뒤엔 취소 길이 없어 지난 날짜에 밀린 도착·진료대기·진료중 예약을 닫지 못하던 막다른 길을 연다. 전이 트리거에 세션 플래그(`app.allow_stale_close`) 우회 + `close_stale_appointment(uuid,text,timestamptz,text)` definer(지난 날짜+진행상태+낙관적잠금 검증 후 진료완료/병원취소로 닫음). **범위 = 전일 미완료 전용**(오늘 큐 정상 전이 불변) |
| 00077 | `public_hospital_info` | 환자앱 병원 공개정보 500 해소(`HSETX-SEC-01`, 환자앱 검수 2026-09-01) — `hospital_settings` SELECT 정책이 staff(`is_active_staff`)만이라 환자/익명은 0행→`get_public_hospital_info` `dict(None)` 500. 공개 2필드(주소·전화)만 반환하는 `public.get_public_hospital_info()` SECURITY DEFINER 함수(anon·authenticated EXECUTE)로 RLS 우회하되 좁은 창구 유지. **예약상세 장소·전화(APPT-INFO-04·05)·홈 병원정보줄(HOME-INFO)·설정 병원안내 3화면 동시 복구.** ⚠️ 파일은 `feat/patient-app` 브랜치에 있음(00076은 직원웹 밴드) |
| 00078 | `chat_ticket_reassign_staff_read` | ⭐ **챗봇 Task 17 오버플로**(티켓 상세 46규칙) — 직원 티켓 상세가 소비하는 두 쓰기 primitive. `reassign_ticket(ticket,to_staff)` definer(assigned_staff_id만 변경·in_progress 유지·`REASSIGN-02`, 활성 직원만·`REASSIGN-05`, 변경 이력은 `support_ticket_assignment_history`) + `staff_mark_ticket_read(ticket,message)` definer(직원 읽음 커서 전진·`UNREAD-02`, `idx_chat_read_states_staff` 부분유니크 upsert·커서 역행 방지). 00054가 남긴 "직원 읽기 커서는 티켓 배정에 달렸으므로 이후 태스크가 추가" 주석 해소. ⚠️ 파일은 `feat/ai-chatbot` 브랜치에 있음. 챗봇 밴드(`00053`–`00059`) 소진 + `00060`–`00069` 배포 밴드라 밴드 안 밀리게 꼬리에 둠 |
| 00079 | `chat_log_admin_read` | ⭐ **챗봇 Task 19 오버플로**(상담봇 기록 `/chatlog` 40규칙) — 관리자 전수 열람 RLS. 기존 `staff_read_*_of_tickets`(00054)는 **티켓 있는 스레드만** 노출하나 상담봇 기록은 AI가 스스로 해결한(티켓 없는) 대화까지 전수 봐야 한다(요구사항 L344·L206·L405). `admin_read_all_threads`·`admin_read_all_messages`(둘 다 이미 RLS on) + `chat_message_sources`에 RLS 신설(00056이 안 켬)·`admin_read_message_sources`·authenticated grant. 모두 `private.is_admin()` — 일반 직원·환자엔 여전히 닫힘. 추가·되돌림 가능·데이터 무변경. ⚠️ 파일은 `feat/ai-chatbot` 브랜치에 있음. 꼬리 번호(챗봇 밴드 소진, 00060–69 배포 밴드) |
| 00083 | `patient_chatbot_booking_source` | ⭐ **챗봇 Task ⑦**(웹 상담봇 예약 실행, 커밋 `a441752`) — 환자 INSERT 정책 `patients_can_create_own_appointments`(00017:84)가 `source='app'`만 with check로 허용해, 환자 RLS 컨텍스트로 도는 `create_booking(source='chatbot')`이 RLS로 막히던 **잠재 버그 정정**(챗봇 예약 경로가 실제로 한 번도 안 통했다 — `PATIENT_SOURCES('app','chatbot')`·card_builder 챗봇 계약과 어긋남). 정책을 `source in ('app','chatbot')`로 넓힘. `staff`는 여전히 환자 경로 거부, `patient_owns` 소유권 검증 그대로, 기존 app 예약 불변(추가 허용만)·되돌림 가능. source enum check(00005:49)는 이미 chatbot 허용. ⚠️ **원격 미적용** — 로컬만 apply, 배포 시 db push. 챗봇 밴드(`00053`–`00059`) 소진 + `00060`–`00069` 배포 밴드라 꼬리 번호 |
| 00084 | `kb_hybrid_search` | ⭐ **챗봇 ⑦ RAG 품질**(2026-09-04) — 순수 벡터 검색이 `text-embedding-3-small`·한국어 짧은 질의에서 관련 문서도 코사인 0.35~0.6대라 "와이파이"처럼 글자는 같은데 뜻이 흐릿한 외래어·고유명사를 놓쳐 인계로 빠지던 문제. `pg_trgm` 확장 + `content` GIN 트라이그램 인덱스 + `match_kb_chunks_hybrid(query_embedding, query_text, match_count)` 신설 — 벡터 top20 ∪ 트라이그램 top20을 RRF(k=60)로 융합. 기존 `match_kb_chunks`(순수 벡터)는 근거 확인용으로 존치. 답변/인계 게이트는 서비스(`rag_service`)가 `max(similarity, keyword_sim)` floor(0.30) + LLM NO_ANSWER 판정으로 결정. 추가·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push + bulk KB(`seed_kb_bulk.sql`) 적재·재임베딩 필요. 꼬리 번호(챗봇 밴드 소진, 00060–69 배포 밴드) |
| 00085 | `unresolved_questions_nullable_ticket` | ⭐ **챗봇 no_answer 칩**(`WEBCHAT-NOANS`, 2026-09-04) — 봇이 못 답하면 자동 인계·자동 티켓을 폐기하고(봇 말풍선 + FAQ 칩 + `[직원에게 연결]` 콜백 칩) 세션을 유지한다. 미해결 로깅은 결정 B(모든 no_answer 기록)라 인계 티켓이 없어도 남겨야 함 → `unresolved_questions.ticket_id`의 NOT NULL을 푼다(nullable). FK(support_tickets)는 그대로 — 인계로 티켓이 생기면 링크, 조용히 포기하면 null. 임베딩이 있어 클러스터링(`UNRES-CLUSTER-01`) 무영향. 추가·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(챗봇 밴드 소진, 00060–69 배포 밴드) |
| 00086 | `chat_messages_route_taken_no_answer` | ⭐ **챗봇 no_answer 칩 보정**(`WEBCHAT-NOANS`, 2026-09-05) — no_answer 경로가 봇 안내 말풍선·칩 카드를 `route_taken='no_answer'`로 저장하는데, `route_taken` CHECK 제약(00057)이 `('emergency','rag','department_guide','agent','handoff')` 다섯 값만 허용해 저장 시 `chat_messages_route_taken_check` 위반으로 500나던 **누락 마이그**. A-①(no_answer 칩)이 코드(safety_watchdog·orchestrator·chat_flow_service)와 00085(unresolved nullable)만 넣고 이 제약 확장을 빠뜨렸다. mock 단위테스트는 DB를 안 타 통과, DB 통합테스트(`test_chat_integration::test_no_answer_...`)만 잡는데 Docker 다운으로 못 돌아 가려졌다(Docker 복구 후 재검증에서 발견). 제약 drop 후 `'no_answer'` 추가해 재생성 — 추가 허용만·기존 값 불변·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(챗봇 밴드 소진, 00060–69 배포 밴드) |
| 00087 | `security_move_questionnaire_authz` | 🔒 **보안 F-02**(문진 이동 IDOR 하강, 2026-09-04) — `move_questionnaire_response`(00020)가 authenticated 전원 grant + SECURITY DEFINER인데 old/new account·for_patient 동일만 검사하고 호출자 소유·lineage 미검사라, 예약 read 권한 있는 접수직원·관리자가 남의 환자 임상문진을 다른 예약(다른 진료과 포함)으로 옮겨 목적지 담당의에게 노출 가능. `create or replace`로 함수 내부에 ①`coalesce(public.patient_owns(old_owner),false)`(비-환자 세션은 NULL 반환→coalesce 필수) ②old/new 진료과 동일(lineage) ③목적지 문진 없음 검증 추가. authenticated EXECUTE는 유지(정상 환자 change_booking이 authenticated 세션서 호출). 검증만 추가·데이터 무변경·되돌림 가능. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(보안 수정) |
| 00088 | `security_marketing_consent_exclusion_status` | 🔒 **보안 F-04**(광고 발송 수신동의, 2026-09-04) — 광고(kind=marketing)를 예약 순간에 `ads_consent=true`만 남기고(resolve_recipients) 발송 시점에도 재확인하는데(dispatch), 예약 후 철회한 건을 「조용히 누락」하지 않고 '제외'로 기록하려 `notification_log.delivery_status` CHECK(00011)에 `'제외'` 추가. '제외'는 배달 '실패'와 구분(실패는 직원 후속 전화 유발, 제외는 정책상 미발송이라 후속 없음). 값 추가만·기존 값/데이터 무변경·되돌림 가능. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(보안 수정) |
| 00089 | `security_revoke_patient_self_insert` | 🔒 **보안 F-05 벡터2**(환자 자가 INSERT RLS 봉인, 2026-09-04) — 00017의 `patients_can_register_self`·`patients_can_insert_family_members`가 authenticated 자가 INSERT를 열어, 환자가 Data API로 patients에 직접 행(동의 0건)을 만들어 활성 환자 권한을 얻을 수 있었다. 클라이언트는 어디도 이 경로를 안 씀(가입=백엔드 POST /patient, 가족추가=add_family_member — 둘 다 service-role) 확인 후 두 정책 제거. 직원 등록 정책(`receptionist_admin_can_insert_patients`)은 유지. 정책 제거만·데이터 무변경·되돌림 가능. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(보안 수정) |
| 00090 | `security_seal_relink_family_rpc` | 🔒 **보안 F-01**(직원 철회 가족접근 복구 봉인 1/2, 2026-09-04) — `relink_family_link_self`(00018)가 patient_owns만 검사하고 링크 재활성 + 감사 트리오(unlinked_at/by/reason) 삭제라, 직원이 철회한 연결을 환자가 되살리고 철회 증적까지 지울 수 있었다(High). 이 RPC는 앱 미사용 → authenticated·public EXECUTE 회수(봉인). 2/2=코드(add_family_member 재활성: 자가해제(트리오 null)만 허용·직원철회(unlinked_by NOT NULL) 거절+"병원 문의" 중립문구·감사 append-only). 권한 회수만·데이터 무변경·되돌림 가능. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(보안 수정) |
| 00092 | `booking_window_weeks_setting` | ⭐ **예약 가능 기간 관리자 창구**(`SCHED-WINDOW-01~05`, 2026-09-05) — `REGENERATION_WEEKS=8`(파이썬 상수)를 `hospital_settings.booking_window_weeks int not null default 8 check(1~26)`로 승격. 상수는 fallback 기본값으로만 남고, 슬롯 생성(`regenerate_slots`)·예약 검증(`appointment_service`)·문자 예약(`message_service`)·대시보드 지평(`dashboard_service`)이 `settings_service.get_booking_window_weeks`로 읽는다. 저장 시 전 의사 슬롯 재생성(`regenerate_all_doctors`) — 늘리면 새 주 빈칸 추가, 줄이면 범위 밖 빈칸 삭제(예약된 자리 유지·`SCHED-SLOT-05`, 막다른 길 방지). 줄이기 전 확인창용 `preview_booking_window`(범위 밖 유지 예약 건수). ⭐ **`grant delete on appointment_slots to authenticated`** 동봉 — RLS `receptionist_admin_can_manage_slots`(ALL)가 이미 허용하나 테이블 GRANT에 DELETE가 빠져 재생성의 빈자리 삭제가 막히던 잠재 버그 정정(환자는 DELETE 정책 없어 여전히 차단). 추가·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호 |
| 00098 | `chat_messages_route_taken_needs_clarification` | 챗봇 계기판 — 되묻기(needs_clarification)를 route_taken으로 구분 저장(커밋 ba1a7fb). ⚠️ **타 브랜치**·이미 **remote 적용됨**. 이 브랜치 대장엔 없어 00099가 처음 00098로 충돌났던 원인(브랜치별 대장 분기) |
| 00099 | `chat_pending_handoff_reason` | ⭐ **챗봇 인계 확인 항상 물어보기**(`SUPPORT-HANDOFF-CONFIRM-ALL`·`WEBCHAT-HANDOFF-CONFIRM-01~02`, 2026-09-09) — 사용자 요청 "가끔 바로 연결해버린다 → 항상 물어보게". ⚠️ **처음 00098로 뒀다가 위 ba1a7fb와 충돌 발견 후 00099로 정정**(remote 실측). 안전 감시(check_escalation — 의료판단·불일치·불만·반복·도움안됨)가 사유를 잡으면 즉시 자동 인계 대신 확인 프롬프트(`직원에게 연결하기` 칩)를 낸다(응급만 예외). 확인 프롬프트 턴과 칩 클릭 턴이 별개 요청이라 원래 사유를 세션에 잇도록 `ai_chat_sessions.pending_handoff_reason text` 컬럼 추가(CHECK=6사유+staff_request). 칩 클릭 때 이 값으로 티켓 사유 복원 → 관리자 '직원 연결 현황' 통계 구분(요구사항 L67). active_flow(00057)와 동일 「다음 턴 상태 못박기」 패턴·값 바뀔 때만 UPDATE. 요구사항 시나리오 7 "직원 연결 **안내**"에 더 충실. 추가·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(챗봇 밴드 소진) |
| 00100 | `support_tickets_realtime` | ⭐ **직원웹 상담 실도달 버그 수정**(실시간 트랙 세션4, 2026-09-10) — 직원웹이 `support_tickets`를 postgres_changes로 구독하는데(문의함 목록 `useTicketsRealtime`·상세 `useTicketDetailRealtime.ts:25` = event '*'), 이 테이블이 `supabase_realtime` publication에 **한 번도 등록된 적 없어**(00039=예약3종·00096=chat_messages만) 초기 스냅샷 뒤 새 문의(INSERT)·담당/상태 변경(UPDATE)이 영영 미도달 → 새로고침해야 보이던 것(`00096` chat_messages와 완전히 같은 구멍). `alter publication supabase_realtime add table support_tickets`(멱등 가드). replica_identity default(PK)로 충분(콜백은 재조회 신호뿐, old값 미사용). broadcast presence(환자 입력중/보는중)는 별개·무관. 추가·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push. |
| 00095 | `delete_patient_chat_thread` | ⭐ **챗봇 B3 지난 상담 진짜 삭제**(`CHAT-HISTORY-DELETE-01`, 2026-09-08) — 사용자 결정: 지난 상담 스와이프 삭제를 하드삭제로(확인창 필수·되돌릴 수 없음). 요구사항 §6.3은 「환자정보·진료기록」의 하드삭제만 막고 상담봇 대화는 대상 아님(원문 확인). chat_threads의 자식 FK(chat_messages·chat_read_states·ai_chat_sessions·support_tickets·chat_notification_batches·chat_message_sources·answer_feedback·chat_quality_reviews·support_ticket_assignment_history·unresolved_questions)가 **전부 ON DELETE 규칙 없음(NO ACTION)** + support_tickets↔ai_chat_sessions **순환 참조**라 단순 delete가 FK 위반. → `delete_patient_chat_thread(thread_id, patient_id)` SECURITY DEFINER: 소유권 재검사(없거나 남의 방이면 42501) 후 ①notification_log·qa_example_bank는 링크만 null(로그·큐레이션 보존) ②자식→부모 순서 삭제 ③순환 FK를 null로 끊고 티켓→세션→상담방 삭제. service_role EXECUTE(백엔드 `patient_ai_session.delete_thread`가 서비스 풀로 호출, 라우트 `DELETE /chat/threads/{id}`는 404로 열거 방지). 로컬 트랜잭션 검증(티켓 있는 방 전부 0·남의 방 거부). 추가·되돌림 가능(함수만)·데이터는 호출 시 삭제. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(챗봇 밴드 소진) |
| 00094 | `staff_activated_at` | ⭐ **미수락 판정 자체 표식**(`STAFF-ACTIVATED-01`, 2026-09-07) — 초대만 받고 아직 비밀번호를 안 만든 직원이 배포 실사용에서 「수락됨」으로 오분류돼 `[비밀번호 재설정]·[중지]`가 뜨고 `STAFF-LIST-08` 딱지·`STAFF-PEND-01` 깃발이 사라졌다. 원인=미수락 판정 4곳(`STAFF-LIST-08`·`STAFF-PEND-01`·`STAFF-DELETE-01` + 프론트 버튼)이 auth `last_sign_in_at`을 공유했는데, 초대/복구 링크는 **클릭만으로** 매직링크 세션을 만들며 이 값을 채운다. → `staff.activated_at timestamptz null` 추가 + `auth.users.last_sign_in_at`으로 일회성 백필(기존 로그인 이력 있으면 수락으로 간주). 채우는 지점=`POST /me/activate`(비번 설정 성공 직후·자기 행만·멱등). 이후 4곳이 이 칸으로 통일돼 링크 클릭으로는 안 켜진다. 추가·되돌림 가능·데이터 무손실. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호 |
| 00093 | `staff_grant_delete` | ⭐ **미수락 계정 삭제 GRANT**(`STAFF-DELETE-01`, 2026-09-07) — 잘못 초대한 미수락 직원 삭제(`delete_staff`)가 "permission denied for table staff"로 막히던 것. RLS `admin_can_manage_staff`(ALL, `private.is_admin()`)는 이미 DELETE를 관리자로 제한하나 테이블 GRANT에 DELETE가 빠져 있었다(`00092`가 appointment_slots에서 고친 것과 같은 GRANT/RLS 이중 계층 함정). `grant delete on public.staff to authenticated` — 행 제한은 RLS가 그대로 강제(관리자만·환자/일반직원은 DELETE 정책 없어 차단). 추가·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호 |
| 00091 | `stats_audit_payload` | ⭐ **챗봇 B / 통계 드릴다운·CSV 감사**(`STAT-AUDIT-02`·`ALOG-LIST-13`·`BOTSTAT-DASH-15`, 2026-09-05) — 결정 #22: 통계 상세 열기·CSV 내보내기는 「실행자·시각·지표·기간·대상 건수·CSV 행 수·억제 여부」만 남긴다. 00034가 `patient_id` nullable + `stats_drilldown`/`stats_export` 종류를 열었으나 지표·기간·건수·억제를 담을 칸이 없어 `audit_service.log_stats_*`가 그 값을 버리던 것(BLOCKED)을 해소. `access_audit_log`에 `stats_metric`·`stats_period_from`·`stats_period_to`·`stats_target_count`·`stats_csv_rows`·`stats_suppressed` 6칸 추가. ⛔ 환자명·전화·생년월일·검색어(원문)는 절대 담지 않음(MASK-SRV-01). 배선: `admin_chat` 드릴다운 2엔드포인트(`/stats/ranking/{cluster_id}`·`/stats/{metric}/detail`)+export 1엔드포인트, 읽기 `audit_query_service` DTO 노출. 추가·되돌림 가능·데이터 무변경. ⚠️ **원격 미적용** — 배포 시 db push. 꼬리 번호(챗봇 밴드 소진) |

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
