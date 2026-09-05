import puppeteer from 'puppeteer-core'

// 오늘의 현황 — 날짜 제거 + 이름·생일 한 줄 확인.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1500,1200', '--no-sandbox'], defaultViewport: { width: 1500, height: 1200 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inp = await page.$$('input')
await inp[0].type('reception@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/today', { waitUntil: 'networkidle2' })
await sleep(2200)
await page.screenshot({ path: `${S}/shot/g3-today-after.png`, fullPage: true })
console.log('today:', page.url())
await browser.close()
