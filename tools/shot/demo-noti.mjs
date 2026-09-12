import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const B = 'http://localhost:5175'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=420,1200', '--no-sandbox'],
  defaultViewport: { width: 420, height: 1200, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
await page.goto(B + '/notifications', { waitUntil: 'networkidle2' }); await sleep(1500)
console.log('url:', page.url())
await page.screenshot({ path: `${process.env.S}/shot/demo-notifications.png`, fullPage: true })
await browser.close()
