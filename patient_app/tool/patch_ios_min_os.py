#!/usr/bin/env python3
"""iOS 최소 지원 버전(MinimumOSVersion)을 15.0으로 강제한다 (멱등).

App Store Connect는 2027년 봄부터 MinimumOSVersion 15.0 이상만 업로드를 허용한다
(ITMS-90068). 이 앱의 MinimumOSVersion은 Xcode 프로젝트의 IPHONEOS_DEPLOYMENT_TARGET에서
나오는데, flutter create가 재생성하는 기본 템플릿은 그보다 낮은 값(3.44.4 기준 13.0)을 박는다.

이 프로젝트는 ios/ 폴더를 커밋하지 않고 flutter create로 매번 재생성하므로
(patient_app/.gitignore — "정본은 lib/test뿐"), 배포 타깃도 매 릴리즈 빌드마다 다시 심어야
한다. build_release.sh가 이 패처를 호출한다. 손대는 곳:
  - ios/Runner.xcodeproj/project.pbxproj  : IPHONEOS_DEPLOYMENT_TARGET → 15.0 (전 config)
  - ios/Podfile                           : platform :ios, '15.0' + post_install에서 pods도 15.0

멱등: 이미 15.0이면 그대로 둔다.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIN_OS = "15.0"


def patch_pbxproj() -> None:
    f = ROOT / "ios" / "Runner.xcodeproj" / "project.pbxproj"
    if not f.exists():
        print("  ⚠ ios pbxproj 없음 — flutter create 먼저.")
        return
    text = f.read_text()
    new_text, n = re.subn(
        r"IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;",
        f"IPHONEOS_DEPLOYMENT_TARGET = {MIN_OS};",
        text,
    )
    if n == 0:
        print("  ✗ pbxproj에서 IPHONEOS_DEPLOYMENT_TARGET을 못 찾음 — 구조 변경?", file=sys.stderr)
        return
    if new_text != text:
        f.write_text(new_text)
    print(f"  ✅ pbxproj {n}곳의 배포 타깃을 {MIN_OS}로 설정했습니다.")


def patch_podfile() -> None:
    f = ROOT / "ios" / "Podfile"
    if not f.exists():
        print("  ⚠ ios Podfile 없음 — flutter create 먼저.")
        return
    text = f.read_text()

    # ① 글로벌 플랫폼 선언: 주석 처리됐거나 다른 버전이면 15.0으로. (없으면 파일 맨 위에 추가.)
    if re.search(r"^\s*#?\s*platform :ios,", text, flags=re.MULTILINE):
        text = re.sub(
            r"^\s*#?\s*platform :ios, '[\d.]+'",
            f"platform :ios, '{MIN_OS}'",
            text,
            count=1,
            flags=re.MULTILINE,
        )
    else:
        text = f"platform :ios, '{MIN_OS}'\n" + text

    # ② post_install 루프에서 pods 타깃도 15.0으로. (Flutter 템플릿의 표준 루프 뒤에 삽입.)
    marker = "config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']"
    if marker not in text:
        anchor = "    flutter_additional_ios_build_settings(target)\n"
        inject = anchor + (
            "    target.build_configurations.each do |config|\n"
            f"      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '{MIN_OS}'\n"
            "    end\n"
        )
        if anchor in text:
            text = text.replace(anchor, inject, 1)
        else:
            print("  ✗ Podfile post_install 앵커를 못 찾음 — 수동 확인 필요.", file=sys.stderr)

    f.write_text(text)
    print(f"  ✅ Podfile 플랫폼/post_install을 {MIN_OS}로 설정했습니다.")


def main() -> int:
    print(f"▶ iOS 최소 지원 버전 {MIN_OS} 심기 …")
    patch_pbxproj()
    patch_podfile()
    print("✅ iOS 최소 버전 설정 완료.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
