# SPECINDEX — 직원 웹 (staff-web 스펙·플랜 재작성 입력)

> 통합 2026-08-15. 이 색인은 `docs/superpowers/specs/2026-07-27-staff-web-design.md` / `docs/superpowers/plans/2026-07-27-staff-web.md` 재작성의 **단일 입력**이다.
> 두 부분으로 구성한다. **Part A = 기존 직원웹 화면**(queue·today·calendar·schedule·settings·shell), **Part B = 신규 15화면 + 상담봇 운영 접점**(환자상세·checkin·의사콘솔·관리자 페이지).
> ⚠️ Part B의 「7. 상담봇 직원·관리자 통합 범위」는 상담봇 영역과 겹친다 — **상세 정본은 `SPECINDEX-ai-chatbot.md` Part B**이며, 여기서는 직원 웹 접점만 참고한다.
> 공용 `00010_` 마이그레이션 계약은 각 기능 옆에 표기돼 있다(migration 단계에서 `grep 00010`으로 모은다).

## 목차
- **Part A — 기존 직원웹 화면**: 1 기능 갭 · 2 구조 결정 · 3 화면 설계(셸/today/queue/calendar/schedule/settings) · 4 체크박스·후반결정 미반영 · 5 폐기·대체 · 6 링크·재작성 순서
- **Part B — 신규 15화면 + 상담봇 운영 접점**: 0 통합 정본 요약 · 범위·경계 · 1 기능 갭 · 2 구조 결정 · 3 화면 설계(33건 target) · 4 미체크 항목 · 5 폐기 · 6 링크·재작성 순서 · 7 상담봇 통합 범위(→`SPECINDEX-ai-chatbot.md` 참조) · 8 통합 미결·차단 ledger · 9 전수 재대조 결과

---

# Part A — 기존 직원웹 화면

# 직원웹 기존 화면 결정 색인

> 보완 검토 기준: 2026-08-14 현재 원문 줄번호. 이 색인은 구현 완료 보고서가 아니라, 스펙·플랜 재작성 입력과 미반영 결정 추적표다.
>
> 경로 축약: `screen-behaviors.md` = `docs/design/screen-behaviors.md`, `staff-web-design.md` = `docs/superpowers/specs/2026-07-27-staff-web-design.md`, `plans/staff-web.md` = `docs/superpowers/plans/2026-07-27-staff-web.md`.
>
> 대상: `/queue`, `/today`, `/calendar`, `/admin/schedule`, `/admin/settings`, 직원웹 셸·내비게이션
>
> 목적: 기존 직원웹 스펙과 플랜을 재작성할 때 필요한 기능 갭, 확정 결정, 화면 규칙, 폐기 사항을 한 곳에서 역추적하기 위한 색인이다. 아래의 모든 원문 인용은 실제 파일의 현재 줄 번호를 기준으로 적었다.
>
> 담당 범위 밖 항목은 `코N`으로 표시했다. 해당 항목은 이 영역에서 요구되는 연동 계약만 기록하고, 구현 책임은 가져오지 않는다.

## 1. 기능 갭

기능 갭 번호는 결정 로그의 기존 갭 번호를 유지한다. “미반영”은 현재 원본 스펙·플랜에 결정이 완전히 반영되지 않았다는 뜻이며, 실제 코드의 구현 여부를 뜻하지 않는다.

| 갭 | 요약 | 원문 현황 | 필요한 조치 | 스펙·플랜 영향 |
|---|---|---|---|---|
| #1 | 예약 확정 후 직원 알림의 발생·표시 계약이 미정임 | 직원 확정 후 환자 통지 호출 조건이 별도 규칙으로 정리되지 않음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3218-3222`) | 직원 알림의 발생 조건을 먼저 고정하고, 화면의 읽음 상태·실패 표시는 추가 staff 계약으로 확정하여 `/today`·배지와 연결 | `staff-web-design.md:29-37`; `plans/staff-web.md:1810-1957`에 상태·API·알림을 추가 |
| #6 | 상담 지원 요청의 타입과 예약 연결이 필요함 | `support_requested_at`, `request_type`, `support_tickets.appointment_id` 결정이 후반에 추가됨 (`HANDOFF.md:112-117`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3214`) | `claim_ticket`가 ticket 처리 상태를 원자적으로 잠그는 계약화. 직원 오늘 화면에서 해당 예약으로 양방향 이동 | `/today` 행·배지와 ticket inbox의 연동을 `plans/staff-web.md:1810-1957`에 추가. ticket inbox 본체는 `코5` |
| #21 | 예상 대기시간을 직원 화면에서도 소비해야 함 | 고객 요구에는 대기 안내가 있으나 직원 화면의 표시·변경 계약이 분리되어 있지 않음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3332-3335`) | 서버 계산값·기준시각의 표시를 우선 확정하고, 직원이 값을 수정하는지와 환자 노출 권한은 별도 결정 | `docs/superpowers/specs/2026-07-27-staff-web-design.md:29-37,52-59`; `docs/superpowers/plans/2026-07-27-staff-web.md:1810-1957,1963-2631`; 환자 노출은 `코1` |
| #28/#29 | no-show 처리와 당일 이력 표시가 없음 | no-show 상태·오늘 화면 이력 규칙이 뒤늦게 추가됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3391-3402`) | queue/today의 상태 전이, 되돌리기, audit 이벤트를 추가 | `staff-web-design.md:29-37,52-59`; `plans/staff-web.md:1810-1957,1963-2631` |
| #31 | 직원 업무 목록의 CSV 내보내기 범위가 확정되지 않음 | queue/search/영향 예약 내보내기가 갭으로 남음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3410-3413`) | export 컬럼, 마스킹, 권한, 감사 로그, 대용량 처리 계약을 공통화 | 영향을 받는 현행 플랜: `plans/staff-web.md:3248-3711`; 환자 검색 본체는 `코3` |
| #32 | 병원 설정 화면이 기존 직원웹 플랜에 없음 | 설정 항목과 권한이 갭으로 확인됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3415-3427`) | `/admin/settings`를 정식 route·API·저장 UX로 추가. 예약·대기·SMS·병원 정보·메시지 설정을 분리 | 현행 route에는 없음 (`staff-web-design.md:22-27`). `plans/staff-web.md:25-134`를 설정 task로 확장 |
| #33 | 운영시간의 단일 소스와 예외/휴무 저장 모델이 불일치 | 운영시간을 schedule로 이동하고 기존 예외 모델을 폐기하는 최종 결정이 있음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3419,3741-3746,5084`) | 주간 schedule + 휴무/폐쇄일을 단일 계산기에 연결하고 settings에 중복 편집을 두지 않음 | `staff-web-design.md:87-91`; `plans/staff-web.md:6179-7122`와 `7127-7623`을 재작성 |
| #35 | 전화번호 원문 공개가 오늘/대기열에서 누락됨 | 직원의 원문 공개와 공개 감사가 별도 갭임 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3440-3444`) | 역할별 reveal, 확인/취소, 감사 이벤트, 목록 복귀 시 마스킹 복원을 규칙화 | `screen-behaviors.md:124-145`; queue 규칙 `screen-behaviors.md:666-868`; today 규칙 `screen-behaviors.md:493-625` |
| #36/#82 | 되돌리기(undo)의 범위·잠금·감사 로그가 불명확함 | undo가 여러 운영 변경으로 확장됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3446`, `3836-3844`) | 대상 상태, 제한 시간, 동시성 충돌, 재시도/감사 이벤트를 공통 mutation 계약으로 정의 | 공통 규칙 `screen-behaviors.md:241-282`; queue/today/calendar/schedule mutation 플랜에 반영 |
| #37 | 자정 경계에서 `/today`가 당일 업무를 잃을 수 있음 | 영업일·자정 미완료 건의 처리 규칙이 미정 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3452-3463`) | 서버 기준일, timezone, 미완료 전일 건의 분리·보존·배지를 결정 | `staff-web-design.md:29-37`; `plans/staff-web.md:1810-1957,3716-4727` |
| #45/#84/#85 | 예약 마감, 과거 슬롯, 실제 진료 시각의 기준이 분리되지 않음 | booking deadline·과거 방문·actual time/range가 각각 갭으로 남음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3891-3895`, `3807-3824`) | 예약 가능 여부, 표시용 시간, 실제 시작/종료를 다른 필드와 상태로 정의 | calendar 규칙 `screen-behaviors.md:868-1130`; schedule `:1130-1300`; queue `:666-868` |
| #69 | 만료된 pending 예약의 직원 처리 경로가 불명확함 | `예약신청` 상태로 시각이 지난 예약이 기존 late/no-show 규칙에서 빠짐 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4024-4029`) | `/today`의 미확정 경과 예약 행·배지·조치 및 audit을 정의. queue 처리는 별도 규칙으로 확장하지 않음 | `docs/superpowers/specs/2026-07-27-staff-web-design.md:29-37,52-59`; `docs/superpowers/plans/2026-07-27-staff-web.md:1810-1957` |
| #72/#98/#103/#107 | 병원 설정의 실제 항목, 저장 미리보기, 운영시간 위치가 서로 어긋남 | `/admin/settings`의 6개 설정값과 5개 왼쪽 메뉴 그룹, schedule 단일 소스가 결정됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3726-3732`, `3699-3704`; `screen-behaviors.md:1312`) | settings route와 저장 API를 신설하고 schedule의 미리보기 count/time을 재사용 | settings 규칙 `screen-behaviors.md:1302-1416`; 기존 플랜 `plans/staff-web.md:25-134` |
| #99 | 최초 상담/예약 통지 메시지와 발송 시점이 빠짐 | first notify 메시지가 별도 갭으로 남음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3721-3724`) | 메시지 template와 날짜/시각 token을 확정하고, kind·channel·scheduled_at은 #109 발송 계약과 연결 | `screen-behaviors.md:1361-1402,317-399`; settings·send task 신설 |
| #100/#109 | 발송 API의 free text, kind, channel, scheduled send와 dead token이 불완전함 | #109의 `notify_patient` 계약과 #100의 dead-token 후속 조치가 후반에 추가됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3499-3502,3687-3697`; `HANDOFF.md:243-249`) | #100은 **죽은 토큰 삭제 후 그 자리에서 SMS 재발송**을 명시하고, #109는 문구·kind·channel·scheduled_at을 **발송 기록/시도 계약으로 재작성** | `docs/design/screen-behaviors.md:317-491`; `docs/superpowers/plans/2026-07-27-staff-web.md:25-134`와 공통 API 플랜에 추가 |
| #101 | SMS 외 채널과 “모든 모드” 전송이 명확하지 않음 | 모든 전송 모드를 지원하는 화면 결정은 완료되었고, 서버가 실제 설정을 읽는 작업이 남음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3661-3674`; `HANDOFF.md:240-248`) | 채널 enum, 수신자별 결과, 채널별 권한·실패 UI와 설정 조회를 플랜에 명시 | `docs/design/screen-behaviors.md:317-491`; 현재 staff spec/plan에는 API·구현 task가 부족함 |
| #112 | “먼저 안내 보내기” 진입점이 없었음 | `/messages`·발송 패널 화면은 정본/목업에 반영되어 해소되었고, route·API·권한의 플랜 반영이 남음 (`HANDOFF.md:240-248`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3517-3524`) | `/messages` route, today affected row의 진입, role check, 발송 결과·실패 복귀를 staff 플랜에 추가 | `docs/design/screen-behaviors.md:317-491`; 기존 플랜 대상은 `docs/superpowers/plans/2026-07-27-staff-web.md:25-134` |
| #110/#111/#115/#117 | 발송·전화 공개·설정 변경의 감사와 발신자/수신자 수가 누락됨 | audit, sender/recipient count, send list 기록이 별도 갭임 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3505-3514,3582-3595,3615-3625`) | send/reveal/settings mutation별 actor, count, channel, result, audit 필요 여부를 각각 계약화 | `screen-behaviors.md:399-491,1302-1416`; send history/settings 플랜 추가 |
| #118 | 예약 발송 목록과 취소/재실행 상태가 없음 | scheduled send table이 갭으로 명시됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3597-3601`) | 예약 시각·대상·상태·취소·재시도·실제 발송 결과를 목록화 | settings/send spec 및 플랜에 별도 task 추가 |
| #119/#120/#121/#122 | 발송 결과, 실제 channel, retry lock, provider callback이 없음 | 결과 컬럼·실제 channel·재시도 기록·Twilio callback이 각각 미반영 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3540-3566`) | provider/outbox lifecycle(`queued/scheduled`)과 직원 표시 상태(`발송 중/도달/실패/재시도 중`)를 분리하고 provider event id를 저장. dead number/token은 별도 표시 계약으로 둠 | `screen-behaviors.md:399-491`; send history/발송 기록 API를 신설 |
| #125/#126 | SMS 설정 표와 템플릿 설정 표가 실제 데이터 모델과 맞지 않음 | 설정 표 누락과 SMS column lock이 갭으로 확인됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3525-3538`; `screen-behaviors.md:1395-1402`) | 채널별 enabled/default/template/variable/preview를 별도 행으로 모델링. SMS 열만 잠그고 행 전체를 잠그지 않음 | `screen-behaviors.md:1361-1416`; `plans/staff-web.md:25-134` |
| #83 | 의사별 달력 색상 palette/index가 없음 | doctor palette와 calendar 표시 규칙이 추가됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3824-3834`) | **재작성 시** 색상 index의 안정성, 변경 시 기존 기록 보존, contrast를 정의 | calendar 규칙 `screen-behaviors.md:977-1038`; calendar task `plans/staff-web.md:4736-5112` |
| #86/#87 | walk-in의 초기 상태와 다음 가능 시간이 없음 | 과거 방문 상태·next available time이 갭임 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3794-3805`) | walk-in 생성 시 server time/status를 기록하고 의사별 다음 슬롯 계산을 제공 | queue 규칙 `screen-behaviors.md:753-803`; `plans/staff-web.md:1963-2631` |
| #88/#89/#90/#91 | schedule 변경 후 영향 예약 처리의 화면 경로가 틀림 | 휴일 경로·관리자 checkbox·zero count popup·환자 표시가 각각 정리됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3650-3658,3774-3792`) | 영향 계산은 schedule 저장 완료 후 실행. 0건이면 popup 없음. 직원 today에서 선택·처리하고, 관리자는 count/time만 봄. 환자 표시 본체는 `코1` | `screen-behaviors.md:1420-1467`; schedule 플랜 `plans/staff-web.md:3248-3388,6179-7122` |
| #92/#93/#94/#95/#96/#97 | schedule CRUD가 부서·일괄 저장·휴무·즉시 통지까지 충분히 모델링하지 않음 | 부서 API, batch rules, **미결인 lunch 예외**, atomic 7-day save, closures, 즉시 통지 제거가 후반에 정리됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3734-3772`) | 부서×의사×요일 상태, 7일 원자 저장, closure 테이블, 영향 계산을 분리. #94 lunch exception은 고객 확인 전까지 확정하지 않음. schedule 저장이 환자에게 즉시 통지하지 않음 | `screen-behaviors.md:1130-1300,1420-1467`; old implementation `plans/staff-web.md:6179-7122` 전면 재작성 |
| #105/#106 | schedule UI의 탭·의사×요일 상태·전체 선택이 기존 플랜에 부족함 | schedule UI 누락이 명시됨 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3706-3719`) | **`전체 현황/진료과 관리/의사별 스케줄/특정 날짜 변경` 왼쪽 세로줄**, 부서/의사 필터, 요일별 enabled/start/end, batch save를 명시 | `staff-web-design.md:87-91`; `plans/staff-web.md:7127-7623`; rules `screen-behaviors.md:1130-1300` |
| #114 | 역할별 settings/send 권한 범위가 불명확함 | 역할 포함 여부가 갭으로 남음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3627-3633`) | receptionist/doctor/admin별 조회·수정·발송·reveal 권한표를 확정 | 공통 role 규칙 `screen-behaviors.md:104-121`; settings/send route에 적용 |
| D2 | ticket inbox의 동일 timestamp 정렬 tie-breaker가 후반에 확정됨 | `created_at ASC` 다음 `id ASC`가 필요함 (`HANDOFF.md:112-117`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5039,5056-5058`) | ticket inbox 목록과 그 목록을 소비하는 badge query에만 동일 정렬을 사용. `claim_ticket`·`/queue` 순번은 별도 계약 | ticket inbox 본체는 `코5`; 직원 shell의 badge/link만 반영 |
| D4 | `/today`에 지원 요청 행을 추가하고 **별도 취소·변경 수치 카드**를 제거함 | support request rows, appointment link, 양방향 이동이 후반 결정임 (`HANDOFF.md:112-117`; `screen-behaviors.md:5421-5433`) | summary의 hardcoded `pending_inquiries_count:0`를 실제 query로 교체하고, 취소·변경 상담을 `확인 필요한 예약` 환자별 행에 통합 | `plans/staff-web.md:1810-1957,3716-4727`; 일반 ticket inbox 본체는 `코5` |

### 갭을 해소한 것으로 취급할 항목

다음 항목은 별도 재결정 대상이 아니라, 원본 플랜을 최신 결정에 맞게 고치는 작업 대상이다.

- #102의 “전송 방식이 SMS만” 문제는 모든 channel을 허용하는 결정으로 해소되었지만, API·화면 반영은 필요하다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3661-3674`).
- schedule의 “관리자 checkbox가 곧 예약 취소” 흐름은 폐기되었다. 영향 예약의 선택·처리는 직원 `/today` 흐름으로 이동한다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3774-3782`; `screen-behaviors.md:1459-1465`).
- schedule 저장 직후 환자에게 자동 통지하는 흐름은 폐기되었다. 저장은 계산·영향 건 생성까지이며, 통지는 별도 직원 action이다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3734-3739`).

