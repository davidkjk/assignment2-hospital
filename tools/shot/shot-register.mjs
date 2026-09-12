// D2 대조용 일회성 스크립트 — 등록 문의 신원 폼을 채운 뒤 세 장면을 찍는다.
//   1) 빈 폼  2) 소프트 중복이 뜬 상태  3) 확인창
// 실행: S=<출력경로> node shot-register.mjs real   /   ... demo
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2]
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  // ⭐ 창구 PC의 시계 = 병원 시계다. 서버는 `Asia/Seoul`로 못박혀 있는데(backend/app/db/pool.py)
  //    이 맥은 미 서부라, 그대로 띄우면 **화면은 어제·타일은 오늘**이 되어 대조가 거짓이 된다.
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const shot = (n) => page.screenshot({ path: `${process.env.S}/${OUT}-reg-${n}.png` })
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

const clickHeader = async (t) => {
  const h = await page.evaluateHandle((t) => {
    const bs = [...document.querySelectorAll('header button')]
    return bs.find((b) => b.textContent.trim() === t || b.textContent.trim().endsWith(t))
  }, t)
  await h.asElement().click()
}
await clickHeader('등록')
await sleep(700)
await shot('01-empty')

// 실 = 시드에 있는 강지민(1949-08-09 / 010-5662-7678) / 데모 = 데모 가짜값
// real은 시드가 다시 깔릴 때마다 값이 바뀐다 — 인자로 받는다: node shot-register.mjs real 19780115 010-2924-3756
const who = OUT === 'real'
  ? { birth: process.argv[3], tel: process.argv[4] }
  : { birth: '19580312', tel: '010-1234-5678' }

const fields = await page.$$('aside input')
await fields[0].type('테스트등록')
const sexBtn = await page.evaluateHandle(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === '여'))
await sexBtn.asElement().click()
await fields[1].type(who.birth)
await fields[2].type(who.tel)
await sleep(1500)
await shot('02-duplicate')

const submit = await page.evaluateHandle(() => [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === '새 환자 등록'))
await submit.asElement().click()
await sleep(700)
await shot('03-confirm')
await browser.close()
