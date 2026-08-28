// D3 대조 — 접수 문의 「예약 확인」 갈래. 1) 초기 2) 없는 번호 3) 유효 예약(실 시드의 예약번호)
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2]
const CODE = process.argv[3] // real일 때 쓸 유효 예약번호
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const shot = (n) => page.screenshot({ path: `${process.env.S}/${OUT}-chk-${n}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
} else {
  await page.goto('https://demo-pi-inky-72.vercel.app/staff/today', { waitUntil: 'networkidle2' })
  await sleep(2500)
}

const h = await page.evaluateHandle(() =>
  [...document.querySelectorAll('header button')].find((b) => b.textContent.trim().endsWith('접수')))
await h.asElement().click()
await sleep(800)
await shot('01-initial')

const type = async (v) => {
  const input = await page.$('aside input')
  await input.click({ clickCount: 3 })
  await input.type(v)
  const find = await page.evaluateHandle(() =>
    [...document.querySelectorAll('aside button')].find((b) => ['찾기', '예약번호로 찾기'].includes(b.textContent.trim())))
  await find.asElement().click()
  await sleep(1500)
}
await type('ZZ99ZZ')
await shot('02-notfound')
await type(OUT === 'real' ? CODE : 'K3M7P9')
await shot('03-found')
await browser.close()