## 2. 구조 결정

### DB·API·상태 전이

| 영역 | 결정·내용 | 선정 사유 | 영향 범위 | 우선순위 | 근거 | 재작성 시 고정할 계약 |
|---|---|---|---|---|---|---|
| 오늘/지원 요청 | 예약에 `support_requested_at`, `request_type`, ticket에 `appointment_id`를 둔다 | 취소·변경 상담을 별도 수치 카드가 아니라 예약별 행과 ticket의 같은 업무 단위로 다뤄야 함 | `/today`, calendar panel, ticket inbox 연동 | HIGH | `HANDOFF.md:112-117`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5041-5067` | today query는 예약·지원 요청을 함께 반환하고, row에서 ticket/appointment로 양방향 이동 |
| ticket 목록 | `created_at ASC`, tie 시 `id ASC` | 오래된 문의가 새 문의에 밀리지 않고 페이지 경계도 결정적이어야 함 | ticket inbox 목록·그 목록을 소비하는 badge query (`코5`) | HIGH | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5039,5056-5058` | pagination cursor도 동일 정렬을 사용. claim 경쟁은 D3/4 원자 배정 계약으로 분리 |
| schedule 계산 | 주간 규칙과 closure/exception을 서버의 단일 계산기가 합성한다 | schedule과 settings가 서로 다른 운영시간 원본을 가지면 슬롯·영향 예약이 어긋남 | schedule, calendar, today, 예약 슬롯 | HIGH | `docs/design/screen-behaviors.md:1130-1300`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4950-4983` | 계산 결과와 저장 완료를 분리. 계산은 preview/affected list, 완료는 version·timestamp·처리 상태를 가진다 |
| schedule 저장 | 7일 변경은 원자적으로 저장한다 | 요일 일부만 저장되면 예약 가능 시간과 영향 계산이 중간 상태가 됨 | schedule CRUD·migration·slot regeneration | HIGH | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3748-3753` | 부분 저장을 허용하지 않고 충돌 시 version mismatch로 재조회 |
| 영향 예약 | schedule 변경 후 affected appointments를 계산하고, 0건이면 popup을 열지 않는다 | 계산과 직원 처리의 책임을 분리하면서도 놓친 환자를 만들지 않기 위함 | schedule preview, `/today` affected rows | HIGH | `docs/design/screen-behaviors.md:1420-1467` | 관리자는 count/time만 확인. 예약 선택·처리는 직원 `/today`에서 수행 |
| 영향 처리 | 처리 완료는 별도 상태 전이이며 예약을 자동 취소하지 않는다 | “영향 있음”과 “직원이 처리함”을 한 boolean으로 합치면 재변경·그대로 두기를 구분할 수 없음 | today mutation, audit, realtime | HIGH | `docs/design/screen-behaviors.md:1436-1465`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4952-4959` | `needs_rescheduling`를 단순 문제 flag로 사용하지 말고 계산 version과 `processed` actor/time을 저장 |
| 통지 | schedule 변경 저장 자체는 환자 통지를 발생시키지 않는다 | 아직 직원이 옮김·취소·그대로 두기를 결정하지 않았기 때문 | schedule save, `/today`, outbox | HIGH | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3734-3739`; `docs/design/screen-behaviors.md:1459-1465` | 직원이 affected row를 선택해 send/outbox를 생성할 때만 통지. 예약 원본 id를 보존 |
| 발송 기록/시도 | 발송 요청은 kind/channel/free text/scheduled_at와 시도별 결과를 저장한다 | notify 정책·채널·예약 발송·실제 결과를 단일 함수의 암묵적 분기에 두면 감사와 재시도가 깨짐 | settings, `/messages`, today 안내, provider callback | HIGH | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3499-3502,3540-3566,3597-3601` | provider/outbox lifecycle(`queued/scheduled`)과 직원 표시 상태(`발송 중/도달/실패/재시도 중`)를 분리하고 provider event id·sender/recipient count를 기록 |
| retry | 실패 발송은 원본 결과를 덮어쓰지 않고 새 시도 레코드를 만든다 | 실패 원인을 보존해야 재시도·감사·dead token 처리가 분리됨 | send history, outbox, provider callback | HIGH | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3540-3545` | 원본 row lock, retry actor/time, provider callback을 별도 기록 |
| 설정 | 6개 설정값을 `/admin/settings`의 5개 왼쪽 메뉴 그룹에 둔다 | 설정 화면이 없으면 운영시간·문자 정책·메시지 template를 실행할 곳이 없음 | `/admin/settings`, role permission, audit | HIGH | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3726-3732`; `docs/design/screen-behaviors.md:1302-1416` | 운영시간/휴무는 schedule의 단일 소스. settings는 중복 시간표를 저장하지 않음 |
| 운영시간 | 주간 시간, 부서별 시간, closure/exception을 구분한다 | 운영시간을 schedule과 별도 예외표에 중복 저장하지 않기 위함 | schedule, calendar, booking deadline, chatbot read-only consumer (`코4`) | HIGH | `docs/design/screen-behaviors.md:1130-1300`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3419,3741-3746,5084` | 기존 `HOURS-EXC`/`hospital_hour_exceptions` 단일소스 의존은 폐기하고 schedule 계산기를 사용 |
| 지원 요청 상태 | `claim_ticket`는 원자적 자동 배정과 처리 중 잠금을 제공한다 | 두 직원이 `/today`·문의함·calendar에서 같은 ticket을 동시에 열 수 있기 때문 | today row, calendar panel, ticket inbox (`코5`) | HIGH | `HANDOFF.md:112-117`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5040-5045,5051-5054` | `pending→in_progress` 승패와 담당자를 반환하고, 경쟁 패자는 목록 유지·충돌 안내를 본다 |
| undo | 운영 mutation별로 제한 시간·동시성·audit·가역성을 구분한다 | 잘못 누른 처리를 복구하되 이미 환자에게 전달된 결과나 진료를 무조건 되살리면 안 됨 | today, queue, calendar, schedule, audit | HIGH | `docs/design/screen-behaviors.md:241-282`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3836-3844` | mutation별로 undo 가능/불가, 새 이벤트인지 원본 역전인지, retry/audit을 명시 |
| 역할 | admin/receptionist/doctor가 보는 route와 수정 권한이 다르다 | UI에서 숨기는 것만으로는 직접 URL/API 접근을 막을 수 없음 | shell/nav, all staff APIs, reveal/send/settings | HIGH | `docs/design/screen-behaviors.md:104-121` | API도 UI 숨김에 의존하지 않고 서버에서 권한 검사 |
| 세션 | 직원 로그인/로그아웃과 세션 만료가 셸 규칙에 포함된다 | 공용 접수 PC와 세션 만료에서 환자 정보가 남지 않아야 함 | shell, auth middleware, access audit | HIGH | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3869-3874`; `docs/고객요구사항.txt:71-82`; `screen-behaviors.md:625-665` | 세션 만료·재인증·logout audit의 정확한 timeout/기록 필드는 shell contract에서 정의 |

## 3. 화면 설계 결정

### 셸·내비게이션

현재 권위 있는 셸 규칙은 `screen-behaviors.md`의 최신 규칙이다. 과거 결정 로그의 3그룹 설명은 MR2-07에서 갱신되었다.

| 화면/영역 | 확정 규칙 | 근거 |
|---|---|---|
| 전체 셸 | 의사 진료화면은 단독 항목. 그 외는 `업무`, `기록`, `설정`, `상담봇` 4그룹으로 구성 | `screen-behaviors.md:77-103`; 최신 role 규칙 `:104-121` |
| receptionist | 업무 그룹에서 today/queue/check-in/calendar/patient search/ticket inbox/all chat history/messages를 접근 | `screen-behaviors.md:83-86`; 고객 요구 `docs/고객요구사항.txt:71-82` |
| doctor | 진료 화면·환자 검색 2개만 접근하고 today/queue/messages는 노출하지 않음 | `screen-behaviors.md:83-86` |
| admin | doctor console을 제외한 4개 그룹을 접근 | `screen-behaviors.md:83-86` |
| 실시간 배지 | 헤더·내비게이션 배지는 서버 상태를 반영하고 연결 복구·재조회로 정합성을 회복해야 함 | `screen-behaviors.md:89-100`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:1692-1700` |
| 개인정보 | 목록은 전화번호·생년월일을 마스킹하고, reveal은 역할·확인·감사 규칙을 거침 | `screen-behaviors.md:124-145` |
| 로그인/보안 | 역할별 진입, 세션 종료, 접근 기록을 셸에 포함 | `docs/고객요구사항.txt:71-82`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3869-3874` |

### 담당 규칙 ID 색인

아래 묶음은 “해당 화면이 있다”는 수준이 아니라, 재작성할 스펙·플랜에서 각 규칙 ID를 acceptance criteria로 옮겨야 하는 범위다.

| 화면/기능 | 규칙 ID 묶음 | 핵심 선택 | 연관 갭·결정 | 근거 |
|---|---|---|---|---|
| 셸·내비 | `SHELL-NAV-01`, `SHELL-NAV-02`, `SHELL-NAV-03`, `SHELL-NAV-04`, `SHELL-NAV-05`, `SHELL-NAV-06`, `SHELL-LIVE-01~04`, `SHELL-HDR-*`, `SHELL-ACT-*`, `SHELL-URL-01`, `NAV-SHELL-01~12`, `ROLE-*`, `MASK-*`, `PANEL-*` | 역할별 기본 화면·4그룹 sidebar·실시간 배지·세션·권한·개인정보·공통 action | D7, #35, #79, #114 | `docs/design/screen-behaviors.md:77-145,633-662`; `HANDOFF.md:127-129` |
| `/today` 기본 | `TODAY-LAY-*`, `TODAY-CARD-*`, `TODAY-ROW-*`, `TODAY-SUM-*`, `TODAY-DOC-*`, `TODAY-BTN-*`, `TODAY-YDAY-*`, `TODAY-EMPTY-*`, `TODAY-LIVE-*`, `TODAY-RACE-*`, `TODAY-ORDER-*`, `TODAY-DATE-01`, `DOCTOR-START-*` | 환자별 문제 행을 숫자 카드보다 먼저 표시하고, 실시간 경쟁·자정 경계·행 action을 처리 | #1, #21, #28/#29, #37 | `docs/design/screen-behaviors.md:493-625` |
| `/today` 일정 변경·지원 | `TODAY-RESCHED-04~22`, `TODAY-RESCHED-23`, `TODAY-RESCHED-24`, `TODAY-RESCHED-25`, `TODAY-RESCHED-26`, `TODAY-RESCHED-27`, `TODAY-RESCHED-28`, `SUPPORT-TODAY-CANCEL-01`, `NAV-STFSUP-08`, `NAV-STFSUP-14` | 일정변경 영향과 취소/변경 상담을 같은 환자별 행으로 합치고, 상담 종료 전에는 행을 없애지 않음 | D4, #6, #88~#91, #99~#103 | `docs/design/screen-behaviors.md:517-544,5421-5433,5484-5497`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5041-5067` |
| `/queue` | `QUEUE-TAB-*`, `QUEUE-ROW-*`, `QUEUE-ORDER-*`, `QUEUE-URG-*`, `QUEUE-BTN-*`, `QUEUE-WALK-*`, `QUEUE-SAME-*`, `QUEUE-FILT-*`, `QUEUE-EMPTY-*`, `QUEUE-LIVE-*`, `NAV-QUEUE-*` | 7탭·환자 대기 순번·사유가 있는 DnD·walk-in·경쟁 시 늦은 직원 행 유지 | D3, #35/#36/#69/#86/#87; ticket D2는 `코5` | `docs/design/screen-behaviors.md:666-868`; ticket claim 본체는 `코5` |
| `/calendar` | `CAL-*`, `CAL-VIEW-*`, `CAL-DOC-*`, `CAL-SLOT-*`, `CAL-WEEK-*`, `CAL-DAY-*`, `CAL-TIME-*`, `CAL-COLOR-*`, `CAL-ZOOM-*`, `CAL-GAP-*`, `CAL-PAST-*`, `CAL-RACE-*`, `CAL-LIVE-*`, `CAL-BOOK-*`, `CAL-PANEL-*`, `SUPPORT-CAL-*`, `CAL-NAV-*` | 같은 appointment id를 유지하고, 동시 편집 충돌을 서버 검증·복구 UI로 처리 | #83~#85, #90/#91, MR2-10 | `docs/design/screen-behaviors.md:868-1130`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:1744-1767,5089` |
| `/admin/schedule` | `SCHED-TAB-01~05`, `SCHED-GRID-*`, `SCHED-WEEK-*`, `SCHED-DEPT-*`, `SCHED-HOURS-*`, `SCHED-EXC-*`, `SCHED-SAVE-*`, `SCHED-SLOT-*`, `SCHED-CALC-01~06`, `SCHED-DONE-01~06`, `SCHED-WARN-01~11` | schedule이 운영시간 단일소스이며, 저장·계산·영향 처리·통지를 분리 | #33, #88~#97, #105/#106; MR2-05 | `docs/design/screen-behaviors.md:1130-1300,1420-1467`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4950-4983,5084` |
| `/admin/settings` | `HSET-NAV-01`, `HSET-NAV-*`, `HSET-BOOK-*`, `HSET-WAIT-*`, `HSET-SMS-01~06`(특히 `HSET-SMS-05`), `HSET-INFO-*`, `HSET-MSG-01`, `HSET-MSG-*`, `HSET-SAVE-01~09` | 병원·예약·대기·SMS·메시지 설정을 5개 메뉴 그룹으로 분리하고, template token/preview/save 결과를 제공 | #32/#72/#98/#103/#107/#125/#126 | `docs/design/screen-behaviors.md:1302-1416`; `HANDOFF.md:246-249` |
| 발송·이력 | `SEND-DOOR-01~05`, `SEND-DOOR-*`, `SEND-LIST-*`, `SEND-OPEN-*`, `SEND-BOX-*`, `SEND-WHO-*`, `SEND-ALL-01~10`(특히 `SEND-ALL-10`), `SEND-CH-*`, `SEND-KIND-*`, `SEND-ADS-*`, `SEND-NIGHT-*`, `SEND-LATER-01~05`(특히 `SEND-LATER-02`), `SEND-RESULT-*`, `SEND-FAIL-*`, `SEND-DEAD-*`, `SEND-RETRY-*`, `SEND-BADGE-*`, `PICK-*` | 실제 channel·종류·대상 선택·결과·실패·dead token·retry·예약 발송을 `/messages` 원장과 직원 업무행에 연결 | #99~#104, #109~#123, #125/#126 | `docs/design/screen-behaviors.md:267-491`; `HANDOFF.md:240-249` |

### `/today`

