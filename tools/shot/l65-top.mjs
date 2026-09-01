import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' }, args: ['--window-size=1600,1000','--no-sandbox'], defaultViewport: { width: 1600, height: 1000 } })
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inputs = await page.$$('input'); await inputs[0].type('doctor1@gaon.local'); await inputs[1].type('demo1234'); await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/doctor/console', { waitUntil: 'networkidle2' }); await sleep(2500)
const row = await page.$('[aria-label="오늘 진료 대기"] li button'); if (row) { await row.click(); await sleep(2500) }
const box = await page.evaluate(() => { const e = document.querySelector('[data-col="context"]'); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width } })
await page.screenshot({ path: `${process.env.S}/shot/l65-real-top.png`, clip: { x: box.x, y: box.y, width: box.w, height: 620 } })
console.log('ok', JSON.stringify(box))
await browser.close()
