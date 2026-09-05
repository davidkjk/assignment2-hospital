#!/usr/bin/env python3
"""android/app/build.gradle.kts에 릴리즈 서명 설정을 심는다 (멱등).

이 프로젝트는 android/ios 플랫폼 폴더를 **커밋하지 않고 flutter create로 재생성**한다
(patient_app/.gitignore — "정본은 lib/test뿐"). 그래서 build.gradle.kts의 서명 설정도
매 릴리즈 빌드마다 이 패처가 다시 심는다(build_release.sh가 호출). key.properties(커밋 금지)가
있으면 release 키로, 없으면 debug 키로 서명해 로컬 검증 빌드가 막히지 않게 한다.

멱등: 이미 패치됐으면("keystoreProperties" 존재) 아무것도 안 한다.
"""
import sys
from pathlib import Path

GRADLE = Path(__file__).resolve().parent.parent / "android" / "app" / "build.gradle.kts"

KEYSTORE_BLOCK = '''import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// [배포 Task 10] 릴리즈 서명 키 — key.properties(커밋 금지)가 있으면 로드한다.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
'''

# stock flutter create가 만드는 plugins 블록(이걸 위 KEYSTORE_BLOCK으로 통째 교체).
STOCK_PLUGINS = '''plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}'''

# stock release buildType(debug 서명)을 서명 분기로 교체.
STOCK_RELEASE = '''    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }'''

SIGNED_RELEASE = '''    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // key.properties가 있으면 release 키로, 없으면 debug 키로(로컬 검증 빌드가 막히지 않게).
            signingConfig = if (keystorePropertiesFile.exists())
                signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }'''


def main() -> int:
    if not GRADLE.exists():
        print(f"✗ {GRADLE} 없음 — 먼저 flutter create로 플랫폼 뼈대를 생성하세요.", file=sys.stderr)
        return 1
    text = GRADLE.read_text()
    if "keystoreProperties" in text:
        print("• 이미 서명 설정이 있음(멱등 스킵).")
        return 0
    if STOCK_PLUGINS not in text or STOCK_RELEASE not in text:
        print("✗ build.gradle.kts 구조가 예상과 다름(Flutter 버전 변경?) — RELEASE.md 참고해 수동 패치.",
              file=sys.stderr)
        return 2
    text = text.replace(STOCK_PLUGINS, KEYSTORE_BLOCK.rstrip("\n"), 1)
    text = text.replace(STOCK_RELEASE, SIGNED_RELEASE, 1)
    GRADLE.write_text(text)
    print("✅ build.gradle.kts에 릴리즈 서명 설정을 심었습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