- 당일 업무를 문제 우선으로 보여주고, 예약 요약·상태 행·지원 요청 행을 함께 제공한다 (`docs/고객요구사항.txt:84-100`; `screen-behaviors.md:493-625`).
- 후반 결정으로 별도 취소·변경 수치 카드는 제거하고, 해당 지원 요청은 예약과 연결된 행으로 표시한다. 일반 `확인 필요 상담 문의` 카드는 유지한다 (`HANDOFF.md:112-117`; `screen-behaviors.md:5417-5433`).
- 직원이 schedule 영향 예약을 선택·처리하는 주 화면이다. 관리자의 schedule 화면에서 예약을 자동 취소하거나 checkbox로 일괄 확정하지 않는다 (`screen-behaviors.md:1420-1467`).
- summary endpoint의 `pending_inquiries_count: 0` 하드코딩은 실제 query로 교체해야 한다. 현행 플랜은 endpoint를 `/today-summary`로만 기술한다 (`plans/staff-web.md:1810-1957,3716-4727`).
- 자정 경계, no-show, 예상 대기시간, 예약 확정 알림, 지원 요청 badge가 상태·empty·live 규칙에 포함되어야 한다 (`screen-behaviors.md:493-625`; 관련 갭 #1/#21/#28/#29/#37).

### `/queue`

- 7개 상태 탭과 행 단위 정보, DnD에는 사유가 필요하다 (`staff-web-design.md:52-59`; `screen-behaviors.md:666-868`).
- 환자 대기 순서는 `QUEUE-ORDER-*`의 진료 대기 순번·상태 규칙을 적용한다. ticket inbox의 D2 `created_at ASC, id ASC`는 `코5` ticket 목록 계약이며 `/queue` 순번으로 확장하지 않는다 (`HANDOFF.md:112-117`; `screen-behaviors.md:690-725`).
- walk-in은 목록 안의 임의 버튼이 아니라 공통 start action과 연결하고, 초기 상태·다음 가능 시간을 서버 결과로 표시한다 (`screen-behaviors.md:739-803`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3794-3805`).
- 번호 reveal, filter, empty/live update, same appointment id 보존, undo를 포함한다 (`screen-behaviors.md:803-868`).
- queue의 ticket inbox 본체와 claim 화면은 `코5`; 셸의 링크와 unread badge 계약만 이 색인에서 관리한다.

### `/calendar`

- 주간/일간 보기, 부서·의사 필터, 예약 슬롯, 전화 예약, 영향을 받는 예약 표시를 제공한다 (`staff-web-design.md:39-50`; `screen-behaviors.md:868-1130`).
- reschedule은 같은 appointment id를 유지하며, 실제 예약 시간·과거 슬롯·booking deadline을 각각 구분한다 (`staff-web-design.md:39-50`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3807-3824,3891-3895`).
- 의사별 색상은 안정적인 palette/index로 관리하고, 실시간 충돌은 optimistic update 후 서버 검증 결과를 보여준다 (`screen-behaviors.md:977-1057`).
- race rule은 이중 예약을 “경고만”으로 끝내지 않고 충돌 정보·복구·재조회 경로를 제공한다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:1744-1767`; `screen-behaviors.md:1039-1057`).
- calendar에서 영향 예약을 선택해 취소하는 checkbox 흐름은 폐기하고, 영향 계산·처리는 `/today`로 연결한다 (`screen-behaviors.md:1459-1465`).

### `/admin/schedule`

- schedule은 운영시간의 단일 소스이며, 부서/의사/요일별 규칙과 휴무·예외를 편집한다 (`screen-behaviors.md:1130-1300`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3419,3741-3746`).
- 최종 UI에는 **`전체 현황/진료과 관리/의사별 스케줄/특정 날짜 변경` 왼쪽 세로줄**, grid, week view, department filter, save, exceptions, hours, slot 계산을 명시한다 (`screen-behaviors.md:1130-1300`).
- 7일 저장은 원자적이어야 하고, 영향 건수·예상 재조정 시간을 계산하되 0건이면 warning/popup을 열지 않는다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3748-3753`; `screen-behaviors.md:1425-1453`).
- schedule 저장 완료 자체는 환자 통지를 하지 않는다. 직원이 affected appointment를 확인한 후 별도 전송한다 (`screen-behaviors.md:1459-1465`).
- 기존 플랜의 per-doctor rule/exception/slot CRUD는 목표의 일부만 덮으며, 최신 부서 필터·batch·closure·version·affected contract를 반영해 재작성해야 한다 (`plans/staff-web.md:6179-7122`).

### `/admin/settings`

- 기존 route 목록과 기존 플랜에 빠져 있으므로 신규 route로 추가한다 (`staff-web-design.md:22-27`; `plans/staff-web.md:25-134`).
- 운영시간은 schedule에 두고 settings에서 중복 편집하지 않는다. settings는 예약, 대기, SMS, 병원 정보, 메시지/템플릿 설정을 제공한다 (`screen-behaviors.md:1302-1416`).
- 메시지 설정은 free text, template token, preview, confirm, channel, enabled/default를 표시한다. 토큰은 name/date/time을 지원한다 (`screen-behaviors.md:1361-1402`).
- SMS column만 조건부 잠금하고 표의 전체 행을 잠그지 않는다. missing table gap #126을 데이터 모델·화면·권한에 반영한다 (`screen-behaviors.md:1395-1402`).
- 저장은 변경 요약·preview·성공/실패 결과를 제공한다. settings audit id는 공통 mutation 감사 계약에서 별도로 정의한다 (`screen-behaviors.md:1404-1416`).

### 공통 발송·알림 화면

- 발송 결과는 channel, sender/recipient count, status, failure reason, scheduled_at, provider event를 보여준다 (`screen-behaviors.md:399-491`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3540-3566`).
- 실패 행은 재사용 가능하되 retry는 원본을 덮어쓰지 않고 별도 시도 이력을 만든다. dead token/실패 번호는 직원에게 원인을 표시하되 개인정보는 마스킹한다 (`screen-behaviors.md:399-491`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3568-3572`).
- 예약 발송은 `/messages` 제1문 화면의 `예약해 둔 것` 목록에서 목록·취소·상태 전이를 제공한다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3597-3601`; `screen-behaviors.md:323-327,331-342`).

## 4. 기존 체크박스·후반 결정 중 미반영분

아래는 결정 로그 후반의 체크박스/갭 중 직원웹 기존 범위에 직접 영향을 주는 항목이다. `코3`, `코5`, `코1`은 본 색인에서 연동 계약만 남기고 해당 담당자의 색인·스펙으로 넘긴다.

직접 체크박스의 대표 줄은 다음과 같다. 범위 안에 섞여 있는 `#11/#12` 등 다른 담당 항목은 staff 변경으로 오인하지 않는다.

| 체크박스 줄 | 담당 항목 | 현재 판정 |
|---|---|---|
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3214` · `:3218` | #6 지원 요청 필드 · #1 직원 확정 알림 | 플랜 재작성 |
| `:3332` · `:3391` · `:3398` | #21 예상 대기 · #28 no-show 생성 · #29 이력 반환 | 표시·상태 계약 재작성 |
| `:3410` · `:3415` · `:3419,3741-3746` | #31 export · #32 settings · #33 운영시간 | route/API/schedule 재작성 |
| `:3440` · `:3446` · `:3452` | #35 reveal · #36 undo · #37 자정 | 공통 mutation/today/queue 보강 |
| `:3499` · `:3505` · `:3511` · `:3517` | #109 · #110 · #111 · #112 | #109~#111 backend/audit 재작성; #112 화면은 정본 반영, route/task 연동 재작성 |
| `:3525` · `:3532` · `:3540` · `:3547` · `:3554` · `:3562` | #126 · #125 · #121 · #119 · #122 · #120 | settings/outbox/provider callback 재작성 |
| `:3582` · `:3597` · `:3615` · `:3627` | #117 · #118 · #115 · #114 | send history/scheduled send/권한 재작성 |
| `:3635` · `:4935,4945` | #113 `/cancellation-requests` | 폐기 결정. 독립 화면을 추가하지 않음 (`코5` ticket과 `/today` 연동) |
| `:3650` · `:3655` · `:3661` · `:3669` | #90 · #91 · #104 · #101 | schedule→today/전송 channel 연동; 환자 표시·광고 동의 본체는 `코1` |
| `:3687` · `:3693` · `:3699` · `:3706` · `:3714` | #103 · #100 · #107 · #105 · #106 | #100 삭제·SMS 재발송, #103 서버 조회, settings preview, schedule UI/state |
| `:3721` · `:3726` · `:3734` · `:3741` · `:3748` | #99 · #98 · #97 · #96 · #95 | first notify, settings, no-immediate-notify, closures, atomic save |
| `:3755` · `:3763` · `:3769` | #92 · #93 · #94 | department/batch 재작성; #94 lunch exception은 고객 확인 전까지 미결 |
| `:3774` · `:3787` · `:3794` · `:3801` · `:3807` · `:3819` · `:3824` | #89 · #88 · #87 · #86 · #85 · #84 · #83 | affected 처리 위치, walk-in, actual time, calendar palette |
| `:3836` · `:3869` · `:3891` | #82 · #79 · #45 | undo, login/logout, booking deadline |

| 원문 위치 | 항목 | 이 영역의 처리 |
|---|---|---|
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3214-3222` | #6 지원 요청 필드, #1 직원 확인 알림 | `/today` row와 알림/badge 계약을 staff 플랜에 추가; ticket 본체는 `코5` |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3332-3338` | #21 예상 대기 | today와 staff walk-in 의사 선택에서 서버 계산값을 소비; 환자 화면은 `코1` |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3391-3402` | #28/#29 no-show | today/queue 상태 전이·이력·undo를 추가하되 undo는 공통 mutation 계약으로 분리 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3410-3429,3741-3746` | #31 export, #32 settings, #33 운영시간 | export 공통 계약, `/admin/settings`, schedule 단일 소스를 추가. `3419` 이후의 최종 이동·폐기 결정을 기준으로 삼음 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3440-3452` | #35 reveal, #36 undo, #37 자정 | shell/today/queue/calendar 공통 규칙으로 추가 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3499-3524` | #109 notify, #110/#111 audit/settings, #112 first-door send | send/settings 계약을 추가. 환자 통지·동의 본체는 `코1`과 연동 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3525-3566` | #125/#126 settings table, #119-#122 결과·retry·callback | settings/message/send outbox 모델과 화면을 추가 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3568-3601` | #123 dead number, #117 send audit, #118 scheduled send | 직원 결과/이력 표시를 추가; 환자 detail의 dead 표시 본체는 `코3` |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3615-3633` | #115 count, #114 role | 발송 결과와 서버 권한표에 추가 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3650-3674` | #90/#91 영향 예약, #104 ads, #101 채널 | schedule→today 처리와 전송 channel을 추가; 광고/동의 본체는 `코1` |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3687-3704` | #100/#103/#107 | dead token, settings 이동, preview count를 추가 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3706-3724` | #105/#106 schedule, #99 최초 통지 | schedule UI·상태 모델·message template를 추가 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3726-3767` | #98, #97, #96, #95, #92-#94 | settings, no-immediate-notify, closure, atomic save, department/batch를 schedule 플랜에 추가. #94 lunch exception은 미결 질문으로 보존 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3774-3834` | #89/#88/#87/#86/#85/#84/#83 | 영향 처리 위치, walk-in, actual time, calendar palette를 추가 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3836-3874` | #82 undo, #79 login/logout | 공통 mutation과 shell/session 규칙으로 추가 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3891-3895` | #45 booking deadline | calendar/schedule validation에 추가 |

다음 late decision도 별도 체크박스로 다시 만들지 말고, 역검증 결과를 해당 스펙·플랜의 acceptance criteria로 옮긴다. D5·D7은 이미 정합하여 별도 변경이 없다.

- D1: urgent 분류 실패는 `CHAT-URGENT-EXC-01`의 안내 문구를 소비한다. 직원웹에서는 공통 알림·today badge cross-link만 유지 (`HANDOFF.md:127-129`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5038`).
- D2: ticket ordering은 `TICKET-INBOX-ORDER-02`의 `created_at ASC, id ASC`를 ticket inbox와 그 목록을 소비하는 badge query에만 적용한다. `/queue` 순번과 `claim_ticket`은 별도 계약이다 (`HANDOFF.md:116,127`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5039,5056-5058`).
- D3: 자동 배정은 `TICKET-DETAIL-ASSIGN-02`·`TICKET-DETAIL-SCOPE-01` 계약을 따르며, 직원 queue는 상태·승패 결과만 소비한다. 실제 claim 본체는 `코5` (`HANDOFF.md:127`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5040,5051-5054`).
- D4: `/today` 지원 요청은 `SUPPORT-TODAY-*`·`TODAY-RESCHED-23~28` 환자별 행으로 통합하고, 별도 취소·변경 수치 카드는 만들지 않는다. `NAV-STFSUP-08·14` 및 `TICKET-INBOX-ROW-01` 양방향 내비를 반영한다 (`HANDOFF.md:115,127-129`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5041,5060-5067`).
- D5: 직원 109 예약 패널의 닫기 표시와 처리 의미는 기존 `SUPPORT-PANEL-CLOSE-01`과 정합하므로 별도 수정 없음 (`HANDOFF.md:117,127`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5042,5070-5071`).
- D6: `LATEFLOW-POP-CLOSE-01`·`LATEFLOW-POP-BUSY-01`·`LATEFLOW-POP-ERR-01`은 해당 lateflow popup의 처리 중 닫기·오류 복구 계약이다. staff queue/today/calendar에 직접 확장하지 않으며, 필요하면 staff 전용 busy/close rule을 별도로 정의한다 (`HANDOFF.md:127`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5043`).
- D7: 최신 `SHELL-NAV-01·02·04`를 사용하고 이전 3그룹 설명은 폐기한다 (`HANDOFF.md:94,127`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5086`).

## 5. 폐기·대체 결정

| 폐기 대상 | 폐기 이유 | 대체 규칙 |
|---|---|---|
| 과거 직원웹 셸의 3그룹 IA | MR2-07에서 상담봇 4그룹과 최종 업무/기록/설정 구조로 변경됨. 과거 결정 로그는 3그룹을 설명함 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:1656-1677,3185-3189`) | 최종 근거는 MR2-07과 `SHELL-NAV-01~04` (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5086`; `screen-behaviors.md:83-86`), 최종 sidebar는 `HANDOFF.md:94` |
| `/admin/schedule`의 저장 직후 자동 환자 통지 | schedule 갱신과 통지의 책임이 섞이고 직원 확인 단계가 사라짐 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3734-3739`) | 계산→완료→직원 선택→send의 분리 (`screen-behaviors.md:1420-1467`) |
| schedule 화면의 영향 예약 checkbox로 자동 취소 | 관리자 checkbox가 예약 취소로 오해될 수 있음 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3774-3782`) | 영향 건수/time은 admin schedule, 선택·처리는 staff `/today` (`screen-behaviors.md:1454-1465`) |
| `needs_rescheduling` 단일 문제 flag만으로 처리 | 계산 전/후/처리 완료/실패를 구분할 수 없음 (`plans/staff-web.md:6566-6576,6862-6870`) | versioned calculation + explicit done state (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4950-4983`; `screen-behaviors.md:1436-1453`) |
| 기존 `HOURS-EXC`/병원 운영시간 예외 모델을 별도 단일 소스처럼 사용 | 운영시간이 schedule과 분리되어 계산 결과가 달라짐 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3419,3741-3746`) | schedule 주간 규칙 + closure/exception을 서버 계산기에 합성 (`screen-behaviors.md:1130-1300`) |
| `/calendar`의 affected appointment “전체 선택” 기본 checkbox | calendar에서 환자 조치를 직접 확정하지 않기로 결정 (`screen-behaviors.md:1459-1465`) | calendar는 영향 정보/링크를 제공하고 `/today`에서 직원이 선택 |
| 기존 plan의 per-doctor schedule CRUD만으로 최종 schedule을 설명 | 부서 filter, batch save, closure, atomic week, affected 계산이 누락됨 (`plans/staff-web.md:6179-7122`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3734-3767`) | `SCHED-TAB`, `SCHED-DEPT-*`, `SCHED-HOURS-*`, `SCHED-CALC-*`, `SCHED-DONE-*` (`screen-behaviors.md:1130-1300,1420-1467`) |
| 구형 `/cancellation-requests` 독립 queue/card 흐름 | 후반 지원 요청/ticket 결정과 화면 책임이 달라짐. 구형 staff spec에도 과거 cancellation 요청 UI가 남아 있음 (`staff-web-design.md:106-117`; `plans/staff-web.md:5403-6177`). 독립 queue 폐기는 `decision log:4228-4253,4935,4945`에서 확정됨 | support ticket/appointment 연결과 `/today` 지원 요청 행. cancellation 본체는 `코5` ticket과 calendar/today 흐름으로 대체 |
| SMS만을 전제로 한 발송 결과/설정 | 모든 전송 모드와 실제 channel을 기록하기로 결정 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3547-3566,3661-3674`) | channel-aware outbox, result, retry, scheduled-send 모델 |
| SMS 설정 표 전체 행 잠금 | 변경 가능한 메시지/채널과 잠금 대상이 섞임 (`screen-behaviors.md:1395-1402`) | SMS column만 lock, 행별 enabled/default/preview 유지 |
| chatbot 운영시간 mockup 118 | MR2-05에서 운영시간 단일 소스가 schedule로 정리되어 deprecated 됨. 상담봇은 read-only consumer다 | `SCHED-HOURS-*`와 `/admin/schedule` (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5084`; `HANDOFF.md:63-64`; `screen-behaviors.md:1130-1300`) |
| queue 내부의 중복 start/Walk-in action | 공통 헤더의 단일 start action 결정과 충돌 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:1769-1783`) | shell의 단일 action과 queue의 walk-in 상태 계약 (`screen-behaviors.md:93-100,753-803`) |

## 6. 주요 링크 및 재작성 순서 제안

### 원문·현행 산출물 링크

1. 공통 브리프: `.claude/codex-work/briefs/SPECINDEX-common.md`
2. 직원웹 기존 브리프: `.claude/codex-work/briefs/SPECINDEX-2-staffweb-existing.md`
3. 직원웹 기존 스펙: `docs/superpowers/specs/2026-07-27-staff-web-design.md`
4. 직원웹 기존 플랜: `docs/superpowers/plans/2026-07-27-staff-web.md`
5. 현재 화면 동작 규칙: `docs/design/screen-behaviors.md`
6. 전체 결정 로그: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`
7. 고객 요구사항: `docs/고객요구사항.txt`
8. 인수인계·최종 역검증: `HANDOFF.md`
9. 참고 색인 형식: `.claude/codex-work/spec-index/SPECINDEX-patient-app.md`

