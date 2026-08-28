import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' }, // 창구 PC 시계 = 병원 시계(Asia/Seoul)
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const shot = (n) => page.screenshot({ path: `${process.env.S}/shot/${OUT}-${n}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 실은 /calendar, 데모는 /staff/calendar.
const base = OUT === 'real' ? 'http://localhost:5173' : 'https://demo-pi-inky-72.vercel.app/staff'

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
}

await page.goto(`${base}/calendar`, { waitUntil: 'networkidle2' })
await sleep(2500)
console.log('URL:', page.url())
await shot('calendar-day')
await browser.close()
