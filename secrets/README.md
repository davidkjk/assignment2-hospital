# secrets/ — 로컬 비밀 자격증명 보관소 (git 제외)

이 폴더의 **내용물은 git에 커밋되지 않는다**(`.gitignore`가 `secrets/*`를 제외, 이 README만 예외).
서버가 쥐는 열쇠(서비스 계정 키 등)를 로컬 개발 중 임시로 둘 자리다.

## 여기 두는 것
- `firebase-service-account.json` — Firebase(FCM) 서버용 서비스 계정 키. 백엔드가 앱 푸시를 보낼 때 사용.
  배포(Railway)에서는 이 파일을 올리지 않고 **환경변수 `FCM_SERVICE_ACCOUNT_JSON`**(보통 base64)로 넣는다.

## 규칙
- **원본 백업은 비밀번호 관리자**(1Password/Bitwarden 등)에 — 이 폴더는 로컬 사본일 뿐, 잃어도 재발급 가능.
- **절대 커밋 금지.** 실수로 올라갔으면 파일 삭제로 끝내지 말고 발급처에서 **키를 재발급**한다.
- 배포는 파일이 아니라 **환경변수**로 주입한다(`docs/superpowers/plans/2026-07-27-deployment.md` Task 13/14).
