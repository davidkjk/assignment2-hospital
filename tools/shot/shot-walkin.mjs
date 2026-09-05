// D3 후반 대조 — 접수 문의 「예약 없이 오신 분」(당일 방문).
// 1) 한 화면 세 줄 2) 실 대기 인원 의사 목록 3) 오신 시각 「지난 시각」 4) 저장 직전 확인
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] ?? 'real'
const NAME = process.argv[3] ?? '김지민'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  // ⭐ 창구 PC의 시계 = 병원 시계다. 서버는 `Asia/Seoul`로 못박혀 있는데(backend/app/db/pool.py)
  //    이 맥은 미 서부라, 그대로 띄우면 **화면은 어제·타일은 오늘**이 되어 대조가 거짓이 된다.
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const shot = (n) => page.screenshot({ path: `${process.env.S}/${OUT}-walk-${n}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = async (sel, ...texts) => {
  const h = await page.evaluateHandle((s, t) =>
    [...document.querySelectorAll(s)].find((b) => t.includes(b.textContent.trim())), sel, texts)
  const el = h.asElement()
  if (!el) throw new Error(`못 찾음: ${sel} / ${texts}`)
  await el.click()
}

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inputs = await page.$$('input')
await inputs[0].type('reception@gaon.local')
await inputs[1].type('demo1234')
await page.keyboard.press('Enter')
await sleep(3500)

await clickText('header button', '접수')
await sleep(700)
await clickText('aside button', '예약 없이 오신 분')
await sleep(500)
await shot('01-one-screen')

// ① 환자 — 왼쪽이 정본 검색 부품으로 바뀐다
await clickText('aside button', '환자를 찾아 고르세요')
await sleep(500)
const box = await page.$('input[aria-label="환자 검색"]')
await box.type(NAME)
await page.keyboard.press('Enter')
await sleep(1800)
await shot('02-search')
const row = await page.evaluateHandle((n) =>
  [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === `${n} 선택`), NAME)
await row.asElement().click()
await sleep(800)

// ② 의사 — 실 대기 인원
await clickText('aside button', '덜 기다리는 의사로 배정하세요')
await sleep(1500)
await shot('03-doctors')
const doc = await page.evaluateHandle(() =>
  [...document.querySelectorAll('aside button')].find((b) => /대기 (\d+명|없음)$/.test(b.textContent.trim())))
await doc.asElement().click()
await sleep(700)

// ③ 오신 시각 — 「지난 시각 — 오늘」
const radios = await page.$$('input[name="walkin-when"]')
await radios[1].click()
await sleep(400)
const t = await page.$('input[aria-label="방문한 시각"]')
await t.type('905')
await sleep(500)
await shot('04-visit-time')

// ④ 저장 직전 확인 — 「지금」으로 되돌려 연다(이 맥은 KST가 아니라 09:05가 미래로 잡힌다)
await radios[0].click()
await sleep(400)
await clickText('aside button', '진료 대기로 접수')
await sleep(700)
await shot('05-confirm')

// ⑤ 실제 저장 — 확인창 안의 [접수](헤더 문 버튼과 이름이 겹치므로 창 안에서 찾는다)
if (process.argv[4] === 'save') {
  const ok = await page.evaluateHandle(() =>
    [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === '접수'))
  await ok.asElement().click()
  await sleep(2500)
  await shot('06-saved')
}
await browser.close()
console.log('done')
