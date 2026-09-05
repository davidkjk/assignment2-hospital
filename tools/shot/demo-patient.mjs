import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const B = 'http://localhost:5175'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=520,2600', '--no-sandbox'],
  defaultViewport: { width: 520, height: 2600, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
// 카드 갤러리(모든 상태)
await page.goto(B + '/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const btn = await page.$('[data-testid="qa-gallery-entry"]')
if (btn) { await btn.click(); await sleep(1800) }
console.log('cards url:', page.url())
await page.screenshot({ path: `${process.env.S}/shot/demo-cards.png`, fullPage: true })
// 홈: 로그인 버튼으로 진입 시도
await page.goto(B + '/login', { waitUntil: 'networkidle2' }); await sleep(800)
const login = await page.$$('button')
for (const b of login) { const t = await page.evaluate(e=>e.textContent, b); if (t && t.includes('로그인')) { await b.click(); break } }
await sleep(1800)
console.log('home url:', page.url())
await page.screenshot({ path: `${process.env.S}/shot/demo-home.png`, fullPage: true })
await browser.close()
