#!/usr/bin/env bash
# [배포 Task 10] 환자앱 릴리즈 빌드 — 재현 가능한 서명 빌드.
#
# 사용법:
#   PROD_API_URL=https://xxx.up.railway.app \
#   PROD_SUPABASE_URL=https://<ref>.supabase.co \
#   PROD_SUPABASE_ANON_KEY=<anon key> \
#   bash scripts/build_release.sh apk        # 또는 appbundle | ipa
#
# 이 저장소는 android/ios 플랫폼 폴더를 커밋하지 않는다(.gitignore — "정본은 lib/test뿐").
# 그래서 이 스크립트가 매번 ①뼈대 재생성 ②서명 설정 패치 ③key.properties 복사 ④아이콘 생성 후 빌드한다.
set -euo pipefail
cd "$(dirname "$0")/.."   # patient_app/ 루트

TARGET="${1:-apk}"
: "${PROD_API_URL:?PROD_API_URL 환경변수를 설정하세요 (예: https://xxx.up.railway.app)}"
: "${PROD_SUPABASE_URL:?PROD_SUPABASE_URL 환경변수를 설정하세요}"
: "${PROD_SUPABASE_ANON_KEY:?PROD_SUPABASE_ANON_KEY 환경변수를 설정하세요}"

# ① 플랫폼 뼈대(gitignore라 클린 클론엔 없음) — org/appId는 최초 생성값과 일치시킨다.
if [ ! -d android ]; then
  echo "▶ 플랫폼 뼈대 생성(flutter create) …"
  flutter create --org com.vcuhospital --platforms=android,ios .
fi

# ② 릴리즈 서명 설정을 build.gradle.kts에 심는다(멱등).
echo "▶ 안드로이드 서명 설정 패치 …"
python3 tool/patch_android_signing.py

# ③ 실 key.properties가 루트에 있으면 android/로 복사(android/는 재생성되므로 정본은 루트).
#    없으면 패처가 debug 키로 폴백해 검증 빌드가 막히지 않는다.
if [ -f key.properties ]; then
  cp key.properties android/key.properties
  echo "▶ key.properties → android/ 복사(release 키로 서명)"
else
  echo "⚠ key.properties 없음 — debug 키로 서명(검증 빌드용). 배포 산출물은 RELEASE.md대로 keystore를 준비하세요."
fi

# ④ 런처 아이콘 생성(android/ios 리소스).
echo "▶ 런처 아이콘 생성 …"
flutter pub get
dart run flutter_launcher_icons

# ⑤ 릴리즈 빌드 — 프로덕션 서버 주소를 컴파일 타임에 주입(env.dart가 읽는 3키).
echo "▶ flutter build $TARGET --release …"
flutter build "$TARGET" --release \
  --dart-define=API_BASE_URL="$PROD_API_URL" \
  --dart-define=SUPABASE_URL="$PROD_SUPABASE_URL" \
  --dart-define=SUPABASE_ANON_KEY="$PROD_SUPABASE_ANON_KEY"

echo "✅ 빌드 완료 — build/ 아래 산출물을 확인하세요."
