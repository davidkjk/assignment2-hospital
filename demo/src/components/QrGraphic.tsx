// 데모용 QR 그래픽 — 실제로 스캔되는 코드는 아니지만, 모서리 인식패턴 + 타이밍 + 촘촘한
// 데이터 모듈로 '진짜 QR처럼' 보이게 그린다. 같은 값이면 같은 모양(booking_code로 시드).

const N = 21 // QR v1 모듈 수
const QUIET = 2 // 조용한 여백(모듈 단위)

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return h >>> 0
}

// 인식패턴(7x7)·분리자(8x8) 영역인지 — 데이터 모듈에서 제외한다.
function isReserved(r: number, c: number) {
  const inFinder = (fr: number, fc: number) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7
  const inSep = (fr: number, fc: number) => r >= fr - 1 && r <= fr + 7 && c >= fc - 1 && c <= fc + 7
  return (
    inSep(0, 0) ||
    inSep(0, N - 7) ||
    inSep(N - 7, 0) ||
    inFinder(0, 0) ||
    inFinder(0, N - 7) ||
    inFinder(N - 7, 0) ||
    r === 6 ||
    c === 6 // 타이밍 라인
  )
}

export function QrGraphic({ value, className = 'h-full w-full' }: { value: string; className?: string }) {
  const rng = mulberry32(hash(value))
  const cells: { x: number; y: number }[] = []

  // 데이터 모듈(약 48% 밀도)
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (isReserved(r, c)) continue
      if (rng() < 0.48) cells.push({ x: c + QUIET, y: r + QUIET })
    }
  }
  // 타이밍 라인(교차)
  for (let i = 8; i < N - 8; i++) {
    if (i % 2 === 0) {
      cells.push({ x: 6 + QUIET, y: i + QUIET })
      cells.push({ x: i + QUIET, y: 6 + QUIET })
    }
  }

  const size = N + QUIET * 2
  const finders: [number, number][] = [
    [0, 0],
    [0, N - 7],
    [N - 7, 0],
  ]

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" role="img" aria-label="접수용 QR 코드">
      <rect width={size} height={size} fill="#FFFFFF" />
      {cells.map((m, i) => (
        <rect key={i} x={m.x} y={m.y} width={1} height={1} fill="#0F172A" />
      ))}
      {finders.map(([fr, fc], i) => (
        <g key={`f${i}`} fill="#0F172A">
          {/* 외곽 7x7 + 흰 5x5 + 검정 3x3 */}
          <rect x={fc + QUIET} y={fr + QUIET} width={7} height={7} />
          <rect x={fc + QUIET + 1} y={fr + QUIET + 1} width={5} height={5} fill="#FFFFFF" />
          <rect x={fc + QUIET + 2} y={fr + QUIET + 2} width={3} height={3} />
        </g>
      ))}
    </svg>
  )
}
