import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));

const HEX_COLOR = /^#([0-9a-f]{6})$/i;
const D65 = [0.95047, 1, 1.08883];
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function hexToLab(hex) {
  const match = HEX_COLOR.exec(hex);
  if (!match) throw new TypeError(`Expected a six-digit hex color, received: ${hex}`);

  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / D65[0];
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / D65[1];
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / D65[2];
  const labTransform = (value) => value > LAB_EPSILON
    ? Math.cbrt(value)
    : (LAB_KAPPA * value + 16) / 116;
  const [fx, fy, fz] = [x, y, z].map(labTransform);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function hueAngle(a, b) {
  const angle = Math.atan2(b, a) * RAD_TO_DEG;
  return angle >= 0 ? angle : angle + 360;
}

/** Perceptual color distance using the CIEDE2000 standard variant of ΔE. */
function deltaE2000(hex1, hex2) {
  const [l1, a1, b1] = hexToLab(hex1);
  const [l2, a2, b2] = hexToLab(hex2);
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = cBar ** 7;
  const twentyFive7 = 25 ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + twentyFive7)));
  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);
  const h1Prime = c1Prime === 0 ? 0 : hueAngle(a1Prime, b1);
  const h2Prime = c2Prime === 0 ? 0 : hueAngle(a2Prime, b2);

  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;
  let deltahPrime = h2Prime - h1Prime;
  if (c1Prime * c2Prime === 0) deltahPrime = 0;
  else if (deltahPrime > 180) deltahPrime -= 360;
  else if (deltahPrime < -180) deltahPrime += 360;
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin((deltahPrime / 2) * DEG_TO_RAD);

  const lBar = (l1 + l2) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;
  let hBarPrime;
  if (c1Prime * c2Prime === 0) hBarPrime = h1Prime + h2Prime;
  else if (Math.abs(h1Prime - h2Prime) <= 180) hBarPrime = (h1Prime + h2Prime) / 2;
  else if (h1Prime + h2Prime < 360) hBarPrime = (h1Prime + h2Prime + 360) / 2;
  else hBarPrime = (h1Prime + h2Prime - 360) / 2;

  const t = 1
    - 0.17 * Math.cos((hBarPrime - 30) * DEG_TO_RAD)
    + 0.24 * Math.cos((2 * hBarPrime) * DEG_TO_RAD)
    + 0.32 * Math.cos((3 * hBarPrime + 6) * DEG_TO_RAD)
    - 0.20 * Math.cos((4 * hBarPrime - 63) * DEG_TO_RAD);
  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt((cBarPrime ** 7) / ((cBarPrime ** 7) + twentyFive7));
  const sL = 1 + (0.015 * ((lBar - 50) ** 2)) / Math.sqrt(20 + ((lBar - 50) ** 2));
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin((2 * deltaTheta) * DEG_TO_RAD) * rC;
  const lTerm = deltaLPrime / sL;
  const cTerm = deltaCPrime / sC;
  const hTerm = deltaHPrime / sH;

  return Math.sqrt((lTerm ** 2) + (cTerm ** 2) + (hTerm ** 2) + rT * cTerm * hTerm);
}

/**
 * CIE 1976 ΔE*ab (Euclidean distance in CIE L*a*b*).
 * Task 0's documented palette values (24.2 / 32.3 / 20.2) use this
 * conventional CIE L*a*b* distance; CIEDE2000 is available above when that
 * more perceptually tuned variant is needed.
 */
function deltaE(hex1, hex2) {
  const first = hexToLab(hex1);
  const second = hexToLab(hex2);
  return Math.hypot(...first.map((value, index) => value - second[index]));
}

function appendVariables(lines, prefix, values) {
  for (const [key, value] of Object.entries(values)) lines.push(`  --${prefix}-${key}: ${value};`);
}

