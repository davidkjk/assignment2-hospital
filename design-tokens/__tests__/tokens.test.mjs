import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCss, buildDart, tokens, deltaE } from '../build.mjs';
import { lintSource } from '../lint-tokens.mjs';

/** WCAG 상대 휘도 → 대비비. 색만으로 상태를 구분하지 않더라도(DISP-COLOR-01)
 *  글자는 읽혀야 하므로 대비는 별도로 지킨다. */
function contrast(hex1, hex2) {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hex1), lum(hex2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** 색상환 각도(0~360). 「두 색이 비슷한가」를 눈이 아니라 값으로 판정하려고 쓴다. */
function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('색 토큰 — 결정로그 「디자인 토큰(확정)」 §색', () => {
  test('확정된 색 토큰이 원본에 모두 있다', () => {
    expect(tokens.color).toMatchObject({
      primary: '#0B6E70', ink: '#10243A', 'ink-muted': '#5A6C7B',
      warn: '#B44E00', danger: '#A02F3D', 'danger-bg': '#FFF0F1',
      done: '#67788A', 'done-bg': '#F5F7F8', bg: '#F2F5F7',
      surface: '#FFFFFF', divider: '#D3DBE2',
    });
  });

  test('[DISP-GRAY-02] 「이미 끝난 일」 옅은 회색이 있다', () => {
    expect(tokens.color['gray-past']).toBe('#A3AFB8');
  });

  test('직원 콘솔 사이드바 잉크색 — 딥틸 짙은 톤 (2026-08-24 데모 정합)', () => {
    // 직원 웹 "직원 콘솔" 정체성: 딥틸 잉크 사이드바(환자 앱은 전부 흰색이라 구별). 하드코딩이 아니라 토큰으로.
    expect(tokens.color['sidebar-ink']).toBe('#0a4a4c');
  });

  test('[DISP-GRAY-03] 회색 계열은 진하기만 다르고 새 색을 만들지 않는다', () => {
    expect(Math.abs(hue(tokens.color.done) - hue(tokens.color['gray-past']))).toBeLessThan(15);
  });

  test('흰 글자 대비가 WCAG AA(4.5:1) 이상이다', () => {
    for (const key of ['primary', 'warn', 'danger', 'done']) {
      expect(contrast(tokens.color[key], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('타이포 토큰 — AD-070 가독성 정본 / 47-staff-density', () => {
  test('[AD-070] 폰트 크기 위계 토큰 5종 (레거시 sm/base/lg/xl은 G3 타이포 롤아웃 2026-08-30으로 제거)', () => {
    expect(tokens.fontSize).toMatchObject({
      num: '20px', caption: '0.75rem', body: '0.875rem', section: '1rem', title: '1.25rem',
    });
    // 레거시 px 토큰은 tokens.json에서도 제거됐다 — 남아 있으면 생성기가 되살려 「전 화면 0건」 이관이 무너진다.
    expect(tokens.fontSize.sm).toBeUndefined();
    expect(tokens.fontSize.base).toBeUndefined();
  });

  test('스페이싱 4px 스케일 토큰 (2026-08-30 신설 — 공용 여백 어휘)', () => {
    expect(tokens.spacing).toMatchObject({
      '0-5': '2px', '1': '4px', '2': '8px', '3': '12px', '4': '16px', '5': '20px', '6': '24px', '8': '32px',
    });
  });

  test('직원 웹 확정값 — 본문13 / 이름14·800 / 시각15·800 / 행44 / 셀여백11 / 버튼36', () => {
    expect(tokens.staffWeb).toMatchObject({
      body: '13px', name: { size: '14px', weight: 800 },
      time: { size: '15px', weight: 800, fontVariantNumeric: 'tabular-nums' },
      rowHeight: '44px', cellPadding: '11px', clickTarget: '36px',
    });
  });

  test('환자 앱 확정값 — 본문16(전역 ×17/16 스케일러=실효17) / 시각17·800 / 터치목표 44px', () => {
    // 같은 원본에서 두 플랫폼이 나온다. 값을 각자 적으면 한쪽만 고쳐진다.
    // body 16px = 세션16 폰트배율 리팩터(app.dart 전역 textScaler ×17/16). naive 16 유지(이중배율 방지).
    expect(tokens.patientApp).toMatchObject({
      body: '16px', time: { size: '17px', weight: 800 }, clickTarget: '44px',
    });
  });

  test('본문·역할 구분은 Pretendard 굵기·크기로만 (보조 본문 서체 금지)', () => {
    expect(tokens.fontFamily).toContain('Pretendard');
    // 본문/UI 텍스트에 두 번째 서체를 도입하지 않는다. 로고 워드마크(logoFont)는 아래 별도 예외.
    expect(Object.keys(tokens).filter((k) => /secondaryFont|displayFont/.test(k))).toHaveLength(0);
  });

  test('로고 워드마크 전용 서체 Do Hyeon — 병원 이름 로고에만 (2026-08-24 데모 정합)', () => {
    // 결정로그 §타이포 「예외 1건」. 본문·표·버튼엔 안 쓰고 브랜드 마크 1곳에만.
    expect(tokens.logoFont).toContain('Do Hyeon');
    // 로고 서체 미로딩 시에도 병원명이 읽히도록 Pretendard 폴백을 포함한다.
    expect(tokens.logoFont).toContain('Pretendard');
  });
});

describe('레이아웃 토큰 — 결정로그 §레이아웃 + AD-070', () => {
  test('모서리 12px · 그림자 거의 없음', () => {
    expect(tokens.radius.card).toBe('12px');
    expect(tokens.shadow.card).toBe('0 1px 2px rgba(16,36,58,.10)');
  });

  test('[AD-070] 쉘 사이드바 240px · 폭 1440 기준 / 1280 최소 · 분기점 1280', () => {
    expect(tokens.layout).toMatchObject({
      sidebarWidth: '240px', canvasWidth: '1440px',
      minWidth: '1280px', breakpoint: '1280px',
    });
  });
});

describe('의사 색 팔레트 — CAL-COLOR-09·11', () => {
  test('[CAL-COLOR-11] 정확히 10색이다', () => {
    expect(tokens.doctorPalette).toHaveLength(10);
  });

  test('[CAL-COLOR-09] 색값이 아니라 인덱스로 참조한다 — 토큰 이름이 순번이다', () => {
    const css = buildCss('staff-web');
    for (let i = 0; i < 10; i++) expect(css).toContain(`--doctor-palette-${i}:`);
  });

  test('[CAL-COLOR-02] 팔레트 색끼리 충분히 떨어져 있다', () => {
    // ⚠️ hue(색상)만 보면 안 된다 — 명도·채도가 달라도 색상이 같으면 통과해 버린다.
    //    지각 거리 ΔE(CIE L*a*b*)로 잰다. 24 이상이면 나란히 놓고 구별된다.
    for (let i = 0; i < 10; i++)
      for (let j = i + 1; j < 10; j++)
        expect(deltaE(tokens.doctorPalette[i].ink, tokens.doctorPalette[j].ink))
          .toBeGreaterThanOrEqual(24);
  });

  test('[CAL-COLOR-13] 앞 번호부터 서로 멀다 — 자동 배정 순서에 뜻이 있다', () => {
    // CAL-COLOR-03이 0번부터 차례로 준다. 색상 순으로 정렬하면 1·2번이 가장 닮은 색이 된다.
    // 의사 5명까지는 특히 잘 갈려야 한다(대부분의 병원이 이 범위).
    const five = tokens.doctorPalette.slice(0, 5).map(p => p.ink);
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++) expect(deltaE(five[i], five[j])).toBeGreaterThanOrEqual(30);
  });

  test('[CAL-COLOR-15] 어느 팔레트 색도 상태색과 헷갈리지 않는다', () => {
    // ⚠️ 실제로 걸렸던 지점 — 처음 고른 주황이 warn과 ΔE 9.3(사실상 같은 색)이었다.
    //    그대로 갔으면 그 의사 열 전체가 「확인 필요」로 오독된다.
    for (const { ink } of tokens.doctorPalette)
      for (const k of ['warn', 'danger', 'primary'])
        expect(deltaE(ink, tokens.color[k])).toBeGreaterThanOrEqual(20);
  });

  test('[CAL-COLOR-14] 면 위의 글자가 읽힌다 — 대비 4.5:1 이상', () => {
    // 블록은 fill(면) 위에 ink(글자)를 얹는다. 이 짝이 깨지면 10분 예약에서 이름이 뭉갠다.
    for (const { ink, fill } of tokens.doctorPalette)
      expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('생성물 — 단일 원본에서 플랫폼 파일을 만든다', () => {
  test('CSS 변수로 전 토큰이 나온다', () => {
    const css = buildCss('staff-web');
    for (const key of Object.keys(tokens.color)) expect(css).toContain(`--color-${key}:`);
    for (const key of Object.keys(tokens.fontSize)) expect(css).toContain(`--fs-${key}:`);
  });

  test('생성물은 직접 편집을 금지한다는 머리말을 갖는다', () => {
    expect(buildCss('staff-web')).toMatch(/생성된 파일.*편집하지 않는다/);
  });

  test('체크인된 tokens.css가 생성기 출력과 일치한다(수동 편집 감지)', () => {
    const onDisk = readFileSync(new URL('../../frontend/src/styles/tokens.css', import.meta.url), 'utf8');
    expect(onDisk).toBe(buildCss('staff-web'));
  });

  test('환자 앱 Dart 토큰이 같은 원본에서 나온다 — 값·형식 (DISP-* 12)', () => {
    const dart = buildDart();
    // 규칙이 못박은 값: 회색 두 진하기 · 카드 높이 · 주의 바 폭.
    expect(dart).toContain('grayPending = Color(0xFF7E8E99)'); // patientApp.grayPending
    expect(dart).toContain('grayDone = Color(0xFFA3AFB8)');    // color.gray-past 재사용
    expect(dart).toContain('warn = Color(0xFFB44E00)');        // color.warn 통일(별도 오렌지 신설 안 함)
    expect(dart).toContain('cardBodyHeight = 132.0');
    expect(dart).toContain('warnBarWidth = 4.0');
    expect(dart).toMatch(/생성된 파일 — 편집하지 않는다/);
  });

  test('직원 웹 CSS는 환자 앱 토큰을 방출하지 않는다 — 토큰이 늘어도 직원 웹 무영향', () => {
    // 환자 앱 전용 값(grayPending·cardBodyHeight)이 직원 웹 tokens.css에 새면 색이 바뀐 것.
    const css = buildCss('staff-web');
    expect(css).not.toMatch(/patientApp|grayPending|cardBodyHeight|warnBarWidth/);
  });

  test('체크인된 tokens.dart가 생성기 출력과 일치한다(수동 편집 감지)', () => {
    const onDisk = readFileSync(new URL('../../patient_app/lib/core/tokens.dart', import.meta.url), 'utf8');
    expect(onDisk).toBe(buildDart());
  });
});

describe('하드코딩 차단 — 결정로그 구현 주석 「lint/CI로 막는다」', () => {
  test('토큰 밖 색상값을 잡는다', () => {
    expect(lintSource('a.css', '.row { color: #123456; }')).toHaveLength(1);
    expect(lintSource('a.css', '.row { color: rgb(1,2,3); }')).toHaveLength(1);
  });

  test('[AD-070] 새 색 토큰 정의도 잡는다', () => {
    expect(lintSource('a.css', ':root { --color-mine: #0B6E70; }')).toHaveLength(1);
  });

  test('토큰 참조는 통과시킨다', () => {
    expect(lintSource('a.css', '.row { color: var(--color-ink); }')).toHaveLength(0);
  });

  test('생성물 자신은 검사에서 제외한다(원본이므로)', () => {
    expect(lintSource('frontend/src/styles/tokens.css', ':root { --color-ink: #10243A; }')).toHaveLength(0);
  });

  test('[DISP-ICON-03] 소스의 이모지를 잡는다 — 아이콘은 채움 벡터만 쓴다', () => {
    expect(lintSource('a.tsx', 'const icon = "🔔";')).toHaveLength(1);
  });
});
