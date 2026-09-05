import puppeteer from 'puppeteer-core'

// G3 배치5(messages군) 눈대조 — 안내 보내기(목록·보내기 패널·받는사람·채널·실패목록).
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1300', '--no-sandbox'], defaultViewport: { width: 1600, height: 1300 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inp = await page.$$('input')
await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)

await page.goto('http://localhost:5173/messages', { waitUntil: 'networkidle2' })
await sleep(2200)
await page.screenshot({ path: `${S}/shot/g3b5-after-messages.png`, fullPage: true })
console.log('messages:', page.url())
await browser.close()
