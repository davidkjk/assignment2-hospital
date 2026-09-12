#!/usr/bin/env python3
"""FCM 푸시에 필요한 네이티브 설정을 android/ios에 심는다 (멱등).

이 프로젝트는 android/ios 플랫폼 폴더를 커밋하지 않고 flutter create로 재생성한다
(patient_app/.gitignore — "정본은 lib/test뿐"). 그래서 Firebase 설정 파일과 iOS 푸시
엔타이틀먼트도 매 릴리즈 빌드마다 이 패처가 다시 심는다(build_release.sh가 호출).
커밋되는 정본은 patient_app/firebase/ 안의 세 파일:
  - google-services.json         → android/app/
  - GoogleService-Info.plist     → ios/Runner/
  - Runner.entitlements          → ios/Runner/  (+ pbxproj·Info.plist 배선)

app 수준 gradle의 google-services 플러그인은 patch_android_signing.py가 심는다(그 스크립트가
plugins 블록을 통째로 다시 쓰므로). 여기선 settings.gradle.kts의 `apply false` 선언을 심는다.

멱등: 이미 심어졌으면 각 단계를 건너뛴다.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "firebase"
APP_BUNDLE_ID = "com.vcuhospital.hospitalPatientApp"
GOOGLE_SERVICES_VERSION = "4.3.15"


def _copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    print(f"  • {src.name} → {dst.relative_to(ROOT)}")


def patch_android_settings() -> None:
    f = ROOT / "android" / "settings.gradle.kts"
    if not f.exists():
        print("  ⚠ android/settings.gradle.kts 없음 — flutter create 먼저.")
        return
    text = f.read_text()
    if "com.google.gms.google-services" in text:
        print("  • settings.gradle.kts: google-services 이미 있음(스킵).")
        return
    anchor = '    id("com.android.application")'
    for line in text.splitlines():
        if line.strip().startswith('id("com.android.application")'):
            anchor = line  # flutter create가 붙이는 version 포함 줄 그대로 앵커로.
            break
    inject = (
        anchor
        + "\n    // FCM 푸시 — flutterfire configure가 넣는 플러그인(android/ 재생성 대비 여기서 심음)."
        + f'\n    id("com.google.gms.google-services") version("{GOOGLE_SERVICES_VERSION}") apply false'
    )
    f.write_text(text.replace(anchor, inject, 1))
    print("  ✅ settings.gradle.kts에 google-services 플러그인 선언을 심었습니다.")


def patch_android_desugaring() -> None:
    """flutter_local_notifications(v22)가 요구하는 core library desugaring을 app gradle에 켠다.
    android/는 재생성되므로 매번 심는다(멱등)."""
    f = ROOT / "android" / "app" / "build.gradle.kts"
    if not f.exists():
        print("  ⚠ android/app/build.gradle.kts 없음 — flutter create 먼저.")
        return
    text = f.read_text()
    if "isCoreLibraryDesugaringEnabled" in text and "coreLibraryDesugaring" in text:
        print("  • desugaring 이미 있음(스킵).")
        return
    if "isCoreLibraryDesugaringEnabled" not in text:
        text = text.replace(
            "compileOptions {\n",
            "compileOptions {\n        isCoreLibraryDesugaringEnabled = true\n",
            1,
        )
    if "coreLibraryDesugaring" not in text:
        text = text.rstrip() + (
            "\n\ndependencies {\n"
            '    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n'
            "}\n"
        )
    f.write_text(text)
    print("  ✅ app build.gradle.kts에 core library desugaring을 켰습니다.")


def patch_ios_entitlements() -> None:
    pbx = ROOT / "ios" / "Runner.xcodeproj" / "project.pbxproj"
    if not pbx.exists():
        print("  ⚠ ios pbxproj 없음 — flutter create 먼저.")
        return
    text = pbx.read_text()
    if "CODE_SIGN_ENTITLEMENTS" in text:
        print("  • pbxproj: CODE_SIGN_ENTITLEMENTS 이미 있음(스킵).")
        return
    # 앱 타깃(=.RunnerTests가 아닌) 번들ID 줄 바로 뒤에 엔타이틀먼트 연결을 삽입. 들여쓰기 보존.
    target_line = f"PRODUCT_BUNDLE_IDENTIFIER = {APP_BUNDLE_ID};"
    out, hits = [], 0
    for line in text.splitlines(keepends=True):
        out.append(line)
        if line.strip() == target_line:
            indent = line[: len(line) - len(line.lstrip("\t"))]
            out.append(f"{indent}CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;\n")
            hits += 1
    if hits == 0:
        print(f"  ✗ pbxproj에서 앱 번들ID 줄({APP_BUNDLE_ID})을 못 찾음 — 구조 변경?", file=sys.stderr)
        return
    pbx.write_text("".join(out))
    print(f"  ✅ pbxproj 앱 타깃 {hits}곳에 CODE_SIGN_ENTITLEMENTS를 연결했습니다.")


def patch_ios_info_plist() -> None:
    f = ROOT / "ios" / "Runner" / "Info.plist"
    if not f.exists():
        print("  ⚠ ios Info.plist 없음 — flutter create 먼저.")
        return
    text = f.read_text()
    if "UIBackgroundModes" in text:
        print("  • Info.plist: UIBackgroundModes 이미 있음(스킵).")
        return
    block = (
        "\t<key>UIBackgroundModes</key>\n"
        "\t<array>\n"
        "\t\t<string>remote-notification</string>\n"
        "\t</array>\n"
    )
    tail = "</dict>\n</plist>"
    if tail not in text:
        print("  ✗ Info.plist 말미 구조가 예상과 다름 — 수동 확인 필요.", file=sys.stderr)
        return
    f.write_text(text.replace(tail, block + tail, 1))
    print("  ✅ Info.plist에 UIBackgroundModes(remote-notification)를 심었습니다.")


def main() -> int:
    if not (SRC / "google-services.json").exists():
        print(f"✗ {SRC} 에 Firebase 정본 파일이 없음 — flutterfire configure를 다시 실행하세요.",
              file=sys.stderr)
        return 1
    print("▶ Firebase 설정 파일 복사 …")
    if (ROOT / "android").exists():
        _copy(SRC / "google-services.json", ROOT / "android" / "app" / "google-services.json")
    if (ROOT / "ios").exists():
        _copy(SRC / "GoogleService-Info.plist", ROOT / "ios" / "Runner" / "GoogleService-Info.plist")
        _copy(SRC / "Runner.entitlements", ROOT / "ios" / "Runner" / "Runner.entitlements")
        # 최신 Flutter iOS 템플릿은 registerForRemoteNotifications를 부르지 않아 APNS 토큰이 안 온다.
        # 이 프로젝트의 AppDelegate(등록 강제 + APNS 토큰 Firebase 전달)를 정본으로 심는다.
        _copy(SRC / "AppDelegate.swift", ROOT / "ios" / "Runner" / "AppDelegate.swift")
    print("▶ Android gradle …")
    patch_android_settings()
    patch_android_desugaring()
    print("▶ iOS 푸시 배선 …")
    patch_ios_entitlements()
    patch_ios_info_plist()
    print("✅ Firebase 네이티브 설정 완료.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
