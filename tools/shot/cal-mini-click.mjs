import puppeteer from 'puppeteer-core'

// 미니캘린더에서 9월 날짜 클릭 → 메인 캘린더가 그 주로 이동하는지 확인.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1500,1100', '--no-sandbox'], defaultViewport: { width: 1500, height: 1100 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(2000)

const before = await page.$eval('.cal-nav-range', (e) => e.textContent)
console.log('열기 전 기간:', before.trim())
await page.click('.cal-nav-range'); await sleep(800)
// 미니 격자에서 다른 달(is-other-month 아님)의 미래 날짜 하나 클릭 — 9월 15 근처
const cells = await page.$$('.cal-mini button')
console.log('미니 날짜 셀 수:', cells.length)
// 텍스트가 "15"이고 클릭 가능한(disabled 아님) 셀 찾기(9월 15)
let clicked = false
for (const c of cells) {
  const t = (await (await c.getProperty('textContent')).jsonValue())?.trim()
  const dis = await (await c.getProperty('disabled')).jsonValue()
  if (t === '15' && !dis) { await c.click(); clicked = true; break }
}
await sleep(1200)
const after = await page.$eval('.cal-nav-range', (e) => e.textContent)
console.log('클릭:', clicked, '/ 이동 후 기간:', after.trim())
console.log('이동 발생?', before.trim() !== after.trim())
await browser.close()
