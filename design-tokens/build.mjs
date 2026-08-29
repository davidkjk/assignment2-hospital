import { readFileSync, writeFileSync } from 'node:fs';
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
  appendVariables(lines, 'fw', tokens.fontWeight);
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

export { tokens, buildCss, deltaE, deltaE2000 };

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const platform = process.argv[2] || 'staff-web';
  writeFileSync(new URL('../frontend/src/styles/tokens.css', import.meta.url), buildCss(platform));
}