### 스펙·플랜 재작성 순서

1. **최신 결정과 규칙을 기준선으로 고정한다.** 결정 로그의 late decision과 D1~D7 역검증을 읽고, `screen-behaviors.md`의 `SHELL-NAV-*`, `TODAY-*`, `QUEUE-*`, `CAL-*`, `SCHED-*`, `HSET-*`, `SEND-*`를 요구사항 ID의 권위 있는 source로 삼는다 (`HANDOFF.md:18-56,112-144`).
2. **직원웹 스펙의 route·소유권을 고친다.** `/today`, `/queue`, `/calendar`, `/admin/schedule`의 최신 화면 계약을 반영하고, 빠진 `/admin/settings`와 settings/send 계약을 추가한다. old cancellation queue는 `코5`의 support ticket 결정과 대조하여 제거 또는 cross-link한다 (`staff-web-design.md:22-134`).
3. **공통 데이터/상태 계약을 먼저 다시 쓴다(이 색인의 staff plan 내부 제안).** support request fields, appointment link, schedule version/affected state, 발송 기록/시도 상태/retry/provider event, audit/reveal, role checks를 API·DB 표로 고정한다. 이 단계에서 `pending_inquiries_count:0` 하드코딩을 제거할 query 계약을 명시한다 (`plans/staff-web.md:3716-4727`; `HANDOFF.md:112-117`). 공식 전체 반영 순서는 동작명세→스펙→migration→plan이다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4839-4855`).
4. **schedule을 단일 계산기로 재작성한다.** 기존 Task 17의 CRUD를 보존하되 department filter, batch/atomic save, closure, **미결인 lunch 예외 상태**, versioned calculation, no-immediate-notify, affected count/time을 새 구조로 정리한다 (`plans/staff-web.md:6179-7122`; `screen-behaviors.md:1130-1300,1420-1467`).
5. **today/queue/calendar의 mutation 순서를 정리한다.** today는 지원 요청·affected row의 처리 주체, queue는 환자 대기 순번/undo, calendar는 race/actual time/reschedule만 담당하게 분리한다. ticket claim/order는 `코5` 계약으로 남긴다 (`plans/staff-web.md:1810-2631,4736-5112`; `screen-behaviors.md:493-1130`).
6. **settings와 send를 독립 task로 추가한다.** 설정 항목·권한·preview·save 결과, channel-aware 발송 기록·예약 발송·result/retry/dead/callback을 구현 순서와 acceptance criteria로 쓴다. 예약 발송의 화면 위치는 새로 결정하지 않고 `/messages`의 `SEND-DOOR-02·05`를 반영한다 (`screen-behaviors.md:1302-1416,317-397`; `HANDOFF.md:240-249`).
7. **셸과 cross-owner 링크를 마지막에 고정한다.** 최신 sidebar/role별 visibility, unread badge, login/logout/session expiry를 route map에 반영하고, `코1` 환자 화면·`코3` 환자/관리 화면·`코5` ticket 본체와의 API/link만 검증한다 (`screen-behaviors.md:77-121`; `HANDOFF.md:94,112-117`).
8. **재작성 후 역검증한다.** decision log의 D1~D7 및 MR2-05/07/09/10을 line-by-line으로 대조하고, 각 rule ID가 스펙의 화면 결정과 플랜의 구현 task/acceptance criteria에 모두 연결되는지 확인한다 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4839-4932,5032-5089`).

### 소유권 경계

| 표기 | 이 색인에서의 처리 |
|---|---|
| `코1` | 환자 앱의 동의·환자 노출·환자 통지 문구 본체. 직원에는 결과/상태/링크 계약만 기록 |
| `코3` | 환자 상세, check-in, doctor console, admin staff/stats/access logs/errors, 환자 검색 본체. 직원 화면에 필요한 link·권한·공통 API만 기록 |
| `코5` | ticket inbox, `claim_ticket`, 상담봇 운영 화면 본체. 직원 shell badge와 `/today` 지원 요청 row의 소비 계약만 기록 |
| staff-web | `/today`, `/queue`, `/calendar`, `/admin/schedule`, `/admin/settings`, shell/nav 및 이 색인에 명시한 공통 send/settings 연동 |


---

# Part B — 신규 15화면 + 상담봇 운영 접점

# 통합 SPECINDEX — 직원 웹 + 상담봇 운영 화면

> **다른 터미널용 단일 읽기 파일:** 직원 웹·상담봇 직원/관리자 화면·전수 재대조·미결 사항은 이 파일을 기준으로 취합한다.
> `SPECINDEX-chatbot-staff-admin.md`와 `AUDIT-SPECINDEX-staffweb-15screens-claim-recheck.md`는 상세 보조 기록이며, 서로 충돌할 때는 이 파일의 **통합 정본 요약**과 최신 결정로그를 우선한다.
> 이 파일은 구현 기록이 아니라, 직원 웹과 상담봇 운영 화면을 스펙·동작명세·플랜으로 다시 쓸 때 쓰는 추적 색인이다.
> 줄번호는 이 색인을 작성한 현재 working tree 기준이다. 원문을 고친 뒤에는 아래 링크의 줄번호를 다시 갱신한다.

## 0. 통합 정본 요약 — 먼저 읽을 부분

| 항목 | 현재 정본 | 해석·주의 |
|---|---|---|
| 과거 `15화면` | `90ca0ca`의 직원 웹 설계 병합 묶음명 | 현재 화면 수 계약이 아니다. |
| 직원 웹 route 범위 | 대표 route **18개** | 코3 직접 담당 13개 + 공통 직원 웹과 겹치는 5개. route 수로만 사용한다. 아래 상세 표가 목록의 정본이다. |
| 사이드바 | 진료 화면 단독 + 업무·기록·설정·상담봇 **4그룹** | 초기 AD-069의 3그룹 표현은 후속 `MR2-07`에서 교체됐다. 이 항목은 미결이 아니다. |
| 상담봇 직원·관리자 | 상담봇 4번째 그룹의 별도 운영 범위 | 티켓함·티켓 상세·전체 상담 기록·오답 신고·지식·미해결·품질·예시·통계 등을 이 파일의 통합 범위에 포함한다. 공통 `/today`·`/calendar`·`/patients/:id`는 중복 route로 세지 않는다. |
| 전체 화면 수 | **정본 숫자를 두지 않음** | `53`은 앱·웹·컴포넌트 프레임이 섞인 초안 inventory 합계라 구현·취합 기준으로 쓰지 않는다. 필요한 경우 각 화면/route 목록을 기준으로 확인한다. |
| 전수 대조 | 표 데이터 행 185개 및 별도 asset·링크·실행안 대조 완료 | 오류·조건·인용 문제는 주 색인에 반영했다. 다만 구현 차단과 대상 미확인은 남아 있다. |

### 통합 파일 사용 규칙

1. 다른 터미널은 이 파일만 읽고 직원 웹과 상담봇 운영 화면의 범위·결정·미결을 취합한다.
2. `18개`는 직원 웹 대표 route 부분집합이며 전체 제품 화면 수가 아니다.
3. `53개`는 정본 숫자로 사용하지 않는다. 화면 수가 필요하면 아래 route 표와 상담봇 범위 표를 함께 보고 중복 여부를 확인한다.
4. `정책 확정`, `구현 차단`, `대상 미확인`, `다른 영역 담당`을 서로 다른 상태로 유지한다.
5. 아래 미결 목록에 없는 항목은 확정으로 간주하지 말고, 최신 결정로그·동작명세와 다시 대조한다.

## 검증 범위와 판정 기준

