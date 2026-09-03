import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.env.OUT || '/tmp/demo-patient-home.png'
const URL = process.argv[2] || 'http://localhost:5175/home'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=900,1600', '--no-sandbox'],
  defaultViewport: { width: 900, height: 1600, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
await page.goto(URL, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
console.log('URL:', page.url())
// 앱 콘텐츠(폰 프레임 안의 home-screen)만 잘라 찍는다.
const el = await page.$('[data-testid="home-screen"]')
if (el) { await el.screenshot({ path: OUT }); console.log('cropped home-screen →', OUT) }
else { await page.screenshot({ path: OUT }); console.log('full page →', OUT) }
await browser.close()
