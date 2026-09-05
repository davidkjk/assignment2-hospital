# 데모→실 포팅 규칙 대조 지도 (DEMO-PORT-RULE-MAP)

> **무엇**: 「데모 뼈대 + 실 배선」 포팅에서 **화면마다 무엇을 이식해야 하는지**의 실측 지도. 계획 `docs/superpowers/plans/2026-08-27-staff-web-demo-first-merge.md`의 Wave 2 태스크가 이 표를 체크리스트로 소비한다.
> **생성**: 2026-08-27, `screen-behaviors.md`의 규칙ID 전수(3,113개 중 직원웹 1,443개)를 `demo/src/routes/staff/**`·`frontend/src/**` 소스와 대조.

## ⚠️ 이 표가 재는 것과 못 재는 것

- **재는 것**: 각 코드베이스가 규칙ID를 **주석·테스트 이름으로 표기**했는가. 실 frontend는 TDD로 지어 규칙ID를 촘촘히 표기했고(778건), 데모는 사용자 브라우저 검수로 지어 거의 표기하지 않았다(175건).
- **못 재는 것**: **충실도**. 데모가 표기 없이 살려 둔 규칙이 많다(2026-08-28 진단: 「커버리지 ≠ 충실도」). 그래서 **「실만 표기」 = 이식 대상 확정이 아니라 「이식 후보」**다 — 워커는 데모 화면을 먼저 열어 *이미 되어 있는지* 보고, 안 되어 있을 때만 실 코드에서 로직을 가져온다.
- **양쪽 무표기**는 「아무도 안 했다」가 아니라 **「아무도 표기하지 않았다」**다. 시각·인터랙션 규칙이 여기 몰려 있고(데모가 살려둔 쪽), 진짜 미구현도 섞여 있다 → 화면 태스크의 **브라우저 검수 단계에서 눈으로 판정**한다.

## 요약표

| 화면 | 규칙 | 양쪽 표기 | 실만(이식 후보) | 데모만 | 양쪽 무표기 |
|---|---:|---:|---:|---:|---:|
| `셸·공통 (AppShell·Sidebar·Header·패널·마스킹·버튼·되돌리기)` | 238 | 15 | **90** | 20 | 113 |
| `/today` | 90 | 7 | **23** | 1 | 59 |
| `/queue` | 134 | 11 | **28** | 8 | 87 |
| `/calendar` | 146 | 14 | **76** | 4 | 52 |
| `/admin/schedule` | 144 | 1 | **82** | 0 | 61 |
| `/admin/settings` | 91 | 3 | **40** | 2 | 46 |
| `/messages` | 132 | 7 | **38** | 4 | 83 |
| `/patients/:id` | 64 | 3 | **27** | 2 | 32 |
| `/patients` | 56 | 3 | **31** | 1 | 21 |
| `/checkin` | 22 | 1 | **16** | 0 | 5 |
| `/doctor/console` | 65 | 8 | **36** | 2 | 19 |
| `/admin/staff` | 42 | 3 | **37** | 0 | 2 |
| `/login` | 11 | 1 | **4** | 1 | 5 |
| `/admin/access-logs` | 36 | 14 | **16** | 0 | 6 |
| `/admin/questionnaires` | 44 | 0 | **30** | 0 | 14 |
| `/admin/patient-merge-candidates` | 37 | 14 | **20** | 0 | 3 |
| `/admin/merge-history` | 35 | 5 | **30** | 0 | 0 |
| `/admin/errors` | 27 | 8 | **10** | 1 | 8 |
| `/admin/stats` | 29 | 11 | **15** | 0 | 3 |
| **합계** | **1443** | 129 | **649** | 46 | 619 |

---

## 화면별 상세

### `셸·공통 (AppShell·Sidebar·Header·패널·마스킹·버튼·되돌리기)`

- **데모 원본(뼈대)**: `demo/src/routes/staff/StaffShell.tsx · _ui.tsx · doors/*`
- **실 원본(로직 참조)**: `frontend/src/shell/* · components/*`
- 규칙 238건 = 양쪽 표기 15 · 실만 90 · 데모만 20 · 양쪽 무표기 113

**① 이식 후보 — 실 코드에만 표기된 90건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`BTN-BUSY-01` · `BTN-BUSY-02` · `BTN-SCOPE-01` · `BTN-SCOPE-02` · `BTN-STATE-02` · `BTN-STATE-03` · `BTN-TIME-01` · `DISP-COLOR-01` · `EMPTY-ERR-01` · `EMPTY-LAY-01` · `EMPTY-LAY-02` · `EMPTY-OFF-01` · `EMPTY-ZERO-01` · `EMPTY-ZERO-02` · `ERR-MSG-01` · `ERR-POS-01` · `ERR-POS-02` · `ERR-POS-03` · `ERR-RETRY-02` · `ERR-RETRY-03` · `MASK-DETAIL-01` · `MASK-SRV-01` · `MASK-TEL-02` · `NAV-SHELL-03` · `NAV-SHELL-05` · `NAV-SHELL-08` · `NAV-SHELL-08b` · `NAV-SHELL-09` · `NAV-SHELL-10` · `NAV-SHELL-12` · `NAVX-STAFF-01` · `OFFX-STAFF-01` · `OFFX-STAFF-04` · `OFFX-STAFF-05` · `PANEL-LIVE-04` · `PANEL-LIVE-07` · `PANEL-LIVE-08` · `PANEL-USE-01` · `PANEL-USE-03` · `PERIOD-BOX-01` · `PERIOD-BOX-02` · `PERIOD-BOX-03` · `PERIOD-BOX-04` · `PICK-ACT-01` · `PICK-ACT-01b` · `PICK-ACT-01c` · `PICK-ACT-01e` · `PICK-ACT-01f` · `PICK-ACT-02` · `PICK-ACT-03` · `PICK-ALL-01` · `PICK-ALL-02` · `PICK-ALL-03` · `PICK-ALL-04` · `PICK-BTN-01` · `PICK-BTN-02` · `PICK-BTN-03` · `PICK-BTN-04` · `PICK-DROP-01` · `PICK-DROP-02` · `PICK-MIX-01` · `PICK-MIX-03` · `PICK-ONE-01` · `PICK-ONE-02` · `ROLE-ADM-01` · `ROLE-ADM-03` · `ROLE-DOC-01` · `SHELL-DOOR-03` · `SHELL-HDR-01` · `SHELL-HDR-02` · `SHELL-HDR-03` · `SHELL-HDR-04` · `SHELL-HDR-05` · `SHELL-IDLE-01` · `SHELL-IDLE-02` · `SHELL-IDLE-04` · `SHELL-LIVE-01` · `SHELL-LIVE-02` · `SHELL-NAV-04` · `SHELL-NAV-08` · `SHELL-NAV-11` · `SHELL-PW-01` · `SHELL-PW-03` · `SHELL-PW-04` · `SHELL-URL-01` · `UNDO-BTN-02` · `UNDO-CONF-01` · `UNDO-STAT-01` · `UNDO-WHY-01` · `UNDO-WHY-02`

