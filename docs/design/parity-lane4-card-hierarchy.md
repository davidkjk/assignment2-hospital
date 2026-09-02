# 병렬 레인 4 — 카드 계층 되살리기(결정1) · 설정·계정 2차 화면

> 3→4터미널 동시 작업용. **이 파일만 편집**, 큰 감사 문서 `patient-app-demo-parity-audit.md`(특히 **1절**)는 읽기 전용 참고.
> 워크트리 `feat/patient-app`(`.claude/worktrees/patient-app/patient_app/`).
> 레인3에서 분리해 온 **단일 결정 작업** — 「보조 상자 그림자 → 테두리 되살리기」 한 가지만 여러 화면에.

## 공용 규칙(레인 공통)
- **다른 레인 파일 금지.** 아래 「내 파일」만. 커밋은 자기 파일만 `git add` 후 레인별.
- 새 테두리 색은 **기존 `AppTokens.border`** 사용(새 토큰 안 만듦; `tokens.dart`는 레인1 전용 — 안 건드림).
- **폰트(크기·굵기·line-height·전역배율) 금지** — 세션19(5-P) 담당.
- 게이트: 골든 재생성 → 데모 눈확인, **profile 에뮬 필수**(테두리가 딥틸 배경에 묻히지 않는지 = 세션9에 그림자로 바꿨던 이유).

## 내 파일 (배타 소유) — 전부 레인3에서 이관
- `features/settings/settings_home_screen.dart` (공용 헬퍼 **`_SettingsLink`** 여기 있음 — 여기부터)
- `features/settings/consent_screen.dart`
- `features/auth/phone_change_screen.dart`
- `features/settings/settings_password_screen.dart`
- `features/settings/notification_settings_screen.dart`
- `features/settings/withdraw_screen.dart`
- `features/family/family_list_screen.dart`

## 할 일
- [x] **결정1. 「보조=테두리」 되살리기** — ✅ **완결(2026-09-02)**. 대부분은 커밋 43c22c0(diff에 `boxShadow:cardElevation`→`border`)에 반영: `_SettingsLink`(settings_home)·`consent`(약관 리스트)·`phone_change`(_StepRow 절차카드)·`notification_settings`(그룹별 섹션 ×2)·`withdraw`(고지 박스). **잔여 1건은 커밋 35f9d31에서 마저 수정**: `settings_password` 조건 박스 — 데모 `rounded-xl **border** bg-primary/5`인데 Flutter는 틴트만 있고 테두리가 빠져 있었음(처음엔 "틴트라 테두리 없는 게 정답"으로 잘못 판정 → 데모 Password.tsx:94 재대조로 정정). `family_list`(UpcomingRow=OutlinedButton 테두리)·`phone_change` muted 박스(데모 `rounded-xl bg-muted`=테두리 없음)는 원래 정합. 주요 카드는 그림자 유지 확인: settings_home 「내 정보」 + family 멤버 카드(데모 `<Card>` 일치).
  - ⚠️ **주요 카드는 그림자 유지**(홈 예약카드·병원정보 등 — 여기 파일엔 없지만 원칙). 되살릴 건 **보조 컨테이너만**.
- [x] **3-4(덤). 전화변경 방패 아이콘** — ✅ **완료(2026-09-02, 커밋 900e60a)**. `verified_user`(방패+사람) → Phosphor **ShieldCheck**(방패+체크) SVG 이식. Material 근사 글리프 없어 `assets/icons/shield_check_fill.svg`(Phosphor fill 경로) + `SvgPicture.asset`(HospitalLogo 패턴). analyze 통과·동작 테스트 5/5 통과.

## 손대지 않음
- 폰트/배율(5-P) · 주요 카드(그림자 유지) · 알림함(`notification_inbox`, 이미 테두리 — 레인2) · 그 밖 전 파일(레인1·2·3).