function buildCss(platform) {
  if (typeof platform !== 'string' || platform.length === 0) {
    throw new TypeError('A target platform is required to build CSS tokens');
  }

  const lines = [
    '/* 생성된 파일 — 편집하지 않는다. design-tokens/tokens.json에서 생성됨. */',
    ':root {',
  ];
  appendVariables(lines, 'color', tokens.color);
  appendVariables(lines, 'fs', tokens.fontSize);
  appendVariables(lines, 'radius', tokens.radius);
  appendVariables(lines, 'shadow', tokens.shadow);
  lines.push(`  --font-logo: ${tokens.logoFont};`);
  for (const [index, palette] of tokens.doctorPalette.entries()) {
    lines.push(`  --doctor-palette-${index}: ${palette.ink};`);
    lines.push(`  --doctor-palette-${index}-fill: ${palette.fill};`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** '#RRGGBB' → Dart 'Color(0xFFRRGGBB)'. 화면 코드가 하드코딩 대신 이 상수를 쓴다. */
function hexToDartColor(hex) {
  const match = HEX_COLOR.exec(hex);
  if (!match) throw new TypeError(`Expected a six-digit hex color, received: ${hex}`);
  return `Color(0xFF${match[1].toUpperCase()})`;
}

const HEX_ARGB = /^#([0-9a-f]{8})$/i;
/** '#AARRGGBB' → Dart 'Color(0xAARRGGBB)'. 알파를 품은 색(처리 중 흐린 딥틸 등) 전용. */
function hexArgbToDartColor(hex) {
  const match = HEX_ARGB.exec(hex);
  if (!match) throw new TypeError(`Expected an eight-digit ARGB hex color, received: ${hex}`);
  return `Color(0x${match[1].toUpperCase()})`;
}

/** '132px' → '132.0' (Dart double 리터럴). */
function pxToDartDouble(value) {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) throw new TypeError(`Expected a px length, received: ${value}`);
  const number = Number(match[1]);
  return Number.isInteger(number) ? `${number}.0` : `${number}`;
}

/**
 * 환자 앱(Flutter) 시각 토큰을 tokens.json에서 생성한다(CSS와 대칭).
 * DISP-GRAY-01/02/03 · DISP-CARD-01 · DISP-WARN-01.
 * grayDone·warn은 공용 color.*를 재사용하고, 환자 앱 전용 값만 patientApp.*에서 읽는다
 * → 직원 웹 CSS(buildCss)는 patientApp을 읽지 않으므로 이 파일이 늘어도 무영향.
 */
function buildDart() {
  const grayPending = hexToDartColor(tokens.patientApp.grayPending);
  const grayDone = hexToDartColor(tokens.color['gray-past']);
  const badgeAmber = hexToDartColor(tokens.patientApp.badgeAmber);
  const badgeSky = hexToDartColor(tokens.patientApp.badgeSky);
  const badgeViolet = hexToDartColor(tokens.patientApp.badgeViolet);
  const badgeSlate = hexToDartColor(tokens.patientApp.badgeSlate);
  const warn = hexToDartColor(tokens.color.warn);
  const warnBarWidth = pxToDartDouble(tokens.patientApp.warnBarWidth);
  const offlineBannerBg = hexToDartColor(tokens.patientApp.offlineBannerBg);
  const primary = hexToDartColor(tokens.color.primary); // color.primary 재사용(공용)
  const primaryBusy = hexArgbToDartColor(tokens.patientApp.primaryBusy); // 알파 포함 전용값
  const cardBodyHeight = pxToDartDouble(tokens.patientApp.cardBodyHeight);
  const background = hexToDartColor(tokens.patientApp.background);
  const surface = hexToDartColor(tokens.patientApp.cardSurface);
  const border = hexToDartColor(tokens.patientApp.border);
  const muted = hexToDartColor(tokens.patientApp.muted);
  const onSurface = hexToDartColor(tokens.patientApp.onSurface);
  const bodyFontSize = pxToDartDouble(tokens.patientApp.body);
  const d = tokens.patientApp.density;
  const densityCardRadius = pxToDartDouble(d.cardRadius);
  const densityRowPad = pxToDartDouble(d.rowPad);
  const densityRowGap = pxToDartDouble(d.rowGap);
  const densityListGap = pxToDartDouble(d.listGap);
  const densitySectionGap = pxToDartDouble(d.sectionGap);
  // 데모 --elevation-card: 딥틸 톤(patientApp.cardShadow) 3겹 그림자. 알파(0.06/0.10/0.13)는 데모 정본값.
  const sc = tokens.patientApp.cardShadow.replace('#', ''); // "102D32"
  const argb = (a) => '0x' + Math.round(a * 255).toString(16).toUpperCase().padStart(2, '0') + sc;

  return `import 'package:flutter/material.dart';

// 생성된 파일 — 편집하지 않는다. design-tokens/tokens.json에서 생성됨(build.mjs buildDart).
// 화면 코드는 색·크기·카드 규격을 여기서만 가져온다(하드코딩 금지). 테마 조립은 core/theme.dart.
class AppTokens {
  AppTokens._();

  // DISP-GRAY-01/02/03 — 회색은 두 진하기뿐. 새 색을 만들지 않는다.
  static const Color grayPending = ${grayPending}; // patientApp.grayPending (아직 안 된 일)
  static const Color grayDone = ${grayDone}; // color.gray-past (이미 끝난 일)
  static const List<Color> grays = [grayPending, grayDone];

  // 상태 배지 색(데모 StatusBadge 톤 정본): 확정=teal(primary)·미확정=amber·대기=sky·접수=violet·부도=slate.
  static const Color badgeAmber = ${badgeAmber}; // 확인 중·확정되지 않음
  static const Color badgeSky = ${badgeSky}; // 진료 대기
  static const Color badgeViolet = ${badgeViolet}; // 접수됐어요
  static const Color badgeSlate = ${badgeSlate}; // 시간 지남
  static const Color badgeOnColor = Colors.white; // 색 배지 위 글자

  // DISP-WARN-01 — 주의색(color.warn 통일): 배경 없이 글자 + 좌측 바.
  static const Color warn = ${warn};
  static const double warnBarWidth = ${warnBarWidth};

  // OFF-BAN-02 — 오프라인 상태 띠 배경(옅은 주황). '주의색 배경 금지'의 예외 1건(전면 상태 배너 한정).
  static const Color offlineBannerBg = ${offlineBannerBg};

  // BTN-STATE-01/02 — 딥틸(primary). 평소=진한 딥틸, 처리 중=흐린 딥틸(회색 아님).
  // 값 근거: 목업 --primary:#0B6E70(66회). 처리 중 흐림은 primary를 알파로 낮춘 계열(≈.75).
  static const Color primary = ${primary}; // color.primary 재사용
  static const Color primaryBusy = ${primaryBusy}; // patientApp.primaryBusy(알파 0xBF≈.75 — 회색으로 칠하지 않는다)

  // DISP-CARD-01 — 카드 본문 높이 고정.
  static const double cardBodyHeight = ${cardBodyHeight};

  // 화면 바탕·면 색(데모 index.css 정본): 페이지 배경(살짝 쿨한 블루그레이)·카드 면(순백)·
  // 경계선(옅은 쿨 그레이)·muted 띠 바탕·본문 글자(진회색).
  static const Color background = ${background};
  static const Color surface = ${surface};
  static const Color border = ${border};
  static const Color muted = ${muted};
  static const Color onSurface = ${onSurface};

  // patientApp.body — 본문 기본 크기(테마 bodyLarge에 쓰인다). 데모 루트 17px(어르신 가독성).
  static const double bodyFontSize = ${bodyFontSize};

  // patientApp.density — 데모(조밀 shadcn) 밀도 토큰. 리스트·카드 성김을 데모에 맞춘다.
  static const double densityCardRadius = ${densityCardRadius}; // patientApp.density.cardRadius
  static const double densityRowPad = ${densityRowPad}; // 컴팩트 행 안쪽 여백
  static const double densityRowGap = ${densityRowGap}; // 아이콘↔글자
  static const double densityListGap = ${densityListGap}; // 행 사이
  static const double densitySectionGap = ${densitySectionGap}; // 날짜 섹션 사이

  // 데모 --elevation-card: 테두리 없이 카드를 띄우는 딥틸 톤(patientApp.cardShadow) 3겹 그림자.
  // 한 곳에서 조절하면 전 카드에 반영된다(테두리 선 대신 그림자 — DESIGN-NOTES 「그림자·경계 시스템」).
  static const List<BoxShadow> cardElevation = [
    BoxShadow(color: Color(${argb(0.06)}), blurRadius: 10), // 사방 앰비언트
    BoxShadow(color: Color(${argb(0.10)}), blurRadius: 3, offset: Offset(0, 1)), // 타이트
    BoxShadow(color: Color(${argb(0.13)}), blurRadius: 26, offset: Offset(0, 10)), // 아래로 또렷
  ];
}
`;
}

export { tokens, buildCss, buildDart, deltaE, deltaE2000 };

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const platform = process.argv[2] || 'staff-web';
  if (platform === 'flutter' || platform === 'dart' || platform === 'patient-app') {
    const dartPath = new URL('../patient_app/lib/core/tokens.dart', import.meta.url);
    mkdirSync(new URL('../patient_app/lib/core/', import.meta.url), { recursive: true });
    writeFileSync(dartPath, buildDart());
  } else {
    writeFileSync(new URL('../frontend/src/styles/tokens.css', import.meta.url), buildCss(platform));
  }
}