**② 데모만 표기 20건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`DISP-ICON-03` · `MASK-DOB-01` · `MASK-TEL-01` · `MASK-VIEW-01` · `NAV-SHELL-11` · `PANEL-BACK-01` · `PANEL-BACK-02` · `PANEL-FIND-01` · `PANEL-FIND-04` · `PANEL-LIVE-01` · `PANEL-LIVE-02` · `PANEL-WORK-01` · `PANEL-WORK-03` · `ROLE-DOC-02` · `ROLE-READ-01` · `SHELL-ACT-01` · `SHELL-ACT-04` · `UNDO-ORDER-01` · `UNDO-ROLE-01` · `UNDO-SCOPE-01`

**③ 양쪽 무표기 113건** (브라우저 검수에서 눈으로 판정)

`BTN-COOL-01` · `BTN-COOL-02` · `BTN-COOL-03` · `BTN-COOL-04` · `BTN-COOL-05` · `BTN-COOL-06` · `BTN-COOL-07` · `BTN-COOL-08` · `BTN-COOL-09` · `BTN-COOL-10` · `BTN-EXIT-01` · `BTN-EXIT-02` · `BTN-EXIT-03` · `BTN-KILL-01` · `BTN-KILL-02` · `BTN-KILL-03` · `BTN-KILL-04` · `BTN-KILL-05` · `BTN-KILL-06` · `BTN-KILL-07` · `BTN-STATE-01` · `DISP-ATT-01` · `DISP-CARD-01` · `DISP-CARD-02` · `DISP-CARD-03` · `DISP-GRAY-01` · `DISP-GRAY-02` · `DISP-GRAY-03` · `DISP-ICON-01` · `DISP-ICON-02` · `DISP-WARN-01` · `EMPTY-TAB-01` · `EMPTY-TAB-02` · `ERR-FLD-01` · `ERR-FLD-02` · `ERR-FLD-03` · `ERR-FLD-04` · `ERR-FLD-05` · `ERR-GONE-01` · `ERR-GONE-02` · `ERR-GONE-03` · `ERR-KIND-01` · `ERR-MSG-02` · `ERR-RETRY-01` · `ERR-RETRY-04` · `MASK-VIEW-02` · `MASK-VIEW-03` · `NAV-SHELL-01` · `NAV-SHELL-02` · `NAV-SHELL-04` · `NAV-SHELL-06` · `NAV-SHELL-07` · `NAV-SHELL-08c` · `NAV-SHELL-08d` · `NAVX-STAFF-02` · `OFFX-STAFF-02` · `OFFX-STAFF-03` · `PANEL-BACK-03` · `PANEL-FIND-02` · `PANEL-FIND-03` · `PANEL-HOME-02` · `PANEL-HOME-03` · `PERIOD-BOX-05` · `PICK-ACT-01d` · `PICK-ALL-05` · `PICK-ALL-06` · `PICK-MIX-02` · `PICK-MIX-04` · `ROLE-ADM-02` · `ROLE-READ-02` · `ROLE-SEE-01` · `ROLE-SEE-02` · `ROLE-SEE-03` · `ROLE-UNDO-01` · `SHELL-ACT-02` · `SHELL-ACT-05` · `SHELL-DOOR-01` · `SHELL-DOOR-02` · `SHELL-DOOR-04` · `SHELL-DOOR-05` · `SHELL-DOOR-06` · `SHELL-IDLE-03` · `SHELL-LIVE-03` · `SHELL-LIVE-04` · `SHELL-LIVE-05` · `SHELL-ME-01` · `SHELL-ME-02` · `SHELL-NAV-07` · `SHELL-NAV-09` · `SHELL-NAV-10` · `STATEX-ALERT-01` · `STATEX-BUTTON-01` · `STATEX-EMPTY-01` · `STATEX-LIST-01` · `STATEX-SAVE-01` · `UNDO-BTN-01` · `UNDO-IMPL-01` · `UNDO-IMPL-02` · `UNDO-IMPL-03` · `UNDO-IMPL-04` · `UNDO-LOG-01` · `UNDO-ORDER-02` · `UNDO-ROLE-02` · `UNDO-ROLE-03` · `UNDO-ROLE-04` · `UNDO-SCOPE-02` · `UNDO-SCOPE-03` · `UNDO-SCOPE-04` · `UNDO-SHOW-01` · `UNDO-TIME-01` · `UNDO-TIME-02` · `UNDO-TIME-03` · `UNDO-WHY-03`

### `/today`

- **데모 원본(뼈대)**: `today/Today.tsx (363줄)`
- **실 원본(로직 참조)**: `pages/TodayPage.tsx`
- 규칙 90건 = 양쪽 표기 7 · 실만 23 · 데모만 1 · 양쪽 무표기 59

**① 이식 후보 — 실 코드에만 표기된 23건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`NAV-TODAY-06` · `TODAY-BTN-01` · `TODAY-BTN-02` · `TODAY-BTN-05` · `TODAY-DATE-01` · `TODAY-EMPTY-01` · `TODAY-EMPTY-02` · `TODAY-LIVE-01` · `TODAY-NOSHOW-01` · `TODAY-NOSHOW-03` · `TODAY-ORDER-01` · `TODAY-RESCHED-01` · `TODAY-RESCHED-21` · `TODAY-RESCHED-23` · `TODAY-RESCHED-24` · `TODAY-RESCHED-25` · `TODAY-ROW-01` · `TODAY-SUM-02` · `TODAY-SUM-04` · `TODAY-SUM-05` · `TODAY-WAIT-01` · `TODAY-YDAY-01` · `TODAY-YDAY-03`

**② 데모만 표기 1건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`TODAY-RESCHED-04`

**③ 양쪽 무표기 59건** (브라우저 검수에서 눈으로 판정)

`NAV-TODAY-01` · `NAV-TODAY-02` · `NAV-TODAY-03` · `NAV-TODAY-04` · `NAV-TODAY-05` · `NAV-TODAY-07` · `NAV-TODAY-08` · `NAV-TODAY-09` · `NAV-TODAY-10` · `NAV-TODAY-11` · `SUPPORT-TODAY-CANCEL-01` · `SUPPORT-TODAY-CANCEL-02` · `SUPPORT-TODAY-CANCEL-03` · `SUPPORT-TODAY-CHANGE-01` · `SUPPORT-TODAY-COUNT-01` · `SUPPORT-TODAY-COUNT-02` · `SUPPORT-TODAY-EMPTY-01` · `SUPPORT-TODAY-ERR-01` · `SUPPORT-TODAY-EXC-01` · `SUPPORT-TODAY-LIVE-01` · `SUPPORT-TODAY-LIVE-02` · `SUPPORT-TODAY-LIVE-03` · `SUPPORT-TODAY-LOAD-01` · `TODAY-BTN-03` · `TODAY-BTN-04` · `TODAY-LAY-02` · `TODAY-LIVE-02` · `TODAY-LIVE-03` · `TODAY-LIVE-04` · `TODAY-NOSHOW-02` · `TODAY-ORDER-02` · `TODAY-RACE-01` · `TODAY-RACE-02` · `TODAY-RACE-03` · `TODAY-RESCHED-02` · `TODAY-RESCHED-03` · `TODAY-RESCHED-05` · `TODAY-RESCHED-06` · `TODAY-RESCHED-07` · `TODAY-RESCHED-08` · `TODAY-RESCHED-09` · `TODAY-RESCHED-10` · `TODAY-RESCHED-11` · `TODAY-RESCHED-12` · `TODAY-RESCHED-13` · `TODAY-RESCHED-14` · `TODAY-RESCHED-15` · `TODAY-RESCHED-16` · `TODAY-RESCHED-17` · `TODAY-RESCHED-18` · `TODAY-RESCHED-19` · `TODAY-RESCHED-20` · `TODAY-RESCHED-22` · `TODAY-RESCHED-26` · `TODAY-RESCHED-27` · `TODAY-RESCHED-28` · `TODAY-ROW-03` · `TODAY-WAIT-02` · `TODAY-YDAY-02`

