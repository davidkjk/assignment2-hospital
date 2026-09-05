import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S

async function login(user) {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1000)
  // 로그아웃 상태 보장 위해 localStorage 비우고 다시
  const inputs = await page.$$('input')
  await inputs[0].type(user)
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
}

// 1) 의사 콘솔 — 가운데 열 좌우 구분선(회색 두 줄이 사라졌는지)
await login('doctor1@gaon.local')
await page.goto('http://localhost:5173/doctor/console', { waitUntil: 'networkidle2' })
await sleep(2500)
const drow = await page.$('[aria-label="오늘 진료 대기"] li button')
if (drow) { await drow.click(); await sleep(2500) }
await page.screenshot({ path: `${S}/shot/now-fix-console.png` })
console.log('console ->', page.url())

// 로그아웃
await page.evaluate(() => { try { localStorage.clear() } catch {} })

// 2) 오늘의 현황 — 장기 대기 레일(예약시각) + 우측 「N분 대기」
await login('admin@gaon.local')
await page.goto('http://localhost:5173/today', { waitUntil: 'networkidle2' })
await sleep(2500)
const lw = await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll('*')).find(
    (el) => el.textContent && /장기 대기/.test(el.textContent) && el.querySelector && el.querySelector('[data-testid^="longwait-row-"]'))
  const rows = card ? Array.from(card.querySelectorAll('[data-testid^="longwait-row-"]')) : []
  return rows.slice(0, 3).map((r) => r.innerText.replace(/\n+/g, ' | '))
})
console.log('--- LONGWAIT ROWS ---')
console.log(lw.join('\n') || '(장기 대기 카드 없음)')
await page.screenshot({ path: `${S}/shot/now-fix-today.png` })

// 3) 대기 목록 전체 탭 — 진료대기 행 버튼 잘림 여부
await page.goto('http://localhost:5173/queue?tab=total', { waitUntil: 'networkidle2' })
await sleep(2500)
const clip = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[data-testid^="queue-row-"]'))
  // 진료 대기(sky) 배지가 있는 행을 찾는다
  const target = rows.find((r) => /진료 대기/.test(r.innerText)) || rows[0]
  if (!target) return null
  const detail = Array.from(target.querySelectorAll('button')).find((b) => /환자 상세/.test(b.textContent))
  const card = target.closest('.overflow-hidden') || target.parentElement
  const cr = card.getBoundingClientRect()
  const dr = detail ? detail.getBoundingClientRect() : null
  return {
    rowText: target.innerText.replace(/\n+/g, ' | '),
    cardRight: Math.round(cr.right),
    detailRight: dr ? Math.round(dr.right) : null,
    detailClipped: dr ? dr.right > cr.right + 0.5 : 'no-detail-btn',
    y: Math.round(target.getBoundingClientRect().y),
  }
})
console.log('--- QUEUE 진료대기 ROW ---')
console.log(JSON.stringify(clip, null, 2))
if (clip) await page.screenshot({ path: `${S}/shot/now-fix-queue.png` })
await browser.close()
