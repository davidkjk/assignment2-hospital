// ⭐ 「지금·오늘」을 기계 시계로 읽는 자리를 찾아낸다 — 병원 시계는 `lib/clock.ts` 하나뿐이다.
//    이 병은 테스트로는 안 잡힌다: 개발자의 기계가 한국이면 몇 달간 안 보이고,
//    창구 PC 시계가 틀어진 병원에서만 조용히 하루가 어긋난다.
//
// 실행: node scripts/lint-clock.mjs src   (= npm run lint:clock)
// 일부러 기계 시계를 써야 하는 줄에는 `// clock-ok` 주석을 같은 줄에 단다.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] ?? 'src'
// 병원 시계 창구 자신과, 시간대를 일부러 다루는 그 테스트만 예외다.
const ALLOW = new Set(['src/lib/clock.ts', 'src/lib/clock.test.ts'])

// Date에서 **로컬 달력 조각**을 꺼내는 읽기 — 이것이 시간대 질문이다.
const LOCAL_PARTS = /\.(getHours|getMinutes|getFullYear|getMonth|getDate|getDay|getTimezoneOffset)\s*\(/
// Intl에 timeZone을 안 준 것 — 기본값이 그 기계의 시간대다.
const INTL_NO_TZ = /new Intl\.DateTimeFormat\((?![^)]*timeZone)/
// 시간대 상수의 두 번째 사본.
const TZ_COPY = /['"]Asia\/Seoul['"]/
// 타임존 없는 ISO 리터럴 — `new Date('2026-08-17T09:00:00')`은 **로컬 파싱**이라
// 기계에 따라 다른 순간이 된다(테스트가 이걸로 여러 번 깨졌다).
const NAKED_ISO = /new Date\(\s*['"]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?['"]\s*\)/

const hits = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p)
      continue
    }
    if (!/\.tsx?$/.test(p)) continue
    const rel = relative('.', p)
    if (ALLOW.has(rel)) continue

    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trimStart()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      if (line.includes('clock-ok')) return
      const why =
        LOCAL_PARTS.test(line) ? '기계 달력 조각'
        : INTL_NO_TZ.test(line) ? 'timeZone 없는 Intl'
        : TZ_COPY.test(line) ? '시간대 상수 사본'
        : NAKED_ISO.test(line) ? '타임존 없는 ISO 리터럴'
        : null
      if (why) hits.push(`${rel}:${i + 1} [${why}] ${line.trim().slice(0, 88)}`)
    })
  }
}

walk(ROOT)

if (hits.length > 0) {
  console.error(`병원 시계를 안 쓰는 자리 ${hits.length}건 — lib/clock.ts의 창구를 쓰세요.`)
  console.error('  (일부러 기계 시계를 써야 하면 그 줄에 `// clock-ok`을 답니다.)\n')
  for (const h of hits) console.error('  ' + h)
  process.exit(1)
}
console.log('병원 시계 검사 통과')