### `/queue`

- **데모 원본(뼈대)**: `queue/Queue.tsx (535줄)`
- **실 원본(로직 참조)**: `pages/QueuePage.tsx`
- 규칙 134건 = 양쪽 표기 11 · 실만 28 · 데모만 8 · 양쪽 무표기 87

**① 이식 후보 — 실 코드에만 표기된 28건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`NAV-QUEUE-07` · `QUEUE-ARRIVE-02` · `QUEUE-ARRIVE-03` · `QUEUE-BTN-01` · `QUEUE-BTN-02` · `QUEUE-BTN-04` · `QUEUE-BTN-05` · `QUEUE-BTN-06` · `QUEUE-FILT-03` · `QUEUE-LIVE-02` · `QUEUE-ORDER-06` · `QUEUE-ROW-08` · `QUEUE-ROW-09` · `QUEUE-TAB-07` · `QUEUE-TAB-11` · `QUEUE-URG-01` · `QUEUE-URG-03` · `QUEUE-WALK-01` · `QUEUE-WALK-02` · `QUEUE-WALK-12` · `QUEUE-WALK-14` · `QUEUE-WALK-14b` · `QUEUE-WALK-14c` · `QUEUE-WALK-14d` · `QUEUE-WALK-14e` · `QUEUE-WALK-16` · `QUEUE-WALK-18` · `QUEUE-WALK-22`

**② 데모만 표기 8건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`QUEUE-BTN-09` · `QUEUE-ORDER-04` · `QUEUE-ORDER-10` · `QUEUE-ROW-06` · `QUEUE-TAB-09` · `QUEUE-TAB-10` · `QUEUE-WALK-08` · `QUEUE-WALK-08b`

**③ 양쪽 무표기 87건** (브라우저 검수에서 눈으로 판정)

`NAV-QUEUE-01` · `NAV-QUEUE-02` · `NAV-QUEUE-03` · `NAV-QUEUE-04` · `NAV-QUEUE-05` · `NAV-QUEUE-06` · `NAV-QUEUE-08` · `NAV-QUEUE-09` · `NAV-QUEUE-10` · `NAV-QUEUE-11` · `NAV-QUEUE-12` · `NAV-QUEUE-13` · `QUEUE-ARRIVE-01` · `QUEUE-ARRIVE-04` · `QUEUE-ARRIVE-05` · `QUEUE-ARRIVE-06` · `QUEUE-ARRIVE-07` · `QUEUE-BTN-07` · `QUEUE-EMPTY-01` · `QUEUE-EMPTY-02` · `QUEUE-EMPTY-03` · `QUEUE-EMPTY-04` · `QUEUE-FILT-01` · `QUEUE-FILT-02` · `QUEUE-FILT-04` · `QUEUE-FILT-05` · `QUEUE-FILT-06` · `QUEUE-FILT-07` · `QUEUE-LIVE-01` · `QUEUE-LIVE-03` · `QUEUE-LIVE-04` · `QUEUE-LIVE-05` · `QUEUE-LIVE-06` · `QUEUE-LIVE-07` · `QUEUE-ORDER-02b` · `QUEUE-ORDER-02c` · `QUEUE-ORDER-07` · `QUEUE-ORDER-08` · `QUEUE-ORDER-09` · `QUEUE-ROW-01` · `QUEUE-ROW-02` · `QUEUE-ROW-03` · `QUEUE-ROW-04` · `QUEUE-ROW-05` · `QUEUE-ROW-07` · `QUEUE-ROW-10` · `QUEUE-SAME-02` · `QUEUE-SAME-03` · `QUEUE-SAME-04` · `QUEUE-TAB-02` · `QUEUE-TAB-04` · `QUEUE-TAB-05` · `QUEUE-TAB-08` · `QUEUE-URG-04` · `QUEUE-URG-05` · `QUEUE-URG-06` · `QUEUE-URG-07` · `QUEUE-WALK-02b` · `QUEUE-WALK-02c` · `QUEUE-WALK-02d` · `QUEUE-WALK-02e` · `QUEUE-WALK-03` · `QUEUE-WALK-03b` · `QUEUE-WALK-04` · `QUEUE-WALK-05` · `QUEUE-WALK-05b` · `QUEUE-WALK-05c` · `QUEUE-WALK-06` · `QUEUE-WALK-07` · `QUEUE-WALK-08c` · `QUEUE-WALK-08d` · `QUEUE-WALK-08e` · `QUEUE-WALK-08f` · `QUEUE-WALK-09` · `QUEUE-WALK-10` · `QUEUE-WALK-11` · `QUEUE-WALK-13` · `QUEUE-WALK-15` · `QUEUE-WALK-17` · `QUEUE-WALK-19` · `QUEUE-WALK-20` · `QUEUE-WALK-21` · `QUEUE-WALK-23` · `QUEUE-WALK-24` · `QUEUE-WALK-25` · `QUEUE-WALK-26` · `QUEUE-WALK-27`

### `/calendar`

- **데모 원본(뼈대)**: `calendar/Calendar.tsx (754줄)`
- **실 원본(로직 참조)**: `pages/calendar/* (18파일)`
- 규칙 146건 = 양쪽 표기 14 · 실만 76 · 데모만 4 · 양쪽 무표기 52

**① 이식 후보 — 실 코드에만 표기된 76건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`CAL-BOOK-03` · `CAL-BOOK-08` · `CAL-COLOR-01` · `CAL-COLOR-02` · `CAL-COLOR-04` · `CAL-COLOR-05` · `CAL-COLOR-06` · `CAL-COLOR-07` · `CAL-COLOR-08` · `CAL-COLOR-09` · `CAL-COLOR-10` · `CAL-COLOR-11` · `CAL-DAY-02` · `CAL-DOC-02` · `CAL-DOC-02b` · `CAL-DOC-04` · `CAL-DOC-05` · `CAL-GAP-01` · `CAL-GAP-05` · `CAL-GAP-06` · `CAL-GAP-07` · `CAL-GAP-09` · `CAL-LIVE-01` · `CAL-LIVE-02` · `CAL-LIVE-03` · `CAL-LIVE-04` · `CAL-NAME-01` · `CAL-NAME-02` · `CAL-NAV-01` · `CAL-NAV-03` · `CAL-NAV-04` · `CAL-NAV-05` · `CAL-NAV-06` · `CAL-NAV-07` · `CAL-NAV-08` · `CAL-PANEL-01` · `CAL-PANEL-04` · `CAL-PANEL-06` · `CAL-PAST-01` · `CAL-PAST-02` · `CAL-PAST-03` · `CAL-RACE-01` · `CAL-RACE-02` · `CAL-RACE-03` · `CAL-RACE-06` · `CAL-RACE-07` · `CAL-SLOT-01` · `CAL-SLOT-02` · `CAL-SLOT-04` · `CAL-SLOT-05` · `CAL-SLOT-07` · `CAL-TIME-01` · `CAL-TIME-04` · `CAL-TIME-08` · `CAL-TIME-09` · `CAL-VIEW-01` · `CAL-VIEW-03` · `CAL-VIEW-05` · `CAL-VIEW-06` · `CAL-VIEW-07` · `CAL-VIEW-08` · `CAL-VIEW-09` · `CAL-WEEK-04` · `CAL-WEEK-10` · `CAL-ZOOM-02` · `CAL-ZOOM-03` · `CAL-ZOOM-05` · `CAL-ZOOM-07` · `CAL-ZOOM-08` · `SUPPORT-CAL-ERR-01` · `SUPPORT-CAL-LIVE-01` · `SUPPORT-CAL-LIVE-04` · `SUPPORT-CAL-LOAD-01` · `SUPPORT-CAL-WARN-01` · `SUPPORT-CAL-WARN-02` · `SUPPORT-CAL-WARN-03`