- 결정 근거는 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`, 화면 규칙은 `docs/design/screen-behaviors.md`, 요구사항은 `docs/고객요구사항.txt`, 현재 상태는 `HANDOFF.md`를 원문 검색으로 대조했다.
- 스펙/플랜 target은 실제 파일 `docs/superpowers/specs/2026-07-27-staff-web-design.md`와 `docs/superpowers/plans/2026-07-27-staff-web.md`의 현재 줄을 사용했다. 대상 절이 없는 경우에는 기존 Task 뒤의 삽입 위치를 명시하고 `신규 Task`로 표시했다.
- 표 안의 `screen-behaviors.md`, `staff-web.md`, `staff-web-design.md`, `결정로그`는 각각 위의 전체 경로를 줄인 표기이며, 뒤따르는 `:줄`은 직전 파일의 줄이다.
- `정책 확정`은 사용자 선택이 끝났다는 뜻이고, `BLOCKER`/`구현 차단`은 DB·API·목업·플랜 구현이 아직 정합화되지 않았다는 뜻이다. 정책 미결과 구현 차단을 섞지 않는다.

## 범위와 경계

직원 웹의 새 화면 묶음은 환자 상세, QR/예약번호 접수, 의사 콘솔, 직원·문진·병합·오류·통계 관리자 화면, 메시지, 설정, 직원 인증과 화면 흐름을 포함한다. 일정·오늘 현황·대기목록·환자검색은 공통 직원 웹의 선행 화면이므로 이 색인에서는 연결 계약과 겹치는 갭만 표시한다. 사이드바의 `상담봇` 그룹은 코5의 별도 직원·관리자 화면으로 연결되며 아래 코3 직원 웹 18개 route에는 넣지 않는다.

| 구분 | 이 색인에서의 처리 |
|---|---|
| 코3 직접 담당 | `/patients/:id`, `/checkin`, `/doctor/console`, `/admin/staff`, `/admin/access-logs`, `/admin/questionnaires`, `/admin/patient-merge-candidates`, `/admin/merge-history`, `/admin/errors`, `/admin/stats`, `/messages`, `/admin/settings`, `/login` 및 직원 로그인·복구·세션 흐름 |
| 코2와 겹침 | `/today`, `/calendar`, `/queue`, `/patients`, `/admin/schedule`, 의사 색상·대기시간·휴일·진료과 CRUD·내보내기. 이 파일은 직원 화면이 소비하는 계약만 기록한다. |
| 코5와 겹침 | 환자 상세의 상담 문의 영역과 `/today`의 일반 `확인 필요 상담 문의` 카드가 코5와 겹친다. `pending_inquiries_count: 0` 하드코딩은 HANDOFF 당시 상태이며, 현재 동작명세는 pending 티켓 실제 건수를 표시한다. 취소·변경 상담은 별도로 `확인 필요한 예약` 카드의 행으로 합류한다. `HANDOFF.md:115`, `HANDOFF.md:253-259`, `screen-behaviors.md:5421-5427` |
| 코1/코4와 겹침 | 앱·챗봇의 마감 후 취소/변경, 문자·푸시 제공자와 토큰. 직원 쪽 표시·재시도·감사 계약만 여기서 고정한다. |

### 화면 수와 목록의 불일치

| 주장/목록 | 확인 결과 | 색인 판단 |
|---|---|---|
| 브리프의 직원 웹 15화면 | 목업 76~85b와 커밋 `90ca0ca`를 기준으로 한 과거 설계 병합 묶음 | 현재 route 수가 아니라 역사적 작업명으로만 보존한다. |
| 현재 활성 직원 웹 route | 직접 담당 13개 + 공통 직원 웹과 겹치는 5개 = **18개** | 아래 route 표를 현재 수의 정본으로 삼는다. `/cancellation-requests`와 변형·상태판·흐름도는 제외한다. |
| `HANDOFF.md`의 16화면 표 | 직원 웹 16화면이라고 적었지만 목록·폐기 화면이 섞여 있다. `HANDOFF.md:244-249` | 과거 상태 기록으로만 남기고 현재 수의 계약으로 사용하지 않는다. |
| `/cancellation-requests` | 갭 #113으로 목록에서 빠졌지만 예전 스펙·플랜에는 존재한다. 취소 흐름 결정은 `결정로그:4228-4255`, 문서 폐기 지시는 `:4796-4801`에 있다. | 전용 화면을 되살리지 말고 공통 상담 흐름으로 치환한다. |
| `/messages` | 새 직원 화면으로 결정됐지만 기존 staff-web 플랜에는 독립 Task가 없다. `docs/design/screen-behaviors.md:2325-2351` | 새 스펙 절·새 플랜 Task를 추가한다. |
| `/admin/errors` | 목업/동작명세에는 있으나 원래 플랜에는 실질 Task가 없다. 갭 #124. `docs/design/screen-behaviors.md:2149-2214` | 새 라우트·API·권한·마스킹 Task를 추가한다. |
| `/admin/staff` | 현재 동작명세에는 `STAFF-*`가 추가됐지만, 핸드오프 시점에는 규칙 0개였고 영향 예약 계약이 없다. `HANDOFF.md:254`, `docs/design/screen-behaviors.md:1837-1905` | 가장 먼저 플랜을 다시 쓴다. `SCHED-DEPT-05`가 이 화면으로 보내며 `SB-48`의 결과가 미정이었다. |

### 현재 활성 직원 웹 route 정본 — B안

세는 단위는 **사용자가 직접 진입하는 대표 route**다. `/:appointmentId`, `/:merge_event_id` 같은 상세 경로, 로그인 복귀, 화면 변형은 부모 화면에 포함한다. 폐기된 `/cancellation-requests`, 흐름도·상태 모음판·가독성 견본은 세지 않는다.

| 번호 | 대표 route | 소유 범위 | 포함 규칙 |
|---:|---|---|---|
| 1 | `/patients/:id` | 코3 | 환자 상세·support·가족·문진·기록·메모 |
| 2 | `/checkin` | 코3 | QR/예약번호 접수 |
| 3 | `/doctor/console` | 코3 | 예약 상세 하위 경로 포함 |
| 4 | `/admin/staff` | 코3 | 직원·의사 관리 |
| 5 | `/admin/access-logs` | 코3 | 접근 기록 |
| 6 | `/admin/questionnaires` | 코3 | 문진 양식·버전 |
| 7 | `/admin/patient-merge-candidates` | 코3 | 병합 후보 |
| 8 | `/admin/merge-history` | 코3 | 병합 이력·상세 하위 경로 포함 |
| 9 | `/admin/errors` | 코3 | 시스템 오류 |
| 10 | `/admin/stats` | 코3 | 운영 통계 |
| 11 | `/messages` | 코3 | 직접·예약 메시지 발송 |
| 12 | `/admin/settings` | 코3 | 병원·알림 설정 |
| 13 | `/login` | 코3 | reset/session 변형 포함 |
| 14 | `/today` | 코2와 겹침 | 상담·일정변경·확인 필요 행 소비 |
| 15 | `/calendar` | 코2와 겹침 | 예약·상담 경고·기존 패널 소비 |
| 16 | `/queue` | 코2와 겹침 | 접수·대기 상태 |
| 17 | `/patients` | 코2와 겹침 | 환자 통합 검색 |
| 18 | `/admin/schedule` | 코2와 겹침 | 진료과·의사 일정·운영시간 |

> **상담봇 경계:** 사이드바의 `상담봇` 4번째 그룹은 이 18개에 포함되지 않는다. 상담봇 직원 콘솔(티켓함·전체 상담 기록 등)과 관리자 화면(지식·미해결·품질·통계 등)은 이 파일 §7에서 통합 취합하며, 공통 직원 route(`/today`, `/calendar`, `/patients/:id`)는 중복 산입하지 않는다. 따라서 “직원 웹 18개”는 route 부분집합이고 전체 제품 화면 수가 아니다.

#### 병합 asset roster와 화면/보조 산출물 구분

| asset | 분류 | route·규칙·판정 |
|---|---|---|
| 76·76b·76c·76d | 실제 화면 변형 | `/patients/:id`, `PTDET-*` |
| 77 | 실제 화면 | `/checkin`, `CHKIN-*` |
| 78·78b | 실제 화면 변형 | `/doctor/console`, `DOCTOR-*` |
| 79 | 실제 화면 | `/admin/staff`, `STAFF-*` |
| 80·80b | 실제 화면+가독성 견본 | `/admin/access-logs`, `ALOG-*`; 80b는 공통 density evidence |
| 81 | 실제 화면 | `/admin/questionnaires`, `QADM-*` |
| 82·82b | 병합 화면+되돌림 이력 화면 변형 | `/admin/patient-merge-candidates`·`/admin/merge-history`, `MERGE-*`·`MHIST-*` |
| 83 | 실제 화면 | `/admin/errors`, `ERRADM-*` |
| 84 | 실제 화면 | `/admin/stats`, `STAT-*` |
| 85·85b | 로그인 화면+복구 변형 | `/login`, `STAFF-LOGIN-*` |
| 88·89 | 흐름도·상태 모음판 | route 화면 수에 넣지 않고 `NAVX-STAFF-*`·공통 상태 검증 입력으로 사용 |
| 90 | 실제 화면 | `/admin/settings`, `HSETX-*` |
| 62b | 대기목록 가독성 견본 | `/queue` 공통 density evidence; 신규 76~85 화면 수에는 중복 산입하지 않음 |

> 판정: “15화면”은 `90ca0ca`의 과거 설계 병합 묶음이고 현재 직원 웹 수의 계약이 아니다. 현재 직원 웹 route 정본은 위 **18개 활성 route**이며, 변형 목업·흐름·상태 보조물·가독성 견본은 중복 산입하지 않는다. **4그룹 sidebar는 후속 `MR2-07`에서 최종 정본으로 확정**됐고, 상담봇 운영 범위는 이 파일 §7에 통합했다. `docs/design/mockups/README.md:110-127`, `HANDOFF.md:239-249,274`, 결정로그 `:5086`

## 1. 기능 갭

상태는 `정책 확정/구현 차단`, `문서 불일치`, `코2·코5 연계`, `폐기`로 구분한다. “대상”은 새 스펙 또는 기존 플랜에서 갭을 실제 작업으로 바꿔야 하는 위치다.

| 갭 | 요약 | 상태·실행 | 대상 (`file:line`) |
|---|---|---|---|
| #2 가족 연결 | 연결 API/RPC 계획은 있으나 화면은 보기 중심이고 해제·관계 수정·본인확인 UI가 없다. `POST /admin/family-links`의 접수직원/관리자 역할은 이미 플랜에 있다. | 정책 확정, UI·해제·감사 차단. B 번호 OTP, 번호 없음 예외, B 통보까지 구현 | `staff-web.md:2635-2881`, `:8262-8279`; `screen-behaviors.md:1562-1570`; 요구사항 `고객요구사항.txt:136-149` |
| #19 환자 기본정보 수정 | 환자 상세가 읽기 전용에 가깝다. 이름·생년월일·성별·전화번호 수정, 새 전화번호 OTP, Supabase Auth 동기화와 변경 이력이 없다. | 직원 액션을 추가하고 전화번호는 직접 저장 금지 | `staff-web.md:2635-2881`; `screen-behaviors.md:1624-1630`; `staff-web-design.md:69-75` |
| #30 의사 콘솔 이탈 | 기록 작성 중 로그아웃·세션 만료 시 자동저장/복구·만료 임박 경고가 없다. | 3초 디바운스+30초 안전망, 만료 임박 배너, 임시저장 후 재진입 | `staff-web.md:2883-3247`; `screen-behaviors.md:1816-1825`; `staff-web-design.md:77-85` |
| #36·#82 상태 되돌림 | 대기 환자 열람 시 `waiting→in_progress` 자동 전이는 있으나 잘못 연 경우 되돌림과 전역 역전이가 없다. | 상태 전이 표·역전이 API, 이유 필수, 감사 사건을 추가. 코2 큐 상태와 계약을 공유 | `screen-behaviors.md:1717-1836`; `staff-web.md:1211-1505`, `:2883-3247`; 결정로그 `:3404-3449`, `:3836-3842` |
| #34 병합 계보·정정 | 현재 병합 계획은 인증 사용자 ID 이전과 비활성화 수준이다. 원본 보존·계보·관리자 전용 병합 이력·되돌림이 없다. | 물리 덮어쓰기 금지, 3단계 확인, 별도 `/admin/merge-history`, 이미 열람된 기록은 되돌림 불가 | `staff-web.md:8262-8672`; `screen-behaviors.md:2064-2148`, `:2444-2518`; 결정로그 `:3136-3137`, `:3433-3438` |
| #124 오류 화면 | `/admin/errors`는 규칙만 있고 기존 플랜의 구현 경로가 없다. | 관리자 전용 안전 요약·redacted 기술 상세·기간 필터·서비스 장애 분리 API를 새 Task로 추가 | `screen-behaviors.md:2149-2214`; `staff-web.md:7127-7628`; 결정로그 `:3574-3580` |
| #113 취소 요청함 | 구 플랜 Task 16과 스펙 §10이 승인/반려 대기열을 만들지만 결정 #25가 폐기했다. | `support_requested_at`+`request_type`을 기준으로 `/today`·캘린더·상담함에 합류. 전용 라우트·승인/반려 API 삭제 | `staff-web.md:5403-6174`; `staff-web-design.md:106-117`; 결정로그 `:4228-4262`, `:4796-4799` |
| #112 `/messages` | 직접 발송·예약 발송·취소·실패 재시도 규칙은 있으나 새 화면의 플랜/라우트/API가 없다. | 직원 메시지 화면을 첫 문으로 추가. 5분 단위·KST·예약 가능 범위·실패 수신자만 재시도 | `screen-behaviors.md:2325-2351`; `staff-web.md:7629-7960`; 결정로그 `:3517-3562` |
| #99·#100 메시지 데이터 | 첫 안내문구 서버 저장과 dead push token 정리가 없다. | 문구/토큰 정리 Task를 메시지·앱 담당과 함께 추가. 죽은 토큰은 재시도 대상에서 제외 | 결정로그 `:3693-3725`; `HANDOFF.md:285-304`; `screen-behaviors.md:2325-2351` |
| #115·#117 알림 감사 | 발신자·수신자 목록·검색/대량 열람의 감사 경계가 서로 다르다. | `notification_log`에 발신자·채널·수신자별 결과를 남기고, 검색·번호 보기·대량 열람은 ALOG 사건으로 고정 | `screen-behaviors.md:1906-1987`, `:2325-2351`; 결정로그 `:3582-3595`, `:3615-3621` |
| #118·#119·#120 알림 이력 | 예약 발송 표, 결과 필드, 채널이 부족하거나 push로 고정돼 있다. | pending/sent/failed/cancelled와 채널별 결과·실패원인을 저장하고 UI에서 표시 | 결정로그 `:3547-3597`; `screen-behaviors.md:2325-2351`; `HANDOFF.md:285-304` |
| #121·#122 재시도/콜백 | 자동 2회 후 수동 재시도와 Twilio 상태 callback 계약이 없다. | 실패 수신자만 비용 확인 후 재시도, provider callback으로 최종 상태 갱신, 중복 claim 방지 | 결정로그 `:3540-3560`; `screen-behaviors.md:2325-2351`; `HANDOFF.md:285-304` |
| #123 dead SMS | 환자 상세의 죽은 SMS 표시와 서비스 장애 표시가 분리되지 않았다. | dead phone은 환자별 이력, 서비스 장애는 system error로 분리. `PTDET-HEAD-05`에 안전 문구 추가 | `screen-behaviors.md:1537-1653`, `:2325-2351`; 결정로그 `:3568-3572` |
| #125·#126 알림 설정 | 날짜/시각 토큰과 알림별 override 표가 없다. | 설정의 알림 메뉴에서 토큰 치환·알림 종류별 채널/대상/문구를 관리하고 `/messages`와 분리 | `screen-behaviors.md:2352-2393`; 결정로그 `:3525-3538`; `staff-web.md:7629-7960` |
| #103·#31 SMS 초기값 | SMS 초기 ON, 제공자 미연결 안전장치, 서비스 상태 표시가 구현되지 않았다. | 미연결이면 발송 대신 `문자 미설정` 이력, 비밀키·발신번호는 직원 웹에 노출하지 않음 | `screen-behaviors.md:2352-2393`; 결정로그 `:3687-3691`, `:3160` |
| #79 로그인/복구/세션 | 직원 로그인 화면, 셀프 비밀번호 복구, 무활동 세션이 플랜에 없다. | 관리자 초대 이메일+비밀번호, 자기 이메일 재설정, 무활동 30분 타이머·감사·세션 종료 | `staff-web.md:841-1210`; `screen-behaviors.md:2292-2351`; 결정로그 `:3115-3130` |
| #114 역할 적용 | 역할 규칙은 확정됐지만 신규 라우트·API별 허용 역할을 모두 대조하지 않았다. | admin/receptionist/doctor의 route guard·DB policy·버튼 노출을 한 표로 대조 | `screen-behaviors.md:104-123`; `staff-web.md:841-1210`; 결정로그 `:3627-3633` |
| #7 의사 프로필·#83 색상 | 의사 전문분야·소개·사진·캘린더 색상 입력이 `/admin/staff`에 없다. | 직원 관리에서 수정하고 환자/캘린더 API에 전달. 코2 일정 화면과 공동 계약 | `staff-web.md:7629-7960`; `screen-behaviors.md:1837-1905`; 결정로그 `:3254-3260`, `:3824-3830` |
| #10 `SB-48` | 의사 비활성화 영향 예약의 계산·확정 API가 없고 처리 결과가 미정이었다. `SCHED-DEPT-05`는 `/admin/staff`로 보낸다. | 자동 취소·자동 재배정 금지. 영향 예약은 `needs_rescheduling` 확인 필요 큐에 넣고 접수직원이 건별 처리. 비활성화 시 global sign-out | `screen-behaviors.md:1187`, `:1296-1308`, `:1872-1905`; 결정로그 `:3155-3158`; `staff-web.md:7629-7960` |
| #17 문진 대상 성별 | 문진 관리 화면과 앱의 대상 성별 조건이 연결되지 않았다. | 직원 문진 템플릿에 조건을 보존하되 답변 내용은 담당 의사만 열람 | `staff-web.md:8768-9260`; `screen-behaviors.md:1988-2063`; 결정로그 `:3303-3310` |
| D4 상담 문의 | 환자 상세 support section과 `/today` 상담 카드가 요구되지만 HANDOFF 당시 요약 API는 0을 하드코딩했다. 현재 동작명세는 일반 pending 티켓 건수와 취소·변경 상담 행을 구분한다. 챗봇의 support ticket과 중복될 수 있다. | 티켓·예약 요청의 단일 키와 양방향 이동을 정의하고, 별도 취소 요청 타일은 만들지 않음 | `HANDOFF.md:115`, `:253-259`; `screen-behaviors.md:1604-1612`, `:5421-5427`; 결정로그 `:4189-4197` |
| #21·#31·#87·#92 | 소수 통계/CSV, 다음 진료 가능시각, 진료과 CRUD가 여러 화면에 걸친다. | 코3 화면은 masked·audit·API 소비 계약만 고정하고 계산·일정·내보내기 원본은 코2에 위임 | 결정로그 `:3332-3340`, `:3410-3414`, `:3755-3800`; `staff-web.md:3248-3715`, `:6179-7628` |

## 2. 구조 결정 (DB·API·상태 전이)

| 결정 | 내용·선정 사유 | 영향 범위·다시 쓸 계약 | 우선순위 / 근거 |
|---|---|---|---|
| 역할 | admin은 직원·설정·감사·병합·오류·통계를 관리하고, receptionist는 접수·환자 업무를 수행한다. doctor는 자신의 콘솔과 허용된 환자 기록만 다룬다. 최소권한과 요구사항의 감사 원칙 때문에 역할별 허용을 분리한다. | route guard, Supabase policy, API 403, 버튼 노출을 같은 역할표로 관리. `screen-behaviors.md:104-123`; 요구사항 `고객요구사항.txt:75-82`, `:447-453` | HIGH / 신규 route 전부 |
| 직원 인증 | 관리자 초대 이메일+비밀번호, 셀프 복구, 무활동 30분. 매 로그인 OTP·직원번호·관리자 비밀번호 대행은 사용하지 않는다. 업무 중 기록을 보존하면서 계정 공유를 막는 선택이다. | Auth route, reset token 만료/시도 제한, 다른 세션 종료, 감사 이벤트. `결정로그:3115-3130`; `staff-web.md:841-1210` | HIGH / #79·#27 |
| 환자 기본정보 | 일반 정보 수정은 직원 액션이지만 새 전화번호는 OTP 후 Auth·환자 연락처를 함께 갱신한다. before/after·누가·언제 기록한다. 전화번호가 계정 식별자이므로 직접 저장을 금지한다. | patient update API를 필드별로 분리하고 전화번호 변경을 강한 검증 경로로 둔다. `screen-behaviors.md:1624-1630`; 요구사항 `:136-149`, `:432-445` | HIGH / #19 |
| 가족 연결 | 연결·해제 모두 직원이 가능하다. B 번호 OTP가 기본, 번호가 없을 때만 대면/서류 예외, 완료 시 B 통보·이의제기. 양 당사자에게 영향을 주므로 연결만 허용하지 않는다. | family link/unlink/relationship API, 예외 플래그, notification, `family_link`/`family_unlink` audit. `결정로그:3143-3145`; `staff-web.md:8262-8279` | HIGH / #2·#3 |
| 문진 RLS | 담당 의사만 답변 내용을 열람한다. admin은 템플릿·버전만 관리하고 답변을 읽지 않는다. 개인정보 최소화와 요구사항 420이 선정 사유다. | `00007`의 admin 예외 제거를 새 `00010`에서 처리. 직원 API와 DB RLS를 함께 검증. `결정로그:3121`, `:3178`; `screen-behaviors.md:1585-1594` | BLOCKER / #2·#14·AD-050 |
| 문진 버전 | 저장 즉시 새 불변 버전 활성화, 과거 버전·답변은 읽기 전용. 버전 식별자는 번호·저장시각·저장자이며 이름 변경/삭제/숨김은 없다. 과거 답변을 재현해야 하므로 삭제·덮어쓰기를 배제한다. | template version table, active unique, old answer snapshot/ID, same-screen preview. `screen-behaviors.md:1988-2063`; `결정로그:3164-3165`, `:3183-3184` | HIGH / #12·#13·AD-065·066 |
| 진료 상태 | 의사가 대기 환자를 열면 `waiting→in_progress`; 잘못 연 경우 허용된 역전이만 이유 필수로 실행한다. 업무 화면에서 “열람”과 “진료 시작”이 묶이는 현재 선택을 감사 가능하게 만든다. | appointment state machine, reverse endpoint, optimistic lock/409, `needs_rescheduling`와 분리. `screen-behaviors.md:1717-1836`; 결정로그 `:3404-3449`, `:3836-3842` | BLOCKER / #36·#82 |
| 진료 기록 | 초안은 자동저장, 완료 기록 수정은 의사만 이유 필수. before/after를 보존하고 일반 직원은 수정하지 않는다. 법적·임상 이력을 보존하면서 오류 수정은 허용하는 선택이다. | draft/revision tables 또는 revision payload, save/complete/revise API, logout recovery. `screen-behaviors.md:1816-1825`; `결정로그:3139` | BLOCKER / #8·#30 |
| 병합 | 원본 환자 ID와 기록을 보존하고 lineage로 대표 조회를 연결한다. 병합은 3단계 확인+읽음 체크, 되돌림은 별도 이력에서 관리자만 사유와 함께 실행한다. 비가역 데이터 손실을 막기 위한 선택이다. | lineage table, merge event, undo guard(이미 열람된 기록 불가), `patient_merge`·`patient_merge_undo` 감사. `screen-behaviors.md:2064-2148`, `:2444-2518`; 결정로그 `:3136-3137`, `:3433-3438` | BLOCKER / #15·#16·#17·#18·#34 |
| 감사 | 검색 실행·번호 reveal·대량 열람 모두 기록한다. 환자별 저장이 필요한 사건과 관리자 활동(통계 drilldown/CSV)을 분리한다. 개인을 겨냥한 순간부터 남기는 원칙이다. | `phone_reveal`, search, bulk, merge, merge_undo, stats drilldown/export event; 기존 patient_id 필수 CHECK를 확장. `screen-behaviors.md:1906-1987`, `:2258-2291`; 결정로그 `:3146-3148`, `:3440-3444`, `:3853-3859` | HIGH / #11·#17·#22·#35·#80 |
| 의사 비활성화 | 미래 예약을 자동 취소/재배정하지 않고 `needs_rescheduling` 확인 필요 큐로 보낸다. 환자별 처리 후에만 안내한다. 환자 동의 없는 담당의 변경과 일괄 취소를 피하는 선택이다. | dry-run 영향 예약 API, deactivate transaction, 건별 move/cancel/keep, global sign-out. `screen-behaviors.md:1872-1881`; 결정로그 `:3155-3158` | BLOCKER / #10·SB-48 |
| 알림 | 직접/예약 발송은 `notification_log`의 수신자별 상태로 관리한다. pending만 취소, 자동 2회 후 실패 수신자만 수동 재시도, Twilio callback으로 최종 상태를 갱신한다. 수신자별 조치와 서비스 장애를 섞지 않기 위한 선택이다. | scheduled queue claim/cancel atomicity, provider callback, channel/result/error/cost fields, KST·5분 단위. `screen-behaviors.md:2325-2351`; 결정로그 `:3149`, `:3156-3160`, `:3517-3615`, `:3693-3725` | BLOCKER / #19·#29·#30·#99~#126 |
| 상담 요청 | 마감 후 취소·변경은 `appointments.support_requested_at`+`request_type`을 공통으로 쓴다. 희망 일시는 저장하지 않는다. 취소 전용 queue를 없애 상담 티켓 중복을 방지한다. | `cancellation_requested_at`과 전용 queue를 폐기하고 today/calendar/support ticket에서 한 번만 보인다. `결정로그:4189-4197`, `:4228-4262`; `screen-behaviors.md:5424-5427` | BLOCKER / #6·#113·D4 |
| 오류 | 수신자별 발송 실패는 notification log, 서비스 전체 장애는 system error log에 기록한다. 관리자 오류 화면은 안전 요약을 기본으로 하고 redacted 상세만 제공한다. 환자 정보·비밀·개발 원문을 직원 화면에 노출하지 않기 위한 선택이다. | error severity/source/period API, service outage reason `문자 서비스 장애`, PII/secret redaction. `screen-behaviors.md:2149-2214`; `결정로그:3132`, `:3159` | HIGH / #20·#124 |

## 3. 화면 설계 결정

| 화면/규칙 그룹 | 화면에서 고정할 선택 | 남은 갭·근거 |
|---|---|---|
| 공통 shell·역할·밀도 | 진료 화면은 의사 전용 단독, 나머지는 업무/기록/설정/상담봇 4그룹. 접지 않고 240px sidebar, 1440 기준·1280 최소. 본문 13px·이름 14px·시각 15px·행 44px·버튼 36px 토큰. 결정로그 AD-069의 3그룹 표현은 후속 `MR2-07`에서 **4그룹 최종 정본으로 교체**됐다. | 목업 전체 반영과 route 권한 대조 필요. `screen-behaviors.md:77-123`; 결정로그 `:3187-3188`, `:5086`(AD-069·070·MR2-07). 현재 route 수는 위 B안의 18개 표를 따른다. |
| `/patients/:id` `PTDET-*` | 헤더 요약+2열 섹션+anchor, 탭으로 숨기지 않는다. 방문·가족·문진·기록·지원 문의·내부 메모·액션을 한 화면에서 로드한다. 목록은 masked, 상세 접근은 감사한다. | 환자 편집·가족 OTP·dead SMS·support ticket 연결이 차단. `screen-behaviors.md:1537-1653`; `staff-web-design.md:69-75` |
| `/checkin` `CHKIN-*` | QR 1순위, 6자리 booking code 2순위. 같은 결과 카드에서 `[도착 처리]`, 성공 뒤 화면 유지·`도착` 갱신, `예약확정→도착`, 중복 스캔은 첫 callback을 중복 처리하지 않는다. 서버 전체 멱등 계약은 별도 API 대조가 필요하다. | Task 20은 있으나 API/RLS·오류·카메라 fallback을 새 규칙과 대조. `screen-behaviors.md:1654-1716`; `staff-web.md:7962-8260` |
| `/doctor/console` `DOCTOR-*` | 3열, 오늘 본인 queue, 특정 예약은 `/doctor/console/:appointmentId`. 문진·최근 기록·초안/완료/수정 이유·커서 위치 문구 삽입. 열 너비는 min/max/default로 조절. | 자동저장·세션 이탈 복구·역전이·과거 날짜 정책이 차단되며 autosave 간격·만료 배너·재진입 일부는 정책 미결이다. `screen-behaviors.md:1717-1836`; 결정로그 `:3124`, `:3404-3409` |
| `/admin/staff` `STAFF-*` | 초대·목록·활성/비활성·의사 프로필. 비활성화 전 영향 예약 수만 미리 보고, 확정 시 확인 필요 큐로 이동. | `SCHED-DEPT-05`의 유일한 목적지. 기존 Task 19는 단순 deactivate뿐이고 reactivation/impact API가 없다. `screen-behaviors.md:1837-1905`; `staff-web.md:7629-7960` |
| `/admin/access-logs` `ALOG-*` | 관리자 전용, 환자·기간 조회와 resource type/직원 관련 감사 사건, stable sort, masked list. phone reveal/search/bulk는 각자 감사, 통계 aggregate/filter는 감사하지 않음. | 기존 API가 `patient_detail` 또는 `medical_record`에 고정. resource type·환자 없는 관리자 활동 행을 확장. `screen-behaviors.md:1906-1987`; `staff-web.md:5117-5399` |
| `/admin/questionnaires` `QADM-*` | 템플릿/불변 버전/과거 읽기전용 미리보기만 관리. 답변 내용은 admin/receptionist에게 노출하지 않는다. | Task 22가 단순 양식 화면에 머문다. version RLS·과거 답변 참조·대상 조건을 추가. `screen-behaviors.md:1988-2063`; `staff-web.md:8768-9260` |
| `/admin/patient-merge-candidates` `MERGE-*` | 비교→검토→확인 3단계, 대표/소유권/비가역 고지 읽음 체크. 병합 화면에서 즉시 undo하지 않는다. | lineage·경쟁 잠금·API·감사 미구현. `screen-behaviors.md:2064-2148`; `staff-web.md:8262-8672` |
| `/admin/merge-history` `MHIST-*` | 사건 목록→상세, source/target/실행자/사유/시각, 관리자만 `[되돌림]`. 이미 열람된 기록은 불가 고지. | 완전 신설 화면·route·undo API. `screen-behaviors.md:2444-2518`; 결정로그 `:3136-3137`, `:3433-3438` |
| `/admin/errors` `ERRADM-*` | 안전 요약을 기본 노출하고 기술 상세는 redacted. 서비스 장애와 수신자별 실패를 다른 화면/로그로 분리. | 목업/규칙 대비 플랜·API 0. 새 Task와 관리자 권한을 추가. `screen-behaviors.md:2149-2214`; 결정로그 `:3574-3580` |
| `/admin/stats` `STAT-*` | 화면 숫자는 억제하지 않음. CSV에만 k<5 억제+3중 설명. 환자 명단은 masked, row click으로 상세 이동. drilldown/CSV만 감사. 앱·직원·챗봇 source를 별도 집계. | source 3분류·masked DTO·CSV guard·patient 없는 감사행 API가 차단. `screen-behaviors.md:2215-2291`; `staff-web.md:3248-3715` |
| `/messages` `MSGX-*` | 직접/예약 발송, 5분 단위·KST·최대 8주(예약 가능 범위와 동기화), pending 취소, 2회 자동 재시도 후 실패자만 수동 재시도. | 화면·API·예약 큐·provider callback을 새로 플랜화. `screen-behaviors.md:2325-2351`; 결정로그 `:3149`, `:3156-3157`, `:3517-3560` |
| `/admin/settings` `HSETX-*` | 자동 알림 정책·채널·토큰은 알림 메뉴, `/messages`는 환자 대상 직접 발송. SMS 초기 ON이지만 provider 미연결 시 `문자 미설정`. 항목별 최근 변경과 access-log link. | 기존 `/admin/settings`와 옛 `HOURS-EXC-*`가 혼재. 알림 API/감사·비밀 경계는 코2 일정과 함께 재작성. `screen-behaviors.md:1302-1350`, `:2352-2393` |
| 환자 지원 문의 | 환자 상세에 지원 문의 section과 일반 `/today` `확인 필요 상담 문의` 카드가 있다. 취소·변경 상담은 별도 취소 수치 카드가 아니라 기존 `확인 필요한 예약` 카드의 행으로 연결하고, 취소 요청함은 없다. | 상담봇 티켓과 `support_requested_at`의 단일화 필요. `screen-behaviors.md:1604-1612`, `:5421-5427`; `HANDOFF.md:115`, `:253-259`(당시 상태) |

### 3-1. 회의 확정 33건의 원문→스펙/플랜 target

아래 표는 late decision log의 33건을 빠뜨리지 않고, 각 결정을 심을 화면 규칙과 구현계획 위치를 지정한 것이다. `결정로그:3115-3190`은 원문 묶음이며, 각 행의 뒤쪽은 새로 추가하거나 다시 쓸 target이다. 직원 웹 스펙 파일 target은 아래의 “직원 웹 스펙 절 target” 표에서 결정군별로 보완한다.

| 결정 | 확정 내용 | 화면 규칙 target | 플랜/API target |
|---|---|---|---|
| #1 | 환자 상세는 헤더 요약+2열+anchor | `screen-behaviors.md:1537-1584`; `staff-web-design.md:69-75` | `staff-web.md:2635-2881` |
| #2 | 접수직원은 문진 내용 불가, 안내만 | `screen-behaviors.md:1585-1594` | `staff-web.md:3716-4735`, `:2635-2881`의 patient-detail loader/guard |
| #14(권한) | admin은 문진 템플릿만, 답변 비열람; DB RLS도 차단 | `screen-behaviors.md:1585-1594`, `:1988-2063` | 새 migration `00010` + `staff-web.md:8768-9260` |
| #25 | 이메일+비밀번호, 관리자 초대 | 직원 인증 절 추가; `screen-behaviors.md:2292-2351` | `staff-web.md:841-1210` |
| #26 | 자기 이메일 셀프 비밀번호 복구 | 직원 인증 절의 reset/error/session 표 | `staff-web.md:841-1210`에 reset route·token·audit 추가 |
| #27 | 무활동 30분, 절대 30분 아님 | `screen-behaviors.md:1816-1825`, `:2292-2351` | `staff-web.md:841-1210` 및 doctor autosave `:2883-3247` |
| #4 | 새 전화번호 OTP 포함 인라인 변경 | `screen-behaviors.md:1624-1630` | `staff-web.md:2635-2881`에 OTP/Auth/history API |
| #21 | 화면 숫자 그대로, CSV만 k<5 억제 | `screen-behaviors.md:2215-2291` | `staff-web.md:3248-3715`의 export/guard |
| #24 | 통계 명단 masked, row click 상세·상세만 감사 | `screen-behaviors.md:2258-2291` | `staff-web.md:3248-3715`, `:5117-5399` |
| #23 | app/staff/chatbot 유입을 별도 집계 | `screen-behaviors.md:2215-2291`의 `STAT-METRIC-05` | `staff-web.md:3248-3715` + source 집계 API |
| #20 | 오류 안전 요약+redacted 기술 상세 | `screen-behaviors.md:2149-2214` | 신규 `/admin/errors` Task, 기존 `staff-web.md:7127-7628` 뒤 |
| #15 | 병합 원본 보존+계보 연결 | `screen-behaviors.md:2064-2148`, `:2444-2518` | `staff-web.md:8262-8672`를 lineage migration/API로 재작성 |
| #16 | 병합 이력에서 관리자 가드부 되돌림 | `screen-behaviors.md:2444-2518` | `staff-web.md:8262-8672`에 history/undo Task 추가 |
| #18 | 병합 3단계+읽음 체크 | `screen-behaviors.md:2064-2148` | `staff-web.md:8262-8672` |
| #8 | 완료 기록은 의사만 이유 필수 수정, before/after | `screen-behaviors.md:1717-1836` | `staff-web.md:2883-3247`에 revision API |
| #3 | 직원이 가족 연결·해제, 3층 본인확인·통보 | `screen-behaviors.md:1562-1570` | `staff-web.md:8262-8279`의 link API와 `:2635-2881` UI/감사 |
| #11 | 검색·번호 보기·대량 열람 모두 감사 | `screen-behaviors.md:1906-1987` | `staff-web.md:5117-5399`의 ALOG API 확장 |
| #17 | 병합/되돌림은 별도 감사 사건 | `screen-behaviors.md:2109-2122`, `:2444-2518` | merge API와 access-log migration |
| #22 | 통계 drilldown/CSV만 감사 | `screen-behaviors.md:2258-2291` | `staff-web.md:3248-3715`, ALOG 확장 |
| #29 | pending 예약 발송만 취소, log에 cancelled | `screen-behaviors.md:2325-2351` | 신규 messages queue Task |
| #33 | 설정 항목별 최근 변경+더 보기 access-log | `screen-behaviors.md:2352-2393` | 신규 settings audit API; 코2 설정 Task와 정합화 |
| #14(보존) | 감사 발자국 2년+, 진료/문진 10년, 자동 삭제 없음. 임시 번호와 법률 재검토 gate는 별도 조건으로 남긴다. | 공통 보존·감사 규칙에 추가; `screen-behaviors.md:1906-1987` | migration/retention job은 새 공통 Task, 직원 화면에는 삭제 버튼 없음 |
| #10 | 의사 비활성화는 자동 취소/재배정 없이 확인 필요 큐 | `screen-behaviors.md:1872-1905` | `staff-web.md:7629-7960`에 영향예약 dry-run·queue API |
| #28 | 직접 발송 5분 단위·예약 범위·KST | `screen-behaviors.md:2325-2351` | 신규 messages API/queue |
| #30 | 2회 자동 재시도 후 실패자만 제한적 재시도. 병원 비용 정책에 따라 B안으로 되돌릴 수 있다는 조건을 보존한다. | `screen-behaviors.md:2325-2351` | 신규 retry API/비용 확인/중복 방지 |
| #32 | 취소 0~168시간, 오래 대기 1~180분·끄기는 별도 체크 | `screen-behaviors.md:2352-2393` | settings validation/preview API |
| #19 | 수신자별 실패는 notification log, 서비스 장애는 system error | `screen-behaviors.md:2149-2214`, `:2325-2351` | `00010`/provider callback/new errors API |
| #31 | SMS 초기 ON, provider 미연결은 `문자 미설정` | `screen-behaviors.md:2352-2393` | settings/message provider boundary |
| #12 | 문진 저장 즉시 불변 버전 활성, 과거 read-only | `screen-behaviors.md:1988-2063` | `staff-web.md:8768-9260` + version migration |
| #13 | 과거 문진 버전은 같은 화면 read-only preview | `screen-behaviors.md:1988-2063` | `staff-web.md:8768-9260` |
| #7 | 문구는 커서가 있는 입력칸에 삽입 | `screen-behaviors.md:1717-1836`의 `DOCTOR-RECORD-03` | `staff-web.md:2883-3247` |
| #9 | 기본 `/doctor/console`, 예약 shortcut은 `/:appointmentId` | `screen-behaviors.md:1717-1836` | `staff-web.md:7127-7628` route assembly |
| #5·#6 | checkin 결과 카드·도착 처리·화면 유지·자동저장 | `screen-behaviors.md:1654-1716` | `staff-web.md:7962-8260` |

### 3-1-a. 직원 웹 스펙 절 target 보완

`screen-behaviors.md`는 동작 규칙 target이고, 아래 표가 실제 `docs/superpowers/specs/2026-07-27-staff-web-design.md` 재작성 target이다. 기존 절이 없으면 `대상 미확인`을 숨기지 않고 신규 절 삽입 위치를 표시한다.

| 결정군 | 직원 웹 스펙 target | 처리 |
|---|---|---|
| #1·#2·#3·#4·#14(권한)·#19 | `staff-web-design.md:69-75` 섹션 5 | 기존 탭 설명을 헤더/2열/권한/편집/가족/지원 문의 계약으로 재작성 |
| #25·#26·#27·#79 | `staff-web-design.md:22-28` 뒤, 직원 로그인 신규 절 | 기존 스펙에 로그인·복구·세션 화면 절이 없어 `대상 미확인`; 신규 절 추가 |
| #5·#6 | `staff-web-design.md:22-28` 뒤, `/checkin` 신규 절 | 기존 route list에 checkin만 없고 전용 절도 없어 `대상 미확인` |
| #7·#8·#9·#30 | `staff-web-design.md:77-85` 섹션 6 | 의사 화면의 과거 조회·문구·revision·autosave/session으로 재작성 |
| #10·#7(프로필)·#83 | `staff-web-design.md:22-28` 뒤, `/admin/staff` 신규 절 | 기존 route list에는 있으나 전용 스펙 절이 없어 `대상 미확인`; `SB-48` 영향 예약 포함 |
| #11·#17·#33·#14(보존) | `staff-web-design.md:22-28` 뒤, `/admin/access-logs`·감사 공통 절 | 기존 접근로그 전용 절이 없어 `대상 미확인`; 병합·검색·번호 reveal·관리자 활동을 추가 |
| #12·#13·#14(권한)·#17(성별) | `staff-web-design.md:22-28` 뒤, `/admin/questionnaires` 신규 절 | 기존 문진 관리 절이 없어 `대상 미확인`; 답변 비열람과 불변 버전 포함 |
| #15·#16·#18·#34 | `staff-web-design.md:22-28` 뒤, 병합 후보·`/admin/merge-history` 신규 절 | 기존 병합 절이 없어 `대상 미확인`; 후보와 이력/되돌림을 분리 |
| #20·#124 | `staff-web-design.md:99-104` 섹션 9 + `/admin/errors` 신규 절 | 섹션 9의 프론트 오류 일반론을 오류 화면 계약으로 확장하고 신규 화면 절 추가 |
| #21·#22·#23·#24 | `staff-web-design.md:93-97` 섹션 8 | 통계 화면의 old raw list/CSV 문장을 masked·source 3분류·감사 범위로 재작성 |
| #28·#29·#30·#31·#99~#126·AD-067·068 | `staff-web-design.md:22-28` 뒤, `/messages`·`/admin/settings` 신규 절 | 기존 메시지/설정 절이 없어 `대상 미확인`; 신규 route·알림 정책·provider boundary 추가 |
| #32 | `staff-web-design.md:22-28` 뒤, settings validation 절 | 기존 설정 절이 없어 `대상 미확인`; 취소/오래대기 범위와 preview 추가 |
| #6·#113 | `staff-web-design.md:106-117` 섹션 10 | **폐기 target**. old 승인/반려 대기열을 삭제하고 공통 support 흐름으로 대체 |

> 이 표의 결정군은 33건 표의 모든 행을 덮는다. AD-050~071은 위 결정군에 연결해 새 화면 절·migration/API target을 함께 갱신한다.

### 3-2. AD-050~071 target

| 결정 | 내용 | 화면/규칙 target | 플랜·구현 target |
|---|---|---|---|
| AD-050 | admin 문진 답변 DB 차단 | `screen-behaviors.md:1585-1594` | migration `00010`; `staff-web.md:8768-9260` |
| AD-051 | 예약 자동확정 기본값 true | `screen-behaviors.md:1302-1350`의 `HSET-BOOK-05` | 코2 settings plan |
| AD-052 (교차 참조) | 자동 재시도 소진 후 수동 재발송의 비용·실패 수신자 가드. 병원 비용 정책에 따른 B안 회귀 조건을 보존한다. | `screen-behaviors.md:2325-2351`; 결정로그 `:3157` | 신규 `/messages` retry API와 provider 상태 계약 |
| AD-055 (교차 참조) | 직원 세션은 무활동 30분 기준 | `screen-behaviors.md:1816-1825`, `:2292-2351` | `staff-web.md:841-1210`의 interaction timer/session contract |
| AD-059 (교차 참조) | 가족 연결 본인확인은 번호 유무에 따라 OTP/예외로 자동 분기 | `screen-behaviors.md:1562-1570` | `staff-web.md:2635-2881`, `:8262-8279`의 family verification API |
| AD-062 | 의사 콘솔 열 min/max/default | `screen-behaviors.md:1717-1836`의 `DOCTOR-SHELL-04~05` | `staff-web.md:2883-3247` |
| AD-063 | 기존 `patient_internal_notes`, 의사 작성·직원 patient detail 열람 | `screen-behaviors.md:1614-1623`, `:1717-1836` | `staff-web.md:2635-2881`, `:2883-3247` |
| AD-064 | phrase chip·hover preview·커서 삽입·같은 콘솔 관리 | `screen-behaviors.md:1717-1836` | `staff-web.md:2883-3247` |
| AD-065 | 문진 버전 삭제/숨김 없음 | `screen-behaviors.md:1988-2063` | `staff-web.md:8768-9260` |
| AD-066 | 버전은 번호·저장시각·저장자, 이름 없음 | `screen-behaviors.md:1988-2063` | version schema/API in Task 22 rewrite |
| AD-067 | 이름·날짜·시각 token은 발송 시 치환 | `screen-behaviors.md:2352-2393` | message/settings API; `staff-web.md:7629-7960` 뒤 신규 Task |
| AD-068 | 자동 알림은 settings, 직접 발송은 `/messages`, secret boundary | `screen-behaviors.md:2352-2393` | settings/message provider tasks; 코2와 공동 |
| AD-069 | 진료 단독+업무/기록/설정/상담봇 **4그룹 sidebar**. 결정로그의 초기 3그룹 표현은 후속 `MR2-07`에서 **4그룹 최종 정본으로 교체**됐다. “15화면”은 과거 병합 묶음명이며 현재 직원 웹 route 정본은 18개다. | `screen-behaviors.md:77-100` 및 역할별 `:104-123`; 결정로그 `:3187`, `:5086` | `staff-web.md:7127-7628` route assembly; 상담봇 그룹은 코5와 공동 |
| AD-070 | 80b 가독성 토큰·240px shell·1440/1280 폭 | `docs/design/mockups/README.md:73`, `:114-127`; `docs/design/mockups/80b-admin-access-logs-readability.html`, `62b-staff-queue-readability.html` | 공통 CSS/token Task, 76~85b 전체 대조 |
| AD-071 | AD-062~068 작업본 반영됐으나 API/DB는 blocked. 화면 규칙은 반영됐지만 구현 정합화는 끝나지 않았다. | 각 해당 screen section; 결정로그 `:3189` | 구현 전 migration/API blocker를 task gate로 유지 |

## 4. 결정로그에 남아 있는 직원 영역 미체크 항목

아래는 원문에 실제로 남아 있는 `- [ ]` 중 직원 웹과 직접 연관되거나 코3 화면이 소비하는 항목이다. 체크박스를 기계적으로 지우지 말고, 해당 target을 수정·검증한 뒤에만 완료 처리한다.

| 원문 항목 | 결정로그 줄 (`docs/superpowers/specs/2026-07-31-ui-design-decisions.md`) | 의미/소유 |
|---|---:|---|
| #6 공통 취소·변경 요청 구조 | `결정로그:3214` | 코1·코5와 함께 `support_requested_at`/`request_type` migration |
| #2 가족 연결 | `:3224-3231` | 코3 patient detail UI·해제·관계 수정·본인확인 |
| #7 의사 프로필 | `:3254-3260` | `/admin/staff`, 코2 calendar 전달 |
| #17 문진 성별 조건 | `:3303-3310` | QADM schema와 앱 조건 |
| #19 환자 기본정보 edit | `:3317-3324` | patient detail + OTP/Auth |
| #21 오래 대기/추정 시간 | `:3332-3340` | 코2 계산, 직원 walk-in 표시만 |
| #28 no-show 생성 경로 | `:3391-3398` | 직원 상태 액션, 코2 queue 연계 |
| #30 작성 중 logout | `:3404-3409` | doctor autosave/session |
| #31 공통 export | `:3410-3414` | 코2 원본, stats CSV 계약 |
| #32 settings/운영시간 | `:3415-3425` | `/admin/settings`는 코3, hours는 코2 |
| #34 merge undo | `:3433-3438` | merge-history/lineage |
| #35 phone reveal endpoint | `:3440-3444` | patient detail·ALOG |
| #36 잘못된 `진료중` 되돌림 | `:3446-3450` | doctor/state API |
| #37 자정 미마감 환자 | `:3452-3457` | `/today` 카드, 코2 |
| #79 로그인/로그아웃 | `:3869-3875` | staff auth |
| #80 검색 감사/부분 검색 | `:3853-3859` | patient search·ALOG |
| #82 역방향 상태 전이 | `:3836-3842` | doctor/checkin/queue |
| #83 의사 색상 | `:3824-3830` | admin staff→calendar |
| #87 다음 진료 가능시각 | `:3794-3800` | checkin/walk-in, 코2 |
| #88·#89·#90·#91 | `:3650-3659`, `:3774-3793` | schedule/today, 코2 |
| #92·#93·#94·#95·#96·#97·#98 | `:3726-3773` | schedule/settings, 코2와 공동 |
| #99 첫 안내문구 | `:3721-3725` | messages |
| #100 dead push token | `:3693-3698` | messages+코1/코4 |
| #101 공지 발송 위치 | `:3669-3675` | messages/settings |
| #103 SMS 자동 알림 선택 | `:3687-3691` | settings/messages |
| #112 `/messages` first door | `:3517-3523` | 새 route/API |
| #113 취소요청함 목록 누락 | `:3635-3639`, `:4796-4801` | 목록 누락과 #25 폐기 지시를 함께 명시 |
| #114 role inclusion | `:3627-3633` | 모든 새 route/API |
| #115 발신자 누락 | `:3615-3621` | notification log |
| #117 sending list audit mismatch | `:3582-3588` | messages/ALOG |
| #118 scheduled send table | `:3597-3603` | messages queue |
| #119 notification result fields | `:3547-3552` | per-recipient log |
| #120 channel hardcoded push | `:3562-3566` | channel abstraction |
| #121 failed notification resend | `:3540-3545` | retry/cost/duplicate guard |
| #122 Twilio callback | `:3554-3560` | provider integration |
| #123 dead SMS patient fields | `:3568-3572` | patient detail/message boundary |
| #124 `/admin/errors` ghost | `:3574-3580` | 새 관리자 화면 |
| #125 notification date/time | `:3532-3538` | token replacement |
| #126 notification override table | `:3525-3530` | settings/messages |

## 5. 폐기·대체해야 할 결정

| 폐기 대상 | 폐기 근거 | 대체본 |
|---|---|---|
| `/cancellation-requests` 전용 대기열과 승인/반려 | 사용자 결정 #25가 중복 티켓·대기열을 이유로 폐기. `결정로그:4228-4255`; 정리 절차 `:4935` | `support_requested_at`+`request_type`, `/today`의 확인 필요 행·캘린더 경고·상담 문의함. `screen-behaviors.md:5424-5427` |
| `appointments.cancellation_requested_at` 단독 필드 | 취소와 변경을 두 로직으로 나누고 희망 일시를 확정처럼 보이게 한다. `결정로그:4189-4197` | 공통 `support_requested_at`+`request_type`; 희망 일시는 저장하지 않음 |
| old Task 16의 route/API/link/menu | `staff-web.md:5403-6174`, `:7528`, `:9088`이 폐기 화면을 구현하도록 되어 있음 | Task 16 삭제 후 today/calendar/support 계약으로 재작성 |
| admin이 문진 답변을 읽는 예외 | `00007`의 `private.is_admin()` 예외를 AD-050이 제거. `결정로그:3121`, `:3178` | admin은 템플릿·버전만 관리, 답변은 담당 의사만 |
| 직원 세션 absolute `jwt_expiry=1800` | #27/AD-055가 “사용 중이면 유지”로 뒤집음. `결정로그:3115-3130` | 프론트 상호작용 기준 무활동 30분 |
| 의사 비활성화 시 자동 취소/재배정 | #10이 환자 동의 없는 담당의 변경을 거부. `결정로그:3155-3158` | `needs_rescheduling` 확인 필요 큐, 접수직원 건별 처리 |
| 병합 즉시 undo 또는 물리 overwrite | #15·#16·#34가 원본 보존·별도 이력·관리자 가드부로 확정. `결정로그:3136-3137`, `:3433-3438` | lineage + `/admin/merge-history` + 사유/감사 |
| 완료 진료기록 전면 read-only | 요구사항 3.6이 의사 수정과 이유를 요구해 worker 추천을 기각. `결정로그:3139`; `staff-web-design.md:77-85` | 의사만 이유 필수 revision, 일반 직원은 읽기 |
| 기존 ALOG의 “patient_detail/medical_record만” 사건 모델 | #11·#17·#22가 검색/phone reveal/bulk/merge/stats 사건을 확장. `screen-behaviors.md:1906-1987`, `:2258-2291` | resource type·patient 없는 관리자 활동·대량 fold UI를 별도 정의 |
| old `/admin/settings` 운영시간 예외 모델 | 운영시간은 `/admin/schedule`로 이동하고 옛 `HOURS-EXC-*`/`hospital_hour_exceptions`는 코2 정리 대상. 결정로그 `:3415-3425` | 코3는 알림·보안·감사 설정, 코2는 일정/휴일 |
| 오류 원문 단일 `message` 노출 | #20과 요구사항 6.4가 개발 정보·PII 노출을 금지. `결정로그:3132` | safe summary + redacted detail, 개발자 원문은 운영 로그 |
| 취소 팝업을 열기만 해도 요청 기록 | 상담 연결 버튼이 유일한 기록 지점. `결정로그:4255-4262`; `screen-behaviors.md:3786-3791` | `[상담 채팅 연결]` 클릭 시에만 공통 필드 기록 |

## 6. 핵심 링크와 재작성 순서

### 정본 링크

- 사용자 결정·기각·폐기: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3109-3190`, `:3210-3457`, `:3517-3869`, `:4189-4275`, `:4796-4868`
- 직원 화면 동작 규칙: `docs/design/screen-behaviors.md:77-123`, `:1537-2518`, `:2325-2518`, `:5421-5427`
- 기존 직원 스펙: `docs/superpowers/specs/2026-07-27-staff-web-design.md:22-129`
- 기존 구현 플랜: `docs/superpowers/plans/2026-07-27-staff-web.md:841-1210`, `:2635-3715`, `:5117-6174`, `:7629-9260`
- 요구사항 역할·환자 상세·진료·감사: `docs/고객요구사항.txt:75-82`, `:136-170`, `:202-226`, `:420-453`
- 현재 상태·화면 수·우선순위: `HANDOFF.md:115`, `:139-144`, `:224-259`, `:285-304`

