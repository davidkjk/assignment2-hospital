import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  // ⭐ 창구 PC의 시계 = 병원 시계다. 서버는 `Asia/Seoul`로 못박혀 있는데(backend/app/db/pool.py)
  //    이 맥은 미 서부라, 그대로 띄우면 **화면은 어제·타일은 오늘**이 되어 대조가 거짓이 된다.
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const shot = (n) => page.screenshot({ path: `${process.env.S}/shot/${OUT}-admin-${n}.png` })
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
console.log('URL:', page.url())
await shot('01-today')

// 세 문 열기 — 등록 / 접수 / 예약
const labels = OUT === 'real' ? ['등록', '접수', '예약'] : ['등록', '접수', '예약']
for (const [i, label] of labels.entries()) {
  const btn = await page.evaluateHandle((t) => {
    const bs = [...document.querySelectorAll('header button')]
    return bs.find((b) => b.textContent.trim() === t || b.textContent.trim().endsWith(t))
  }, label)
  const el = btn.asElement()
  if (!el) { console.log('버튼 못 찾음:', label); continue }
  await el.click()
  await sleep(900)
  await shot(`0${i + 2}-door-${['register', 'checkin', 'reserve'][i]}`)
}
await browser.close()