**② 데모만 표기 4건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`CAL-BOOK-04b` · `CAL-SLOT-09` · `CAL-TIME-05` · `CAL-WEEK-03`

**③ 양쪽 무표기 52건** (브라우저 검수에서 눈으로 판정)

`CAL-BAND-01` · `CAL-BAND-03` · `CAL-BOOK-02` · `CAL-BOOK-04c` · `CAL-BOOK-05` · `CAL-BOOK-06` · `CAL-BOOK-07` · `CAL-BOOK-09` · `CAL-COLOR-03` · `CAL-COLOR-13` · `CAL-DAY-01` · `CAL-DAY-03` · `CAL-DOC-03` · `CAL-GAP-02` · `CAL-GAP-03` · `CAL-GAP-04` · `CAL-GAP-08` · `CAL-NAME-03` · `CAL-NAME-04` · `CAL-NAV-02` · `CAL-PANEL-02` · `CAL-PANEL-03` · `CAL-PANEL-05` · `CAL-PANEL-07` · `CAL-PAST-04` · `CAL-PAST-06` · `CAL-PAST-07` · `CAL-PAST-08` · `CAL-RACE-04` · `CAL-RACE-05` · `CAL-RACE-08` · `CAL-SLOT-10` · `CAL-SLOT-11` · `CAL-TIME-06` · `CAL-TIME-07` · `CAL-VIEW-02` · `CAL-VIEW-04` · `CAL-WEEK-01` · `CAL-WEEK-02` · `CAL-WEEK-05` · `CAL-WEEK-06` · `CAL-WEEK-07` · `CAL-WEEK-08` · `CAL-WEEK-09` · `CAL-ZOOM-04` · `SUPPORT-CAL-DUP-01` · `SUPPORT-CAL-EXC-01` · `SUPPORT-CAL-LIVE-02` · `SUPPORT-CAL-LIVE-03` · `SUPPORT-CAL-NOQUEUE-01` · `SUPPORT-CAL-WARN-04` · `SUPPORT-CAL-WARN-05`

### `/admin/schedule`

- **데모 원본(뼈대)**: `admin/config/Schedule.tsx (544줄)`
- **실 원본(로직 참조)**: `pages/admin/schedule/* (16파일)`
- 규칙 144건 = 양쪽 표기 1 · 실만 82 · 데모만 0 · 양쪽 무표기 61

**① 이식 후보 — 실 코드에만 표기된 82건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`SCHED-DEPT-01` · `SCHED-DEPT-02` · `SCHED-DEPT-03` · `SCHED-DEPT-05` · `SCHED-DEPT-07` · `SCHED-DEPT-08` · `SCHED-DEPT-11` · `SCHED-DEPT-12` · `SCHED-EXC-01` · `SCHED-EXC-02` · `SCHED-EXC-03` · `SCHED-EXC-04` · `SCHED-EXC-05` · `SCHED-EXC-06` · `SCHED-EXC-08` · `SCHED-EXC-08b` · `SCHED-EXC-09` · `SCHED-EXC-11` · `SCHED-EXC-12` · `SCHED-EXC-13` · `SCHED-EXC-14` · `SCHED-EXC-15` · `SCHED-GRID-01` · `SCHED-GRID-02` · `SCHED-GRID-03` · `SCHED-GRID-04` · `SCHED-GRID-05` · `SCHED-GRID-06` · `SCHED-GRID-07` · `SCHED-HOURS-01` · `SCHED-HOURS-02` · `SCHED-HOURS-03` · `SCHED-HOURS-04` · `SCHED-HOURS-05` · `SCHED-HOURS-06` · `SCHED-HOURS-07` · `SCHED-HOURS-08` · `SCHED-HOURS-09` · `SCHED-HOURS-11` · `SCHED-HOURS-12` · `SCHED-HOURS-13` · `SCHED-HOURS-14` · `SCHED-HOURS-17` · `SCHED-HOURS-17e` · `SCHED-HOURS-17g` · `SCHED-HOURS-17h` · `SCHED-HOURS-17i` · `SCHED-HOURS-17j` · `SCHED-HOURS-17k` · `SCHED-HOURS-18` · `SCHED-SAVE-01` · `SCHED-SAVE-02` · `SCHED-SAVE-02b` · `SCHED-SAVE-02c` · `SCHED-SAVE-02d` · `SCHED-SAVE-03` · `SCHED-SAVE-04` · `SCHED-SAVE-05` · `SCHED-SAVE-06` · `SCHED-SAVE-07` · `SCHED-SAVE-08` · `SCHED-SLOT-07` · `SCHED-TAB-01` · `SCHED-TAB-01b` · `SCHED-TAB-01c` · `SCHED-TAB-02` · `SCHED-TAB-03` · `SCHED-TAB-04` · `SCHED-TAB-04b` · `SCHED-TAB-05` · `SCHED-WARN-08` · `SCHED-WARN-09` · `SCHED-WARN-10` · `SCHED-WEEK-01` · `SCHED-WEEK-02` · `SCHED-WEEK-03` · `SCHED-WEEK-04` · `SCHED-WEEK-05` · `SCHED-WEEK-06` · `SCHED-WEEK-07` · `SCHED-WEEK-08` · `SCHED-WEEK-09`

**③ 양쪽 무표기 61건** (브라우저 검수에서 눈으로 판정)

