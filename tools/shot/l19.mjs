import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' }, args: ['--window-size=1600,900','--no-sandbox'], defaultViewport: { width: 1600, height: 900 } })
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inputs = await page.$$('input'); await inputs[0].type('admin@gaon.local'); await inputs[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3000)
await page.goto('http://localhost:5173/admin/access-logs', { waitUntil: 'networkidle2' }); await sleep(2000)
await page.screenshot({ path: `${process.env.S}/shot/l19-access-top.png` })
await browser.close()
