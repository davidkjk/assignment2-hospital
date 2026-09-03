# 환자앱 릴리즈 빌드 안내 (배포 Task 10)

이 앱은 **android/ios 플랫폼 폴더를 커밋하지 않는다**(`.gitignore` — "정본은 `lib`/`test`뿐").
그래서 릴리즈 빌드는 `scripts/build_release.sh`가 매번 ①뼈대 재생성 → ②서명 설정 패치 →
③`key.properties` 복사 → ④아이콘 생성 → ⑤서명 빌드 순으로 재현한다. 플랫폼 폴더를
직접 손보지 말고 이 스크립트로만 빌드하면 된다.

빌드 산출물의 서버 주소는 **컴파일 타임에 `--dart-define`으로 주입**된다
(`lib/core/env.dart`의 `API_BASE_URL`·`SUPABASE_URL`·`SUPABASE_ANON_KEY`).
프로덕션 주소는 배포(Task 13~15)에서 확정되는 Railway·Supabase 값이다.

---

## 두 개의 벽 (사용자가 직접 해야 하는 대화형 작업)

자동화할 수 없는 두 가지가 있다. 나머지는 스크립트가 처리한다.

1. **안드로이드 keystore 암호 = 사용자 소유** — 아래 A에서 keystore를 1회 만들고 암호를
   비밀번호 관리자에 보관한다. ⚠️ **암호·keystore를 분실하면 이미 스토어에 올린 앱을 다시는
   업데이트할 수 없다**(구글이 같은 키 서명만 업데이트로 인정). 절대 커밋 금지.
2. **iOS/Apple 서명 = Xcode GUI + Apple ID** — 아래 B는 Xcode에서 사람이 클릭해야 한다.

---

## A. 안드로이드 릴리즈 (자동화 가능, keystore만 1회 수동)

### A-1. keystore 1회 생성 (커밋 금지)

```bash
mkdir -p ~/keys
keytool -genkey -v -keystore ~/keys/hospital-demo-release.jks \
  -alias hospital-demo -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Gaon Hospital Demo, O=VCU Assignment, C=KR"
# 암호를 물으면 사용자가 정한 값을 입력하고 안전한 곳에 보관.
```

> **📌 이 데모에서 실제로 생성한 keystore (2026-09-03, Task 18)**
> - 파일: `~/keys/hospital-demo-release.jks` (커밋 안 됨, `.gitignore`)
> - alias: `hospital-demo` · **store/key 암호: `demo1234`** (프로젝트 다른 데모 계정과 동일한 데모 암호)
> - 인증서: `CN=Gaon Hospital Demo, O=VCU Hospital, C=KR`, SHA-256 지문 `F7:E2:D5:82:…:65:A7`
> - ⚠️ **이건 데모 전용이다.** 암호를 문서에 적어 「분실=업데이트 불가」 위험을 없앤 것 — **실서비스로 전환하면 본인만 아는 강한 암호로 keystore를 다시 만들어야 한다**(그 순간부터 암호 분실 시 앱 업데이트가 영구 불가해지니 비밀번호 관리자에 보관).

### A-2. key.properties 채우기 (커밋 금지)

```bash
cp key.properties.example key.properties
# key.properties를 열어 storeFile 경로와 storePassword/keyPassword(위에서 정한 암호)를 채운다.
# keyAlias는 hospital-demo.
```

`key.properties`는 `patient_app/` 루트에 둔다. `build_release.sh`가 빌드 시 `android/`로 복사한다
(`android/`는 재생성되므로 정본은 루트). `.gitignore`가 `key.properties`·`*.jks`·`*.keystore`를 막는다.

### A-3. 서명된 빌드

```bash
cd patient_app
PROD_API_URL=https://<railway 주소> \
PROD_SUPABASE_URL=https://<ref>.supabase.co \
PROD_SUPABASE_ANON_KEY=<anon key> \
bash scripts/build_release.sh appbundle     # 스토어 제출용 .aab (또는 apk)
```

- `appbundle` → `build/app/outputs/bundle/release/app-release.aab` (Play 스토어 제출 형식)
- `apk` → `build/app/outputs/flutter-apk/app-release.apk` (직접 배포·검증용)

`key.properties`가 있으면 release 키로, 없으면 debug 키로 폴백해 검증 빌드가 막히지 않는다.

### A-4. 서명 확인 (선택)

```bash
# keystore가 실제로 적용됐는지 — release 키 서명이면 CN=Gaon Hospital Demo가 보인다.
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs \
  build/app/outputs/flutter-apk/app-release.apk | head
```