`HOURS-DAY-01` · `HOURS-DAY-02` · `HOURS-DAY-03` · `HOURS-DAY-04` · `HOURS-DAY-05` · `HOURS-DOC-01` · `HOURS-EXC-01` · `HOURS-SAVE-01` · `HOURS-SAVE-02` · `SCHED-CALC-01` · `SCHED-CALC-02` · `SCHED-CALC-03` · `SCHED-CALC-04` · `SCHED-CALC-05` · `SCHED-CALC-06` · `SCHED-DEPT-04` · `SCHED-DEPT-06` · `SCHED-DEPT-09` · `SCHED-DEPT-10` · `SCHED-DONE-01` · `SCHED-DONE-02` · `SCHED-DONE-03` · `SCHED-DONE-04` · `SCHED-DONE-05` · `SCHED-DONE-06` · `SCHED-EXC-10` · `SCHED-EXC-12b` · `SCHED-EXC-16` · `SCHED-EXC-17` · `SCHED-EXC-18` · `SCHED-HOURS-10` · `SCHED-HOURS-15` · `SCHED-HOURS-16` · `SCHED-HOURS-17b` · `SCHED-HOURS-17c` · `SCHED-HOURS-17d` · `SCHED-HOURS-17f` · `SCHED-SLOT-01` · `SCHED-SLOT-02` · `SCHED-SLOT-03` · `SCHED-SLOT-04` · `SCHED-SLOT-05` · `SCHED-SLOT-06` · `SCHED-SLOT-08` · `SCHED-SLOT-09` · `SCHED-SLOT-10` · `SCHED-SLOT-11` · `SCHED-TAB-03b` · `SCHED-WARN-01` · `SCHED-WARN-02` · `SCHED-WARN-03` · `SCHED-WARN-04` · `SCHED-WARN-04b` · `SCHED-WARN-04c` · `SCHED-WARN-04d` · `SCHED-WARN-04e` · `SCHED-WARN-05` · `SCHED-WARN-06` · `SCHED-WARN-07` · `SCHED-WARN-11` · `SCHED-WEEK-09b`

### `/admin/settings`

- **데모 원본(뼈대)**: `admin/config/HospitalSettings.tsx (268줄)`
- **실 원본(로직 참조)**: `pages/admin/settings/* (9파일)`
- 규칙 91건 = 양쪽 표기 3 · 실만 40 · 데모만 2 · 양쪽 무표기 46

**① 이식 후보 — 실 코드에만 표기된 40건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`HSET-BOOK-02` · `HSET-BOOK-05` · `HSET-BOOK-06` · `HSET-INFO-01` · `HSET-INFO-02` · `HSET-INFO-03` · `HSET-INFO-04` · `HSET-MSG-01` · `HSET-MSG-02` · `HSET-MSG-06` · `HSET-MSG-07` · `HSET-MSG-09` · `HSET-MSG-17` · `HSET-MSG-22` · `HSET-MSG-27` · `HSET-MSG-30` · `HSET-MSG-33` · `HSET-NAV-01` · `HSET-NAV-02` · `HSET-NAV-04` · `HSET-NAV-05` · `HSET-SAVE-01` · `HSET-SAVE-02` · `HSET-SAVE-03` · `HSET-SAVE-05` · `HSET-SAVE-06` · `HSET-SAVE-07` · `HSET-SAVE-08` · `HSET-SMS-02` · `HSET-SMS-02c` · `HSET-WAIT-01` · `HSET-WAIT-02` · `HSET-WAIT-03` · `HSET-WAIT-04` · `HSETX-API-03` · `HSETX-AUDIT-01` · `HSETX-NAV-01` · `HSETX-STATE-03` · `HSETX-UNDO-01` · `HSETX-VALID-01`

**② 데모만 표기 2건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`HSET-MSG-11` · `HSET-NAV-03`

**③ 양쪽 무표기 46건** (브라우저 검수에서 눈으로 판정)

`HSET-BOOK-01` · `HSET-BOOK-03` · `HSET-BOOK-04` · `HSET-MSG-03` · `HSET-MSG-04` · `HSET-MSG-05` · `HSET-MSG-08` · `HSET-MSG-10` · `HSET-MSG-14` · `HSET-MSG-15` · `HSET-MSG-18` · `HSET-MSG-19` · `HSET-MSG-20` · `HSET-MSG-21` · `HSET-MSG-23` · `HSET-MSG-24` · `HSET-MSG-25` · `HSET-MSG-26` · `HSET-MSG-28` · `HSET-MSG-29` · `HSET-MSG-31` · `HSET-MSG-32` · `HSET-MSG-34` · `HSET-NAV-06` · `HSET-SAVE-04` · `HSET-SAVE-09` · `HSET-SMS-01` · `HSET-SMS-02b` · `HSET-SMS-03` · `HSET-SMS-04` · `HSET-SMS-05` · `HSET-SMS-06` · `HSETX-API-01` · `HSETX-API-02` · `HSETX-API-04` · `HSETX-AUDIT-02` · `HSETX-DATA-01` · `HSETX-DATA-02` · `HSETX-DATA-03` · `HSETX-DATA-04` · `HSETX-DEFAULT-01` · `HSETX-DEFAULT-02` · `HSETX-SEC-01` · `HSETX-SEC-02` · `HSETX-STATE-01` · `HSETX-STATE-02`

### `/messages`

- **데모 원본(뼈대)**: `messages/Messages.tsx (517줄)`
- **실 원본(로직 참조)**: `pages/messages/* (10파일)`
- 규칙 132건 = 양쪽 표기 7 · 실만 38 · 데모만 4 · 양쪽 무표기 83

**① 이식 후보 — 실 코드에만 표기된 38건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`MSGX-SCHED-01` · `MSGX-SCHED-02` · `SEND-ADS-02` · `SEND-ADS-04` · `SEND-ADS-06` · `SEND-ALL-04` · `SEND-BADGE-01` · `SEND-BADGE-06` · `SEND-BOX-01` · `SEND-BOX-02` · `SEND-BOX-03` · `SEND-CH-01` · `SEND-CH-02` · `SEND-DEAD-01` · `SEND-DEAD-02` · `SEND-DOOR-03` · `SEND-FAIL-01` · `SEND-FAIL-05` · `SEND-FAIL-07` · `SEND-FAIL-08` · `SEND-FAIL-09` · `SEND-KIND-02` · `SEND-LATER-01` · `SEND-LATER-05` · `SEND-LIST-01` · `SEND-NIGHT-02` · `SEND-OPEN-07` · `SEND-OPEN-07c` · `SEND-OPEN-07f` · `SEND-RESULT-05` · `SEND-RESULT-09` · `SEND-RESULT-11` · `SEND-RESULT-12` · `SEND-RESULT-13` · `SEND-RETRY-06` · `SEND-WHO-01` · `SEND-WHO-03` · `SEND-WHO-04`

**② 데모만 표기 4건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`SEND-ADS-01` · `SEND-ALL-05` · `SEND-LIST-03` · `SEND-LIST-07`

**③ 양쪽 무표기 83건** (브라우저 검수에서 눈으로 판정)

