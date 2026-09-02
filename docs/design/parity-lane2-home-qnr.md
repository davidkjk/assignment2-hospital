# 병렬 레인 2 — 홈 카드·문진·알림

> 3터미널 동시 작업용. **이 파일만 편집**, 큰 감사 문서 `patient-app-demo-parity-audit.md`는 읽기 전용 참고(근거·값 5-A~5-O).
> 워크트리 `feat/patient-app`(`.claude/worktrees/patient-app/patient_app/`).

## 공용 규칙(3레인 공통)
- **다른 레인 파일 금지.** 아래 「내 파일」만. 커밋은 자기 파일만 `git add` 후 레인별.
- 색 교정: 하드코딩 옅은 회색 → **기존 `AppTokens.border`**(새 토큰 안 만듦; `tokens.dart`는 레인1 전용 — 내가 안 건드림).
- **폰트(크기·굵기·line-height·전역배율) 금지** — 세션19(5-P) 담당. ⚠️ 문진 입력칸은 **radius만** 만지고 글자 크기는 그대로.
- 게이트: 골든 재생성 → 데모 눈확인, 셸 인상은 profile 에뮬. radius·패딩·아이콘=절대 px 대조.

## 내 파일 (배타 소유)
- `features/home/appointment_card.dart`
- `features/home/home_screen.dart` (하드코딩 `0xFFEFF3F4`)
- `features/home/card_bodies_a.dart` · `features/home/card_bodies_b.dart`
- `features/home/questionnaire_row.dart` (하드코딩 `0xFFE5EAED`)
- `features/questionnaire/question_field.dart`
- `features/questionnaire/questionnaire_wizard.dart`
- `features/notifications/notification_inbox.dart`
- `widgets/warn_text.dart` · `widgets/app_card.dart`
- ⚠️ **`my_appointments_screen.dart`는 안 건드림**(세션19가 방금 수정 — 목록 미세값 5-F는 이번 스코프 제외).

## 공용 위젯 계약(다른 레인이 소비)
- `warn_text.dart`에 아이콘 추가 시 **선택 파라미터**로(기본 아이콘 없음). 가족 경고 등 다른 용처는 아이콘 없이 그대로 렌더돼야 한다.

## 할 일 — ✅ 전부 완료(커밋 `900e60a`, ⚠️ 공유 인덱스로 레인4 커밋에 동봉됨)
- [x] **1b. 하드코딩 색 → 토큰**: `questionnaire_row.dart`의 `0xFFE5EAED`(문진줄 border-top) → `AppTokens.border` ✅. `home_screen.dart`의 `0xFFEFF3F4`는 **테두리가 아니라 Scaffold 배경색**이라(5-O grep이 오분류) `AppTokens.border`가 아니라 **`AppTokens.background`**(데모 `--background` oklch 0.966, 알림함과 일관)로 바로잡음.
- [x] **4-home. 홈 "확인 중" 배너 시계** ✅. `warn_text.dart`에 선택 `icon` 파라미터(기본 없음, 하위호환) → `appointment_card.dart` req `WarnText`에 `access_time_filled`(상세 배너와 같은 size16/gap6). 임시 골든으로 렌더 확인.
- [x] **8-home. QR 준비박스 점선 80** ✅. `card_bodies_a`(`_QrPlaceholder`)·`card_bodies_b`(번호없음 CARD-OK-03) → `SizedBox(80)`+`DottedBorder(color: border, radius:10)`(데모 `h-20 w-20 border-dashed`). 확정 QR(번호 있음)은 실선 80 유지.
- [x] **8-home. 카드 제목 truncate** ✅. `appointment_card.dart` `name · relation`에 `maxLines:1 + ellipsis`.
- [x] **9a-1. 문진 입력칸 radius** ✅. long_text `OutlineInputBorder` radius 4 → **14**(데모 rounded-xl, 흰 면·border 토큰·포커스 딥틸). short_text는 테마 입력칸(radius 10) 그대로. yes/no 16→18. 글자 크기 안 건드림.
- [x] **9a-2. 문진 푸터 간격** ✅. `questionnaire_wizard.dart` `SizedBox(width:12)` → `8`(gap-2).
- [x] **9a-3. 알림 본문 말줄임** ✅. `notification_inbox.dart` `NotificationRow` body에 `maxLines:1 + ellipsis`.

## ⚠️ 인계 사항(레인3·통합 담당)
- **qnr-confirm.png·qnr-resume.png 골든은 아직 stale(theme-48 미반영)** — 레인3의 `theme.dart`(toolbarHeight 48·아이콘 20)가 앱바를 8px 밀어 실패한다. 내 콘텐츠가 아니라(=confirm_screen·resume_screen) 손대지 않았으니 **레인3가 theme 커밋 시 함께 재생성**해야 한다.
- **내 qnr-wizard·notification 골든은 현재 워크트리 상태(theme-48 포함)로 재생성됨** — theme.dart가 아직 미커밋이라, theme 커밋 전까지는 이 골든들이 theme-48을 가정한다(최종 상태는 일관).
- **공유 git 인덱스 충돌**: 3레인이 한 워크트리·한 인덱스를 공유해, 한 터미널의 `git commit`이 다른 레인의 staged 파일까지 가져간다. 내 16개 파일이 레인4 커밋 `900e60a`에 동봉됐다. 앞으로는 커밋 직전 `git add <내파일>` → 즉시 `git commit`을 원자적으로, 또는 레인별 별도 워크트리 권장.

> ℹ️ **카드 계층 되살리기(결정1)는 레인2에 몫 없음** — `notification_inbox`는 날짜묶음이 이미 `rounded-xl border`(테두리·그림자 없음)·행도 4px 바뿐이라 되살릴 그림자 카드가 없다(5-L 확인). 설정·가족 등 되살리기는 전부 레인3.

## 손대지 않음
- 폰트/글자 크기·배율(5-P) · `my_appointments`(세션19) · 알림 중요바 색(warn=규칙 정답, 데모 빨강 이식 금지) · 상세/변경/인증/가족/QR/theme(레인1·3).
