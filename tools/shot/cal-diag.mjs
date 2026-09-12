import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1200', '--no-sandbox'], defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(2000)
// 주간
const btns = await page.$$('button')
for (const b of btns) { const t = await (await b.getProperty('textContent')).jsonValue(); if (t && t.trim() === '주간') { await b.click(); await sleep(1500); break } }

const info = await page.evaluate(() => {
  const grid = document.querySelector('.cal-week-grid')
  const days = [...document.querySelectorAll('.cal-week-day')]
  const out = { gridClientW: grid?.clientWidth, gridScrollW: grid?.scrollWidth, days: [] }
  for (const d of days) {
    const cols = d.querySelector('.cal-columns')
    const cs = cols ? getComputedStyle(cols) : null
    const firstCol = d.querySelector('.cal-column')
    const fcs = firstCol ? getComputedStyle(firstCol) : null
    out.days.push({
      dayW: Math.round(d.getBoundingClientRect().width),
      colsW: cols ? Math.round(cols.getBoundingClientRect().width) : null,
      colsMinW: cs?.minWidth,
      colCount: d.querySelectorAll('.cal-column').length,
      firstColW: firstCol ? Math.round(firstCol.getBoundingClientRect().width) : null,
      firstColFlex: fcs?.flex, firstColMinW: fcs?.minWidth, firstColWidth: fcs?.width, firstColShrink: fcs?.flexShrink,
    })
  }
  return out
})
console.log(JSON.stringify(info, null, 2))
// 예약 블록(.cal-slot.is-filled) 실제 폭·위치
const blocks = await page.evaluate(() => {
  return [...document.querySelectorAll('.cal-slot.is-filled')].slice(0, 8).map((b) => {
    const r = b.getBoundingClientRect()
    return { text: b.textContent.slice(0, 20), x: Math.round(r.x), w: Math.round(r.width) }
  })
})
console.log('BLOCKS', JSON.stringify(blocks))
await page.screenshot({ path: process.env.S + '/shot/cal-diag-week.png', fullPage: false })
await browser.close()