`MSGX-LIST-01` · `MSGX-RETRY-01` · `MSGX-SCHED-03` · `SEND-ADS-03` · `SEND-ADS-05` · `SEND-ALL-01` · `SEND-ALL-02` · `SEND-ALL-03` · `SEND-ALL-06` · `SEND-ALL-07` · `SEND-ALL-08` · `SEND-ALL-09` · `SEND-ALL-10` · `SEND-ALL-11` · `SEND-ALL-12` · `SEND-BADGE-02` · `SEND-BADGE-03` · `SEND-BADGE-04` · `SEND-BADGE-05` · `SEND-CH-03` · `SEND-CH-05` · `SEND-DEAD-03` · `SEND-DEAD-04` · `SEND-DEAD-05` · `SEND-DEAD-06` · `SEND-DEAD-07` · `SEND-DEAD-08` · `SEND-DEAD-09` · `SEND-DOOR-01` · `SEND-DOOR-02` · `SEND-DOOR-04` · `SEND-DOOR-05` · `SEND-DOOR-06` · `SEND-DOOR-07` · `SEND-DOOR-08` · `SEND-FAIL-03` · `SEND-FAIL-04` · `SEND-FAIL-06` · `SEND-FAIL-10` · `SEND-FAIL-11` · `SEND-FAIL-12` · `SEND-FAIL-13` · `SEND-FAIL-14` · `SEND-KIND-03` · `SEND-LATER-02` · `SEND-LATER-03` · `SEND-LATER-04` · `SEND-LIST-04` · `SEND-LIST-05` · `SEND-LIST-09` · `SEND-LIST-10` · `SEND-LIST-11` · `SEND-NIGHT-01` · `SEND-NIGHT-03` · `SEND-OPEN-01` · `SEND-OPEN-02` · `SEND-OPEN-03` · `SEND-OPEN-04` · `SEND-OPEN-05` · `SEND-OPEN-06` · `SEND-OPEN-07b` · `SEND-OPEN-07d` · `SEND-OPEN-07e` · `SEND-OPEN-07g` · `SEND-OPEN-08` · `SEND-OPEN-09` · `SEND-RESULT-01` · `SEND-RESULT-02` · `SEND-RESULT-03` · `SEND-RESULT-03b` · `SEND-RESULT-03c` · `SEND-RESULT-04` · `SEND-RESULT-06` · `SEND-RESULT-07` · `SEND-RESULT-08` · `SEND-RESULT-10` · `SEND-RESULT-15` · `SEND-RETRY-01` · `SEND-RETRY-02` · `SEND-RETRY-03` · `SEND-RETRY-04` · `SEND-RETRY-05` · `SEND-WHO-02`

### `/patients/:id`

- **데모 원본(뼈대)**: `patient/PatientDetail.tsx (328줄)`
- **실 원본(로직 참조)**: `pages/patient/* (14파일)`
- 규칙 64건 = 양쪽 표기 3 · 실만 27 · 데모만 2 · 양쪽 무표기 32

**① 이식 후보 — 실 코드에만 표기된 27건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`PTDET-ACTION-03` · `PTDET-ACTION-04` · `PTDET-ACTION-05` · `PTDET-ACTION-06` · `PTDET-FAMILY-01` · `PTDET-FAMILY-02` · `PTDET-FAMILY-04` · `PTDET-HEAD-02` · `PTDET-HEAD-03` · `PTDET-HEAD-04` · `PTDET-HEAD-05` · `PTDET-HEAD-06` · `PTDET-LOAD-02` · `PTDET-NOTE-01` · `PTDET-NOTE-02` · `PTDET-NOTE-03` · `PTDET-NOTE-04` · `PTDET-NOTE-05` · `PTDET-QNR-01` · `PTDET-QNR-04` · `PTDET-RECORD-01` · `PTDET-RECORD-05` · `PTDET-STATUS-01` · `PTDET-SUPPORT-01` · `PTDET-VISIT-01` · `PTDET-VISIT-05` · `PTDET-VISIT-06`

**② 데모만 표기 2건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`PTDET-RECORD-03` · `PTDET-VISIT-03`

**③ 양쪽 무표기 32건** (브라우저 검수에서 눈으로 판정)

`PTDET-ACTION-01` · `PTDET-FAMILY-03` · `PTDET-FAMILY-05` · `PTDET-LOAD-01` · `PTDET-LOAD-03` · `PTDET-LOAD-04` · `PTDET-QNR-02` · `PTDET-RECORD-02` · `PTDET-RECORD-04` · `PTDET-STATUS-02` · `PTDET-STATUS-03` · `PTDET-STATUS-04` · `PTDET-STATUS-05` · `PTDET-SUPPORT-02` · `PTDET-SUPPORT-03` · `PTDET-SUPPORT-04` · `PTDET-SUPPORT-05` · `PTDET-VISIT-02` · `PTDET-VISIT-04` · `PTDET-VISIT-07` · `PTDET-VISIT-08` · `PTSUP-SECT-BLOCK-01` · `PTSUP-SECT-EMPTY-01` · `PTSUP-SECT-ERR-01` · `PTSUP-SECT-EXC-01` · `PTSUP-SECT-LINK-01` · `PTSUP-SECT-LIVE-01` · `PTSUP-SECT-LIVE-02` · `PTSUP-SECT-LOAD-01` · `PTSUP-SECT-NAV-01` · `PTSUP-SECT-ORDER-01` · `PTSUP-SECT-PRIV-01`

### `/patients`

- **데모 원본(뼈대)**: `patients/PatientSearch.tsx (188줄)`
- **실 원본(로직 참조)**: `pages/patients/* (6파일)`
- 규칙 56건 = 양쪽 표기 3 · 실만 31 · 데모만 1 · 양쪽 무표기 21

**① 이식 후보 — 실 코드에만 표기된 31건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`SEARCH-ACT-02` · `SEARCH-ACT-03` · `SEARCH-ACT-04` · `SEARCH-ACT-05` · `SEARCH-ACT-06` · `SEARCH-ACT-07` · `SEARCH-ACT-08` · `SEARCH-ACT-09` · `SEARCH-AND-02` · `SEARCH-BOX-02` · `SEARCH-BOX-03` · `SEARCH-LOG-02` · `SEARCH-ONE-01` · `SEARCH-ORDER-06` · `SEARCH-RESULT-01` · `SEARCH-RESULT-02` · `SEARCH-RESULT-03` · `SEARCH-RESULT-04` · `SEARCH-RESULT-05` · `SEARCH-RESULT-06` · `SEARCH-RESULT-07` · `SEARCH-RESULT-08` · `SEARCH-RESULT-09` · `SEARCH-RESULT-10` · `SEARCH-RUN-01` · `SEARCH-RUN-02` · `SEARCH-RUN-03` · `SEARCH-RUN-04` · `SEARCH-RUN-05` · `SEARCH-WHY-02` · `SEARCH-WHY-03`

**② 데모만 표기 1건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`SEARCH-MATCH-01`

**③ 양쪽 무표기 21건** (브라우저 검수에서 눈으로 판정)

`SEARCH-AND-01` · `SEARCH-IMPL-01` · `SEARCH-IMPL-02` · `SEARCH-IMPL-03` · `SEARCH-IMPL-04` · `SEARCH-LOG-01` · `SEARCH-LOG-03` · `SEARCH-LOG-04` · `SEARCH-LOG-05` · `SEARCH-LOG-06` · `SEARCH-MATCH-02` · `SEARCH-MATCH-03` · `SEARCH-MATCH-04` · `SEARCH-MATCH-05` · `SEARCH-ORDER-01` · `SEARCH-ORDER-02` · `SEARCH-ORDER-03` · `SEARCH-ORDER-04` · `SEARCH-ORDER-05` · `SEARCH-ORDER-07` · `SEARCH-SAME-01`

### `/checkin`

- **데모 원본(뼈대)**: `checkin/CheckinForm.tsx (204줄)`
- **실 원본(로직 참조)**: `pages/checkin/* (6파일)`
- 규칙 22건 = 양쪽 표기 1 · 실만 16 · 데모만 0 · 양쪽 무표기 5