### 재작성 순서

1. **소유권과 수를 먼저 고정한다.** 브리프의 15화면과 핸드오프의 16화면은 과거 작업명으로 남기고, 현재 B안의 18개 활성 route 표를 정본으로 사용한다. `/cancellation-requests`를 삭제 목록에 올리고, `/messages`, `/admin/errors`, `/admin/staff`를 실제 신규/보강 화면으로 분류한다. 상담봇 운영 화면은 이 파일 §7에서 별도 범위로 취합한다.
2. **DB·API·상태 전이를 먼저 정리한다.** `00010`에 공통 상담 필드·문진 RLS·감사 사건·전화 reveal·병합 계보·알림 로그/예약 큐를 넣고, `SB-48` 영향 예약과 doctor 역전이 계약을 확정한다.
3. **동작명세를 화면별로 다시 쓴다.** 위 `PTDET-*`, `CHKIN-*`, `DOCTOR-*`, `STAFF-*`, `ALOG-*`, `QADM-*`, `MERGE-*`, `MHIST-*`, `ERRADM-*`, `STAT-*`, `MSGX-*`, `HSETX-*`의 target에 결정과 role guard를 심는다. support 문의는 코5와 한 데이터 흐름으로 대조한다.
4. **기존 플랜은 patch가 아니라 재작성한다.** 특히 Task 10·11·15·19·20·21·22를 갭 표와 1:1로 갱신하고, old Task 16은 삭제/대체한다. 신규 `/messages`·`/admin/errors`·`/admin/merge-history`·인증 reset Task를 route assembly와 함께 추가한다. 결정로그의 반영 절차도 “플랜 재작성”을 요구한다. `결정로그:4839-4868`.
5. **⑦ 플랜 대조를 별도 게이트로 남긴다.** 병합된 15화면에는 아직 ⑦ 대조 표식이 확인되지 않았다. `HANDOFF.md:139-144`대로 각 화면의 결정→규칙→스펙→플랜 target을 다시 대조하고, 추측으로 완료 체크하지 않는다.
6. **구현 전 기계 검사를 한다.** 새 route마다 role/API/DB policy가 있는지, 모든 `PTDET`·`DOCTOR`·`MSGX`·`ERRADM`·`MHIST` rule ID가 한 번만 정본에 있는지, 폐기된 `/cancellation-requests` 문자열과 old `cancellation_requested_at`이 남지 않는지, 의도된 미체크 항목만 남는지 검사한다.

