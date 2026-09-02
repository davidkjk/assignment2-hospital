# 병렬 레인 1 — 예약 상세·변경·취소·달력·다이얼로그

> 3터미널 동시 작업용. **자기 레인 파일(이 파일)만 편집**하고 큰 감사 문서 `patient-app-demo-parity-audit.md`는 **읽기 전용 참고**(충돌 방지). 근거·값은 거기 5-A~5-O.
> 워크트리 `feat/patient-app`(`.claude/worktrees/patient-app/patient_app/`).

## 공용 규칙(3레인 공통)
- **다른 레인 파일은 절대 만지지 않는다.** 아래 「내 파일」만.
- 커밋은 **자기 파일만 명시적으로** `git add <파일들>` 후 레인별 커밋(동시 편집 안전하도록).
- 색 교정: 하드코딩 옅은 회색 → **기존 `AppTokens.border`** 사용(새 토큰 안 만듦, `tokens.dart`는 레인1만).
- **폰트(크기·굵기·line-height·전역 배율)는 손대지 않는다** — 다른 터미널(세션19, 5-P) 담당.
- 게이트: 손댄 화면 골든 재생성 → 데모 눈확인. 셸/탭바 포함 인상은 profile 에뮬.
- 판정 기준: 데모 17px 루트라 rem 전부 ×17/16. **radius·패딩·아이콘은 절대 px 대조**(폰트만 배율).

## ⚠️ 내 베이스에 세션17 A/B 미커밋분 포함
`detail_sections.dart`·`change_flow.dart`·`cancel_flow.dart`·`app_dialog.dart`에 **세션17 A/B 미커밋 변경이 이미 있다**(헤더배경 muted·AppDialogCard 통일). **그 위에 이어서** 작업하고, **A/B를 내 커밋에 함께** 넣는다.

## 내 파일 (배타 소유)
- `features/appointment/detail_sections.dart`
- `features/appointment/change_flow.dart`
- `features/appointment/cancel_flow.dart`
- `features/appointment/cancelled_view.dart`
- `features/booking/steps/date_step.dart` (MonthCalendar — 예약 달력 공용, 변경도 씀)
- `widgets/app_dialog.dart`
- `core/tokens.dart` (border/divider 토큰 정책만)

## 공용 위젯 계약(다른 레인이 소비)
- `app_dialog.dart` 수정 시 **하위호환 유지**: 정렬 옵션은 **선택 파라미터(기본 중앙)**로 추가. 레인3 unlink가 기존 호출 그대로 쓴다.

## 할 일 — ✅ 완료 (커밋 `cf7bea5`, 세션17 A/B 동봉)
- [x] **1a. 하드코딩 테두리색 → `AppTokens.border`** — 5곳 치환(detail: 전화행·문진 아코디언·버튼바 top·정보표 구분선 / change: 요약카드). ✅ **`0xFFEDF0F2`는 divider 토큰이 아니라 `muted`(띠 배경) — 손대지 않음.** `tokens.dart`는 생성물이라 편집 불필요(하드코딩만 교정). 별도 divider 토큰 없음 → 전부 `AppTokens.border`.
- [x] **4-detail. "확인 중" 배너에 좌측 4px 바 추가** — `DetailHeader` pending 행을 `Container(border-left warnBarWidth)` + pl-12 로 감쌈(시계 유지, 배경 없음=DISP-WARN-01). 골든 `appt-pending` 확인.
- [x] **5. 변경 시간슬롯 → 테두리 rounded-xl 14** — `_SlotBlock` OutlinedButton → 새 `_SlotChip`(Material bg-card + border + radius14 + w600 14px). 골든 `t22-change-time` 확인.
- [x] **6. `MonthCalendar`에 `markedDate` + 「현재 예약」 범례 3번째** — `markedDate` 선택 파라미터 추가(현재 예약일 아래 4px 딥틸 점 `_DayCell.marked` + 범례 `_LegendDot.marked()` 6px). 예약 달력은 null→2항목 그대로(하위호환). change_flow가 `d.view.slotStart` 전달.
- [x] **7-detail. [새로 예약하기]에 아이콘** — `ActionButton(icon: Icons.calendar_month)`(CalendarPlus 근사, 목록 CTA와 관례 일치). 골든 `appt-cancelled` 확인.
- [x] **8-detail. 정보표 라벨칸 72→85** — 완료. ✅ **카드 좌우패딩은 16 유지** — 데모 Card `--card-spacing: spacing(4)` = px-4(16/17px)이지 px-6(25.5) 아님(감사 추정 오류). 1px 계통차는 범위 밖. 추가로 `last:border-b-0`(마지막 행 구분선 제거)도 이식.
- [x] **12. 변경 확인창 하단정렬** — `AppDialogCard`에 `alignment` 선택 파라미터(기본 null=중앙, 하위호환) → `showChangeConfirm`만 `Alignment.bottomCenter`. 취소·마감안내는 중앙 유지.
- [x] **11. 상세 머리 「상태:·누가·언제」 줄 — ✅ 사용자 결정: 넣지 않음(2026-09-02).** 활성 예약엔 이 줄을 두지 않고 현재대로(취소만 CANCEL-DONE-02로 actor·시각 표시). 근거: APPT-HEAD-01~06에 규칙 없음 + Flutter `AppointmentDetail`에 활성 예약 `statusActor`/`statusAt` 필드 없음(데모 mock 전용). 재론 금지 — 넣으려면 사용자 재요청 시 백엔드 필드+모델+규칙 신설부터.

## 손대지 않음
- 폰트/전역배율(5-P 담당) · 카드 계층 결정(D-1) · unlink 버튼색(D-3) · 홈/문진/알림/인증/가족/QR/theme 파일(레인2·3).