**① 이식 후보 — 실 코드에만 표기된 16건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`CHKIN-CODE-01` · `CHKIN-CODE-02` · `CHKIN-CODE-03` · `CHKIN-CODE-04` · `CHKIN-CODE-05` · `CHKIN-HEAD-02` · `CHKIN-LOAD-01` · `CHKIN-RESULT-01` · `CHKIN-RESULT-02` · `CHKIN-RESULT-03` · `CHKIN-RESULT-04` · `CHKIN-SCAN-01` · `CHKIN-SCAN-02` · `CHKIN-SCAN-03` · `CHKIN-SCAN-04` · `CHKIN-SCAN-05`

**③ 양쪽 무표기 5건** (브라우저 검수에서 눈으로 판정)

`CHKIN-CODE-06` · `CHKIN-HEAD-01` · `CHKIN-HEAD-03` · `CHKIN-LOAD-02` · `CHKIN-LOAD-03`

### `/doctor/console`

- **데모 원본(뼈대)**: `doctor/DoctorConsole.tsx (413줄)`
- **실 원본(로직 참조)**: `pages/doctor/* (17파일)`
- 규칙 65건 = 양쪽 표기 8 · 실만 36 · 데모만 2 · 양쪽 무표기 19

**① 이식 후보 — 실 코드에만 표기된 36건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`DOCTOR-DATE-01` · `DOCTOR-DATE-02` · `DOCTOR-DATE-04` · `DOCTOR-DATE-05` · `DOCTOR-DRAFT-01` · `DOCTOR-DRAFT-02` · `DOCTOR-DRAFT-03` · `DOCTOR-DRAFT-04` · `DOCTOR-LOAD-01` · `DOCTOR-LOAD-03` · `DOCTOR-NOTE-01` · `DOCTOR-PHRASE-01` · `DOCTOR-PHRASE-03` · `DOCTOR-PHRASE-04` · `DOCTOR-PHRASE-05` · `DOCTOR-QNR-01` · `DOCTOR-QUEUE-01` · `DOCTOR-QUEUE-03` · `DOCTOR-QUEUE-04` · `DOCTOR-QUEUE-05` · `DOCTOR-QUEUE-06` · `DOCTOR-QUEUE-07` · `DOCTOR-QUEUE-08` · `DOCTOR-RECORD-01` · `DOCTOR-RECORD-03` · `DOCTOR-RECORD-05` · `DOCTOR-RECORD-06` · `DOCTOR-RECORD-07` · `DOCTOR-RECORD-09` · `DOCTOR-RECORD-10` · `DOCTOR-SHELL-02` · `DOCTOR-SHELL-03` · `DOCTOR-SHELL-04` · `DOCTOR-SHELL-05` · `DOCTOR-START-02` · `DOCTOR-START-03`

**② 데모만 표기 2건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`DOCTOR-CONTEXT-03` · `DOCTOR-NOTE-02`

**③ 양쪽 무표기 19건** (브라우저 검수에서 눈으로 판정)

`DOCTOR-CONTEXT-02` · `DOCTOR-CONTEXT-04` · `DOCTOR-DATE-03` · `DOCTOR-DRAFT-05` · `DOCTOR-DRAFT-06` · `DOCTOR-HISTORY-02` · `DOCTOR-HISTORY-03` · `DOCTOR-HISTORY-04` · `DOCTOR-HISTORY-05` · `DOCTOR-HISTORY-06` · `DOCTOR-LOAD-02` · `DOCTOR-LOAD-04` · `DOCTOR-LOAD-05` · `DOCTOR-NOTE-03` · `DOCTOR-QNR-02` · `DOCTOR-QNR-03` · `DOCTOR-QNR-04` · `DOCTOR-QNR-05` · `DOCTOR-SHELL-01`

### `/admin/staff`

- **데모 원본(뼈대)**: `admin/config/StaffAdmin.tsx (271줄)`
- **실 원본(로직 참조)**: `pages/admin/staff/* (13파일)`
- 규칙 42건 = 양쪽 표기 3 · 실만 37 · 데모만 0 · 양쪽 무표기 2

**① 이식 후보 — 실 코드에만 표기된 37건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`STAFF-DEACT-01` · `STAFF-DEACT-02` · `STAFF-DEACT-03` · `STAFF-DEACT-05` · `STAFF-DEACT-06` · `STAFF-DEACT-07` · `STAFF-DEACT-08` · `STAFF-DEACT-09` · `STAFF-DEACT-10` · `STAFF-INVITE-01` · `STAFF-INVITE-02` · `STAFF-INVITE-03` · `STAFF-INVITE-04` · `STAFF-INVITE-05` · `STAFF-LIST-01` · `STAFF-LIST-02` · `STAFF-LIST-03` · `STAFF-LIST-04` · `STAFF-LIST-05` · `STAFF-LIST-06` · `STAFF-PROFILE-01` · `STAFF-PROFILE-02` · `STAFF-PROFILE-03` · `STAFF-PROFILE-04` · `STAFF-PROFILE-05` · `STAFF-PROFILE-06` · `STAFF-PROFILE-07` · `STAFF-PROFILE-08` · `STAFF-PROFILE-09` · `STAFF-PROFILE-10` · `STAFF-PROFILE-11` · `STAFF-PROFILE-12` · `STAFF-ROW-01` · `STAFF-ROW-02` · `STAFF-SHELL-01` · `STAFF-SHELL-02` · `STAFF-STATE-01`

**③ 양쪽 무표기 2건** (브라우저 검수에서 눈으로 판정)

`STAFF-LIST-09` · `STAFF-PROFILE-13`

### `/login`

- **데모 원본(뼈대)**: `auth/Login.tsx (125줄)`
- **실 원본(로직 참조)**: `pages/LoginPage.tsx · PasswordReset*`
- 규칙 11건 = 양쪽 표기 1 · 실만 4 · 데모만 1 · 양쪽 무표기 5

**① 이식 후보 — 실 코드에만 표기된 4건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`STAFF-LOGIN-01` · `STAFF-LOGIN-03` · `STAFF-LOGIN-10` · `STAFF-LOGIN-11`

**② 데모만 표기 1건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`STAFF-LOGIN-08`

**③ 양쪽 무표기 5건** (브라우저 검수에서 눈으로 판정)

`STAFF-LOGIN-02` · `STAFF-LOGIN-04` · `STAFF-LOGIN-05` · `STAFF-LOGIN-06` · `STAFF-LOGIN-09`

### `/admin/access-logs`

- **데모 원본(뼈대)**: `admin/record/AccessLogs.tsx (342줄)`
- **실 원본(로직 참조)**: `pages/admin/AccessLogPage.tsx 외`
- 규칙 36건 = 양쪽 표기 14 · 실만 16 · 데모만 0 · 양쪽 무표기 6

**① 이식 후보 — 실 코드에만 표기된 16건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`ALOG-AUDIT-02` · `ALOG-FILTER-03` · `ALOG-FILTER-04` · `ALOG-FILTER-05` · `ALOG-FILTER-07` · `ALOG-GROUP-01` · `ALOG-HEAD-01` · `ALOG-LIST-06` · `ALOG-LIST-07` · `ALOG-LIST-08` · `ALOG-LIST-10` · `ALOG-LIST-11` · `ALOG-STATE-01` · `ALOG-STATE-02` · `ALOG-STATE-03` · `ALOG-STATE-06`