## 7. 상담봇 직원·관리자 통합 범위

이 절은 별도 코5 색인의 내용을 이 파일에 합친 것이다. 상담봇 앱·웹의 환자 노출 UX는 코4 영역이지만, 직원·관리자 운영 화면과 공통 직원 route에 나타나는 상담 상태는 이 통합 색인에서 함께 취합한다.

### 7.1 직원 상담관리 화면·공통 확장

| 구분 | 화면 또는 확장 | route 산입 | 현재 처리 |
|---|---|---:|---|
| 직원 | 문의 티켓함 | 별도 운영 화면 | 3탭·접수순·Realtime·빈/로딩/오류 상태. 상세 진입 시 원자 자동 배정. |
| 직원 | 티켓 상세 | 별도 운영 화면 | 인계 요약 5항목→전체 대화→답변 보내기→별도 상담 종료. 보내기 성공은 `in_progress`, 종료만 `answered`. |
| 직원 | 전체 상담 기록 | 별도 운영 화면 | 앱·웹 대화 통합 조회, 채널·갈래 필터, 근거 자료와 조회 실패 상태. |
| 직원 | 오답 신고 작성 | 별도 운영 화면 | 잘못된 답변·올바른 안내·예시 저장 여부를 기록하고 관리자 품질 흐름으로 보낸다. |
| 공통 | 환자 상세 상담 문의 섹션 | 기존 `/patients/:id` 확장 | 현재 환자의 질문·안내·인계 이유·티켓 상태를 표시한다. |
| 공통 | 오늘 현황 상담 카드 | 기존 `/today` 확장 | 실제 pending 티켓 수를 표시하고 문의함으로 이동한다. HANDOFF의 `0` 하드코딩은 과거 상태다. |
| 공통 | 캘린더 상담 경고 | 기존 `/calendar` 확장 | 마감 후 취소·변경 상담을 기존 예약 처리 면으로 연결한다. 별도 취소 요청 화면은 만들지 않는다. |
| 공통 | 예약 상세 사이드패널 상담 상태 | 기존 `/calendar` 패널 확장 | 같은 ticket·appointment context를 유지하며 닫기와 처리 완료를 구분한다. |

