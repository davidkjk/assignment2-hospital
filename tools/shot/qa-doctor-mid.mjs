import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const shot = (n) => page.screenshot({ path: `${process.env.S}/shot/${OUT}-${n}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('doctor1@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
  await page.goto('http://localhost:5173/doctor/console', { waitUntil: 'networkidle2' })
  await sleep(2500)
  const row = await page.$('[aria-label="오늘 진료 대기"] li button')
  if (row) { await row.click(); await sleep(2500) }
} else {
  await page.goto('https://demo-pi-inky-72.vercel.app/staff/doctor/console', { waitUntil: 'networkidle2' })
  await sleep(2500)
  const row = await page.$('[data-testid="doctor-console"] aside button')
  if (row) { await row.click(); await sleep(1500) }
}
console.log('URL:', page.url())
await shot('mid-selected')
await browser.close()
