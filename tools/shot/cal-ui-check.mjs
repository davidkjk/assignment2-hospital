import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = '/Users/kimjunkee/dev/vcu/assignment2-hospital/tools/shot/shot'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1500,1000', '--no-sandbox'], defaultViewport: { width: 1500, height: 1000 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(2000)
// 내일로 이동(빈 슬롯 확보)
const arrows = await page.$$('.cal-nav-arrow'); await arrows[arrows.length - 1].click(); await sleep(1500)

// 칩 색점 클로즈업
await page.screenshot({ path: OUT + '/ui-1-chips.png', clip: { x: 230, y: 120, width: 1000, height: 40 } })

// (A) 예약 블록 클릭 → 예약 상세 패널
const block = await page.$('.cal-slot.is-filled')
if (block) {
  await block.click(); await sleep(1200)
  await page.screenshot({ path: OUT + '/ui-2-detail-panel.png', fullPage: false })
  const title = await page.evaluate(() => document.querySelector('aside[aria-label="패널"] header')?.textContent ?? null)
  console.log('상세 패널 머리:', title)
  // 닫기
  const closeBtn = await page.$$('aside[aria-label="패널"] header button')
  if (closeBtn[1]) { await closeBtn[1].click(); await sleep(600) }
}

// (B) 빈 슬롯 클릭 → 예약 패널
const cols = await page.$$('.cal-column')
let opened = false
for (const c of cols) {
  const dotted = await c.evaluateHandle((col) => {
    for (const pos of col.querySelectorAll('.cal-slot-pos[role="button"]')) if (pos.querySelector('.cal-slot.is-dotted')) return pos
    return null
  })
  const el = dotted.asElement()
  if (el) { const b = await el.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + 30); opened = true; break }
}
await sleep(1200)
const bookTitle = await page.evaluate(() => document.querySelector('aside[aria-label="패널"] header')?.textContent ?? null)
console.log('예약 패널 머리:', bookTitle, '| 열렸나:', opened)
await page.screenshot({ path: OUT + '/ui-3-booking-panel.png', fullPage: false })
await browser.close()