⚠️ 안드로이드 SDK 경로(로컬): `/opt/homebrew/share/android-commandlinetools`.

---

## B. iOS 릴리즈 (전부 Xcode GUI — 사용자 대화형)

`scripts/build_release.sh ipa`는 `flutter build ipa`까지 돌리지만, **Apple 서명은 Xcode에서
계정을 연결해야** 성공한다. 처음 1회는 아래를 사람이 수행한다(사용자는 Apple Developer 계정 보유).

1. **뼈대 생성 후 워크스페이스 열기**
   ```bash
   cd patient_app
   [ -d ios ] || flutter create --org com.vcuhospital --platforms=android,ios .
   open ios/Runner.xcworkspace
   ```

2. **Apple 계정 연결** — Xcode → Settings → Accounts → `+` → Apple ID 로그인.

3. **팀·서명 설정** — 프로젝트 navigator에서 `Runner` 타깃 → **Signing & Capabilities** →
   Team 드롭다운에서 로그인한 개발자 팀 선택 → **Automatically manage signing** 체크.
   Bundle Identifier가 `com.vcuhospital.hospitalPatientApp`(= 안드로이드 appId
   `com.vcuhospital.hospital_patient_app`에서 flutter가 파생하는 iOS 번들)인지 확인.
   다른 값을 쓰려면 여기서 바꾸되 안드로이드와 짝을 맞춘다.

4. **서명된 IPA 산출** — 두 경로 중 하나.
   ```bash
   # (a) CLI: 자동 서명이 잡혀 있으면
   PROD_API_URL=https://... PROD_SUPABASE_URL=https://... PROD_SUPABASE_ANON_KEY=... \
   bash scripts/build_release.sh ipa    # → build/ios/ipa/*.ipa
   ```
   서명 실패로 멈추면 **(b) Xcode Archive**: Product → Archive → Organizer에서
   Distribute App → App Store Connect(또는 Ad Hoc).

5. **서명 검증 (선택)**
   ```bash
   cd build/ios/ipa && unzip -o *.ipa -d _unzipped
   codesign -dv --verbose=4 _unzipped/Payload/Runner.app   # Authority=Apple Distribution: ...
   rm -rf _unzipped
   ```

6. **범위 밖**: 실제 App Store 공개 심사 제출은 이 과제 범위 밖이다. TestFlight 내부 테스트
   업로드까지만 진행한다(요구사항 = "심사를 제출할 수 있는 빌드"까지).

> **📌 이 데모에서 실제로 만든 iOS 빌드 (2026-09-03, Task 18)**
> - 산출물: `build/ios/ipa/hospital_patient_app.ipa` (27.1MB, App Store 방식) → 보관 `~/hospital-demo-release/v1.0.0-demo/hospital_patient_app-v1.0.0-demo.ipa`
> - 방식: `flutter build ipa --export-method app-store` (자동 서명, GUI Archive 불필요했음 — 프로젝트에 이미 팀 지정돼 있었음)
> - **서명 신원**: `Apple Distribution: JUN KEE KIM (QSF7US9W24)`, Team `QSF7US9W24`, Bundle `com.vcuhospital.hospitalPatientApp`
> - 프로비저닝: "iOS Team Store Provisioning Profile"(`get-task-allow=false` = 배포용). 버전 1.0.0(빌드 1).
> - **프로덕션 URL 내장 검증됨**: Railway API·Supabase 박힘, `localhost` 0건.
> - ⚠️ **선결 조건**: Xcode 26에서 실기기/배포 아카이브에 **iOS 플랫폼 구성요소**가 별도 필요("iOS 26.5 is not installed" 오류) → `xcodebuild -downloadPlatform iOS`로 설치(약 2GB). `showsdks`에 SDK가 보여도 이 구성요소는 별개.
> - 미관 경고 1건(빌드 무관): "Launch image is set to the default placeholder" — 런치 화면 이미지 기본값. 데모는 무방, 필요 시 후속 개선.

---

## 참고

- `applicationId` / iOS 번들의 뿌리 = `com.vcuhospital.hospital_patient_app`
  (flutter create 생성값 그대로. 바꾸면 namespace·MainActivity·iOS 번들과 어긋난다).
- 버전 = `pubspec.yaml`의 `version: 1.0.0+1` → versionName `1.0.0`, versionCode `1`.
  업데이트 시 `1.0.1+2`처럼 빌드번호(+뒤)를 반드시 올린다.
- 아이콘 원본 = `assets/icon/app_icon.png`(1024², 커밋됨). 스크립트가 `flutter_launcher_icons`로
  플랫폼 리소스를 생성한다.
