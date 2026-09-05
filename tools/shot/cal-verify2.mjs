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
const arrows = await page.$$('.cal-nav-arrow'); await arrows[arrows.length - 1].click(); await sleep(1500)

// 빈 슬롯 호버 → 캡슐만, 전체 채움 없음
const cols = await page.$$('.cal-column')
for (const c of cols) {
  const dotted = await c.evaluateHandle((col) => {
    for (const pos of col.querySelectorAll('.cal-slot-pos[role="button"]')) {
      const s = pos.querySelector('.cal-slot.is-dotted')
      if (s && pos.getBoundingClientRect().height > 80) return pos // 큰 빈 구간
    }
    return null
  })
  const el = dotted.asElement()
  if (el) {
    const b = await el.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await sleep(500)
    await page.screenshot({ path: OUT + '/ui-4-hover.png', clip: { x: Math.max(0, b.x - 30), y: Math.max(0, b.y - 20), width: 340, height: Math.min(300, b.height + 40) } })
    break
  }
}

// 단일 의사 주간 — 이정민 칩 → 주간
const nameChips = await page.$$('.cal-name-chips .cal-chip')
if (nameChips[1]) { await nameChips[1].click(); await sleep(800) }
const btns = await page.$$('button')
for (const bb of btns) { const t = await (await bb.getProperty('textContent')).jsonValue(); if (t && t.trim() === '주간') { await bb.click(); await sleep(1500); break } }
await page.screenshot({ path: OUT + '/ui-5-week-single.png', fullPage: false })
await browser.close()
console.log('done')
