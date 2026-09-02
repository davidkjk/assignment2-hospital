# 병렬 레인 3 — 셸(앱바)·인증·가족·병원정보·QR

> 3터미널 동시 작업용. **이 파일만 편집**, 큰 감사 문서 `patient-app-demo-parity-audit.md`는 읽기 전용 참고(근거·값 5-A~5-O).
> 워크트리 `feat/patient-app`(`.claude/worktrees/patient-app/patient_app/`).

## 공용 규칙(3레인 공통)
- **다른 레인 파일 금지.** 아래 「내 파일」만. 커밋은 자기 파일만 `git add` 후 레인별.
- 색 교정: 하드코딩 옅은 회색 → **기존 `AppTokens.border`**(새 토큰 안 만듦; `tokens.dart`는 레인1 전용).
- **폰트(크기·굵기·line-height·전역배율) 금지** — 세션19(5-P) 담당.
- 게이트: 골든 재생성 → 데모 눈확인, 셸/탭바·앱바 인상은 **profile 에뮬 필수**(앱바 높이는 골든이 못 그림).
- 판정: radius·패딩·아이콘=절대 px 대조(데모 17px 루트).

## 내 파일 (배타 소유)
- `core/theme.dart` (AppBarTheme만 — 앱바 높이·아이콘)
- `features/home/main_tabs.dart` (하단 탭바 — 결정3)
- `features/auth/login_screen.dart` · `features/auth/landing_screen.dart`
- `features/family/family_new_screen.dart` · `family_edit_screen.dart` · `family_link_form_screen.dart` · `unlink_section.dart` · `family_add_choice_screen.dart`
- `features/qr/qr_fullscreen.dart`
- `features/settings/hospital_info_screen.dart` (규칙승, 필요 시만)
- ⚠️ **카드 계층 되살리기(결정1)는 레인4로 이관** — 설정·약관·전화변경·비번·알림설정·탈퇴·가족목록 화면은 이제 **레인4** 소유. 내가 안 건드림.
- ⚠️ `notification_inbox.dart`는 **레인2**, `app_dialog.dart`는 **레인1** 소유.

## 공용 위젯 소비(내가 편집하지 않음)
- `AppDialogCard`(`app_dialog.dart`) — **레인1 소유**. unlink는 **기존 중앙 정렬 그대로 사용**(정렬 옵션 필요 없음). app_dialog 파일 편집 금지.

## 할 일
- [x] **2. ⭐ 2차 앱바 높이 48 + leading/뒤로 아이콘 20** ✅ `theme.dart` `AppBarTheme(toolbarHeight:48, iconTheme:size 20)`. 전 2차 화면(설정·상세·가족·문진·인증·QR) 자동 반영. 골든서 auth·family 앱바 밴드 48로 재생성 확인.
- [x] **3. 가족 unlink 확인창 2곳 → `AppDialogCard`** ✅ `unlink_section.dart` showUnlinkConfirm·showUnlinkBlocked = 데모 커스텀 카드(rounded-2xl border shadow). 버튼색 **warn 유지**(결정4), [연결 해제]는 TextButton 유지(테스트 단언). confirm=우측정렬 [닫기]+[연결 해제], blocked=full-width [예약 보러 가기]+우측 [닫기].
- [x] **7-family. [인증번호 받기]에 `Phone` 아이콘** ✅ `family_link_form_screen.dart` ActionButton `icon: Icons.phone`.
- [x] **7-qr. QR 페이저 화살표 = 원형 카드 + 닫기 X 20** ✅ `qr_fullscreen.dart` 공용 `_CircleCardButton`(rounded-full bg-card shadow-sm p-2, 아이콘 20, 비활성 opacity-30) — 닫기·페이저 3곳 통일.
- [x] **9b. 로그인폼 미세** ✅ `login_screen.dart` 좌우 패딩 25.5(px-6) · 비번찾기 링크 w700+위여백 20(mt-5). + 랜딩(`landing_screen.dart`) 내부 간격 12/12(gap-3)·로고 아이콘 36(h-9). (세로여백 40 vs 64·타일 radius 18은 전역 규약/에뮬 몫 — 안 건드림.)
- [x] **10. 가족 성별 위젯 통일** ✅ 공용 `GenderBox`(`family_form_bits.dart`, 라디오 점=데모)로 신규·수정 통일(각자 로컬 `_GenderBox` 제거). ⚠️ **관계 칩은 통일 안 함** — 데모가 화면마다 다름(NewFamily 선택=primary / FamilyEdit 선택=secondary/muted). Flutter가 이미 데모대로라 통일하면 오히려 어긋남 → 현행 유지(RelationInput vs RelationChips).

### 🟢 결정 반영분(2026-09-02 사용자 확정)
- ➡️ **결정1(카드 계층 되살리기)는 레인4로 이관** — `parity-lane4-card-hierarchy.md` 참조. 여기서 하지 않음.
- [x] **결정3. 하단 탭바 = 데모 커스텀 플랫 바** ✅ `main_tabs.dart` = 데모 `BottomTabBar.tsx` 이식: 흰 면 + 상단 테두리(border/60) + 위쪽 옅은 그림자(0 -1px 10px .05) + 각 탭 아이콘 20·라벨 11 w500·활성 primary/비활성 grayPending·py-2 gap-0.5. 글리프=Material 채움 근사(home·calendar_month·groups·history·chat_bubble). LIST-REFRESH-06 재조회 로직 보존(main_tabs_refresh_test 통과). ⚠️ InkWell용 투명 Material 필요(셸 렌더 예외 방지). **탭바·앱바 최종 인상은 profile 에뮬 확인 남음**(골든 못 그림/못 판정).
- [x] **결정4. unlink [연결 해제] 버튼색 = 주의색(warn) 유지 확정** — 위 「할 일 3」 그대로. 빨강 채움으로 바꾸지 않음(재연결 가능해 덜 파괴적).
- ℹ️ **결정2. 가족 탭 구조 = 현행 유지**(가족=탭, 재인증 현행). **코드 변경 없음** — 이 레인에서 손대지 않는다.

## 손대지 않음
- 폰트/배율(5-P) · **가족 탭 구조**(결정=현행 유지, 코드 변경 없음) · **의사 실사진**(결정=채우기지만 백엔드 시드 작업 — 사용자가 마지막에 별도 지시) · 병원정보 SET-HOSP 확장(규칙승, 데모로 좁히지 말 것) · 상세/변경/홈/문진/알림(레인1·2).