**③ 양쪽 무표기 6건** (브라우저 검수에서 눈으로 판정)

`ALOG-GROUP-03` · `ALOG-SHELL-01` · `ALOG-SHELL-02` · `ALOG-SHELL-03` · `ALOG-STATE-04` · `ALOG-STATE-05`

### `/admin/questionnaires`

- **데모 원본(뼈대)**: `admin/config/Questionnaires.tsx (259줄)`
- **실 원본(로직 참조)**: `pages/admin/questionnaires/*`
- 규칙 44건 = 양쪽 표기 0 · 실만 30 · 데모만 0 · 양쪽 무표기 14

**① 이식 후보 — 실 코드에만 표기된 30건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`QADM-DEPT-01` · `QADM-DEPT-02` · `QADM-DEPT-03` · `QADM-DEPT-04` · `QADM-FORM-01` · `QADM-FORM-02` · `QADM-FORM-03` · `QADM-FORM-05` · `QADM-FORM-06` · `QADM-FORM-07` · `QADM-FORM-08` · `QADM-FORM-09` · `QADM-FORM-10` · `QADM-SAVE-01` · `QADM-SAVE-02` · `QADM-SAVE-03` · `QADM-SAVE-04` · `QADM-SAVE-05` · `QADM-SAVE-06` · `QADM-SHELL-02` · `QADM-STATE-01` · `QADM-STATE-02` · `QADM-STATE-03` · `QADM-STATE-04` · `QADM-VERSION-01` · `QADM-VERSION-02` · `QADM-VERSION-03` · `QADM-VERSION-04` · `QADM-VERSION-05` · `QADM-VERSION-07`

**③ 양쪽 무표기 14건** (브라우저 검수에서 눈으로 판정)

`QADM-FORM-04` · `QADM-SHELL-01` · `QADM-SHELL-03` · `QADM-VERSION-06` · `QAEX-LIST-01` · `QAEX-LIST-02` · `QAEX-LIST-03` · `QAEX-LIST-04` · `QAEX-LIST-05` · `QAEX-LIST-06` · `QAEX-LIST-07` · `QAEX-LIST-08` · `QAEX-LIST-09` · `QAEX-LIST-10`

### `/admin/patient-merge-candidates`

- **데모 원본(뼈대)**: `admin/record/MergeCandidates.tsx (409줄)`
- **실 원본(로직 참조)**: `pages/admin/merge/*`
- 규칙 37건 = 양쪽 표기 14 · 실만 20 · 데모만 0 · 양쪽 무표기 3

**① 이식 후보 — 실 코드에만 표기된 20건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`MERGE-AUDIT-01` · `MERGE-COMPARE-01` · `MERGE-COMPARE-02` · `MERGE-COMPARE-05` · `MERGE-COMPARE-06` · `MERGE-CONFIRM-02` · `MERGE-CONFIRM-05` · `MERGE-DATA-04` · `MERGE-HEAD-01` · `MERGE-LIST-02` · `MERGE-LIST-05` · `MERGE-LIST-06` · `MERGE-RACE-01` · `MERGE-SHELL-01` · `MERGE-SHELL-02` · `MERGE-SHELL-03` · `MERGE-STATE-01` · `MERGE-STATE-02` · `MERGE-STATE-03` · `MERGE-UNDO-03`

**③ 양쪽 무표기 3건** (브라우저 검수에서 눈으로 판정)

`MERGE-DATA-01` · `MERGE-DATA-02` · `MERGE-DATA-03`

### `/admin/merge-history`

- **데모 원본(뼈대)**: `admin/record/MergeHistory.tsx (306줄)`
- **실 원본(로직 참조)**: `pages/admin/merge-history/*`
- 규칙 35건 = 양쪽 표기 5 · 실만 30 · 데모만 0 · 양쪽 무표기 0

**① 이식 후보 — 실 코드에만 표기된 30건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`MHIST-CONFIRM-01` · `MHIST-CONFIRM-02` · `MHIST-CONFIRM-03` · `MHIST-DETAIL-01` · `MHIST-DONE-01` · `MHIST-DONE-02` · `MHIST-EXC-01` · `MHIST-EXC-02` · `MHIST-EXC-03` · `MHIST-EXC-04` · `MHIST-EXC-05` · `MHIST-EXC-06` · `MHIST-LIST-02` · `MHIST-LIST-03` · `MHIST-LIST-04` · `MHIST-LOCK-01` · `MHIST-LOCK-03` · `MHIST-NAV-01` · `MHIST-NAV-02` · `MHIST-NAV-03` · `MHIST-NAV-04` · `MHIST-NAV-05` · `MHIST-NAV-06` · `MHIST-NAV-07` · `MHIST-REASON-01` · `MHIST-REASON-02` · `MHIST-REASON-03` · `MHIST-SHELL-01` · `MHIST-SHELL-02` · `MHIST-SHELL-03`

### `/admin/errors`

- **데모 원본(뼈대)**: `admin/record/Errors.tsx (159줄)`
- **실 원본(로직 참조)**: `pages/admin/errors/*`
- 규칙 27건 = 양쪽 표기 8 · 실만 10 · 데모만 1 · 양쪽 무표기 8

**① 이식 후보 — 실 코드에만 표기된 10건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`ERRADM-FILTER-01` · `ERRADM-FILTER-03` · `ERRADM-FILTER-04` · `ERRADM-HEAD-01` · `ERRADM-LIST-06` · `ERRADM-LIST-07` · `ERRADM-STATE-01` · `ERRADM-STATE-02` · `ERRADM-STATE-03` · `ERRADM-STATE-04`

**② 데모만 표기 1건** (실 코드가 놓쳤을 수 있는 것 — 데모 구현을 그대로 살린다)

`ERRADM-NOTI-02`

**③ 양쪽 무표기 8건** (브라우저 검수에서 눈으로 판정)

`ERRADM-LIST-05` · `ERRADM-NOTI-03` · `ERRADM-SCOPE-01` · `ERRADM-SCOPE-02` · `ERRADM-SHELL-01` · `ERRADM-SHELL-02` · `ERRADM-STATE-05` · `ERRADM-STATE-06`

### `/admin/stats`

- **데모 원본(뼈대)**: `admin/record/Stats.tsx (321줄)`
- **실 원본(로직 참조)**: `pages/admin/StatsPage.tsx 외`
- 규칙 29건 = 양쪽 표기 11 · 실만 15 · 데모만 0 · 양쪽 무표기 3

**① 이식 후보 — 실 코드에만 표기된 15건** (데모에 이미 있는지 먼저 확인 후, 없으면 실 로직을 가져온다)

`STAT-AUDIT-02` · `STAT-DRILL-03` · `STAT-DRILL-04` · `STAT-EXPORT-01` · `STAT-MASK-01` · `STAT-MASK-02` · `STAT-MASK-04` · `STAT-METRIC-01` · `STAT-METRIC-04` · `STAT-SCOPE-02` · `STAT-SHELL-03` · `STAT-STATE-01` · `STAT-STATE-02` · `STAT-STATE-03` · `STAT-STATE-04`

**③ 양쪽 무표기 3건** (브라우저 검수에서 눈으로 판정)

`STAT-METRIC-07` · `STAT-SHELL-01` · `STAT-SHELL-02`