### 7.2 관리자 운영 화면

| 구분 | 화면 | 현재 처리 |
|---|---|---|
| 관리자 | 안내자료 목록 | 승인 자료의 분류·상태·0건·로딩·오류를 관리한다. |
| 관리자 | 안내자료 작성·수정·승인 | draft는 비공개, 승인·재임베딩 성공 전 기존 승인본을 유지한다. 제한 문구는 생성문과 분리한다. |
| 관리자 | 안내자료 수정이력 | 이전 승인본을 시간 역순으로 조회하고 재승인 흐름으로 연결한다. |
| 관리자 | 미해결 질문 | 유사도 묶음과 자동 묶음의 한계를 표시한다. 0건과 계약 부재를 구분한다. |
| 관리자 | 오답 신고 처리함 | `quality_review` 출처를 반영·반려하고 KB 승인으로 연결한다. |
| 관리자 | 상담 품질 리포트 | 신고 유무와 무관하게 미검토 우선으로 검토하며 B3 우측 상세 패널을 쓴다. |
| 관리자 | 참고 예시 관리 | 교정 질문·답변 예시를 조회하고 비활성화한다. |
| 관리자 | 전체 질문 순위 | 별도 최상위 메뉴가 아니라 상담봇 처리 현황 dashboard의 섹션으로 흡수한다(MR2-06). |
| 관리자 | 상담봇 처리 현황 | 앱·직원·챗봇 유입원과 상담봇 지표를 분리한다. 계약 부재를 `0건`으로 위장하지 않는다. |
| 관리자 | 운영시간·특정일 변경 | 목업 118과 상담봇 전용 편집은 폐기한다(MR2-05). 원본은 직원 웹 `/admin/schedule`이고 상담봇은 읽기만 한다. |

### 7.3 상담봇 운영의 최신 흡수·폐기 결정

| 결정 | 최종 처리 |
|---|---|
| `MR2-05` | 목업 118의 상담봇 운영시간 편집을 폐기하고 직원 웹 스케줄을 단일 원본으로 사용한다. |
| `MR2-06` | 목업 116의 전체 질문 순위를 목업 117 상담봇 처리 현황에 흡수한다. |
| `MR2-07` | AD-069의 초기 3그룹 표현을 교체하고 `업무·기록·설정·상담봇` 4그룹을 최종 sidebar로 확정한다. |
| `MR2-09` | 티켓 상세에서 답변 보내기와 상담 종료를 분리한다. |
| `MR2-10` | 목업 109를 별도 화면으로 만들지 않고 캘린더 64/65의 `SUPPORT-CAL-*` 상태로 흡수한다. |

### 7.4 상담봇 영역 기능 갭

| 갭 | 현재 상태 | 미결·다음 작업 |
|---|---|---|
| G-01 오늘·캘린더·티켓 연결 | 화면 규칙에는 반영 | `support_tickets.appointment_id`, `/today` 조회, 양방향 context 복원 migration/API가 필요하다. |
| G-02 마감 후 취소·변경 공통 데이터 | `support_requested_at + request_type`으로 정책 확정 | migration·RLS·원자 상태 전이가 미완료다. |
| G-03 3-A 통합 스키마 | 결정로그에 구조 공백 7건 기록 | 카드 payload, 근거 snapshot, 시스템 이벤트, 티켓 FK, 품질 검토, 보존 정책을 실제 schema로 내려야 한다. |
| G-04 티켓 lifecycle | 최신 화면 규칙은 확정 | `claim_ticket`·`send_message`·`close_ticket`의 API/DB 계약과 경쟁 패자 응답을 재작성해야 한다. |
| G-05 품질·미해결 상태 | 화면 규칙에 상태가 있음 | 플랜·API·테스트에 loading/empty/error/retry와 contract-absent를 반영해야 한다. |
| G-06 KB 승인·제한 문구 | 정책·문구는 확정 | 승인 transaction·재임베딩·제한 응답의 실제 migration/RLS/API target이 없다. |
| G-07 sidebar·흡수 결정 | 4그룹·116/109/118 처리는 확정 | 옛 메뉴·목업·플랜 route를 실제 파일에서 정리해야 한다. |

## 8. 통합 미결·차단 ledger

아래 항목은 **미결 사항**이다. 확정된 정책과 섞지 않고, 다른 터미널이 취합할 때 반드시 남겨야 한다.

### 8.1 정책·해석 미결

| ID | 미결 내용 | 현재 판단 | 근거·다음 확인 |
|---|---|---|---|
| P-01 | 의사 콘솔 자동저장 간격·만료 배너·세션 이탈 복구·과거 날짜 정책 | 화면 규칙에 일부만 있고 완전한 정책 아님 | `screen-behaviors.md:1717-1836`; 결정로그 `:3404-3409` |
| P-02 | 자동 알림 실패 후 재시도와 병원 비용 정책 | 자동 2회 후 실패 수신자 수동 재시도는 기록됐지만 B안 복귀 가능성 있음 | 결정로그 `:3517-3615`, `:3693-3725` |
| P-03 | `/today` 일반 pending 상담 count와 취소·변경 행의 문구 정합 | 최신 화면 규칙과 HANDOFF 표현이 완전히 합쳐지지 않음 | `HANDOFF.md:253-259`; `screen-behaviors.md:5421-5427` |
| P-04 | 3-A 보존 정책에서 읽음 상태를 별도 보존 클래스로 볼지 | 데이터군 보존은 기록됐지만 읽음 상태의 원문 근거가 부족함 | 결정로그 `:4278-4294` |
| P-05 | AD-052~054, AD-056~058, AD-060~061의 개별 원문·담당 경계 | 현재 결정로그 요약만으로는 확정하지 않음 | 결정로그 `:3174-3189`; 후속 원문 대조 필요 |

### 8.2 구현 차단·실제 target 미확인

| ID | 차단 내용 | 상태 |
|---|---|---|
| B-01 | 문진 답변 RLS에서 admin 예외 제거, 담당 의사 열람 계약 | `00010`·API·RLS 정합화 전 구현 차단 |
| B-02 | 진료 상태 역전이·자동저장·revision·optimistic lock | API/DB 상태 machine과 화면 계약이 함께 필요 |
| B-03 | 환자 병합 lineage·undo guard·감사 event | migration·API·경쟁 잠금 미완료 |
| B-04 | 알림 queue·provider callback·수신자별 retry/cost/audit | DB/API/플랜 미완료 |
| B-05 | `support_tickets.appointment_id` 및 `appointments.support_requested_at/request_type` | 실제 migration target 미확인 |
| B-06 | 3-A 통합 schema의 migration 파일명·RLS 정책·API route | 결정로그에는 요구사항만 있고 구현 target 없음 |
| B-07 | 품질 검토 상태를 `answer_feedback` 확장으로 둘지 별도 상담 단위 table/enum으로 둘지 | SD-08에서 아직 결정하지 않음 |
| B-08 | KB 승인·재임베딩 transaction의 실제 migration/RLS/API target | 기존 플랜에 구현 파일이 고정되지 않음 |
| B-09 | MR2-08의 실제 메시지·토큰 한도와 요약/절단 방식 | UX 넛지는 있으나 수치·서버 계약 미정 |
| B-10 | 폐기된 `/cancellation-requests`와 old Task 16의 실제 삭제 위치 | 문서·플랜에 여러 잔존 target이 있어 단일 위치 미확인 |

### 8.3 직원 웹 스펙·플랜 target 미확인

다음은 정책이 틀렸다는 뜻이 아니라, 새 결정·규칙을 실제 스펙/플랜 어디에 넣을지 아직 단일 위치가 고정되지 않았다는 뜻이다.

- 로그인·복구·세션 신규 절
- `/checkin` 신규 절
- `/admin/staff` 영향 예약 포함 신규 절
- `/admin/access-logs` 감사 공통 절
- `/admin/questionnaires` 문진 관리 신규 절
- 병합 후보·`/admin/merge-history` 신규 절
- `/messages`·`/admin/settings` 신규 절
- settings validation 절
- `/admin/errors` 신규 절

근거 target은 `docs/superpowers/specs/2026-07-27-staff-web-design.md:22-129`와 기존 구현 플랜의 각 Task이며, 대상이 없는 항목은 임의로 완료 처리하지 않는다.

## 9. 전수 재대조 결과와 기록 상태

대조일은 2026-08-14이다. 이 통합 색인의 직원 웹 표 데이터 185개를 주장 단위로 재대조했고, 별도로 asset roster·정본 링크·재작성 실행안도 확인했다.

| 대조 결과 | 처리 |
|---|---|
| 결정로그 오인용 6건 | 주 색인에서 실제 결정 항목의 줄로 교체 |
| 범위·인용·시점 조건 문제 | 주 색인 문구에 조건과 구현 차단을 반영 |
| D-069 3/4그룹 충돌 | 후속 MR2-07 우선으로 4그룹 최종 확정 |
| 15/16/18 화면 수 혼용 | 15는 historical label, 18은 직원 route 부분집합으로 분리 |
| 상담봇 화면 수 | 별도 route/frame inventory로 기록하되 전체 합계 53은 정본 숫자로 채택하지 않음 |
| 남은 미결 | 이 파일 §8에 정책·구현 차단·target 미확인으로 분리 기록 |

### 전수 대조에서 확인된 행 ID

- 명백한 오인용을 수정한 행: **31, 66, 97, 230, 237, 261**
- 인용 범위·조건·용어·시점 보완이 필요한 행: **22, 54, 65, 71, 73, 76, 82, 83, 95, 98, 100, 108, 110, 111, 113, 116, 119, 121, 150, 153, 191, 201, 203, 215, 231, 273, 275**
- 원문은 맞지만 정책 미결·구현 차단을 함께 표시해야 한 행: **22, 54, 82, 108, 111, 120, 151, 191, 201, 203**
- 원문 주장보다 색인 작성자의 실행안인 마지막 행: **281~286**

행 번호는 대조 당시 색인의 행 ID이며, 위 목록은 결과 분류용이다. 이후 D-069의 3/4그룹 문제는 MR2-07을 적용해 4그룹 최종으로, 15/16/18 화면 수 혼용은 §0과 §2 기준으로 정리했다.

주의: 기존 `AUDIT-SPECINDEX-staffweb-15screens-claim-recheck.md`에는 대조 당시의 baseline 문장과 과거 “3/4 선택 미결” 표현이 남아 있다. 다른 터미널은 그 파일을 단독 정본으로 읽지 말고, 이 파일의 현재 요약과 §8을 사용한다.

## 10. 다른 터미널 인계용 최소 결론

1. 직원 웹 대표 route는 18개지만, 전체 제품 화면 수라는 뜻은 아니다.
2. sidebar는 4그룹이며 이 정책은 미결이 아니다.
3. 상담봇 직원·관리자 운영 화면은 이 파일 §7에 통합돼 있다.
4. 화면 총합 53은 사용하지 않는다.
5. 미결·차단·대상 미확인은 이 파일 §8을 그대로 인계한다.
6. 구현 완료로 표시하기 전에는 §8의 항목을 해소하고 최신 원문과 다시 대조한다.
