// D4 대조 — 예약 문(전화예약). 왼쪽이 칸마다 변신하는 것이 이 문의 핵심이다(PANEL-WORK-02).
// ① 환자 검색 ② 실 로스터 의사 목록 ③ 그 의사의 **실제** 하루 캘린더 ④ 작은 달력(달 이동)
// ⑤ 시각 찍기(자리표) ⑥ 저장 직전 확인.  인자: [out] [환자이름] [save]
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
const shot = (n) => page.screenshot({ path: `${process.env.S}/${OUT}-book-${n}.png` })
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

// ① 문을 열면 왼쪽이 환자 검색으로 (SHELL-DOOR-02 · PANEL-WORK-01)
await clickText('header button', '예약')
await sleep(900)
await shot('01-open')

const box = await page.$('input[aria-label="환자 검색"]')
await box.type(NAME)
await page.keyboard.press('Enter')
await sleep(1800)
const row = await page.evaluateHandle((n) =>
  [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === `${n} 선택`), NAME)
if (!row.asElement()) throw new Error(`환자 못 찾음: ${NAME}`)
await row.asElement().click()
await sleep(900)
await shot('02-patient-picked')

// ② 의사 목록 — 실 로스터(GET /calendar 카탈로그) + 오늘이라 대기 인원이 붙는다
await clickText('aside button', '의사를 고르세요')
await sleep(1600)
await shot('03-doctors')
const doc = await page.evaluateHandle(() =>
  [...document.querySelectorAll('aside button')].find((b) => /선생님|대기/.test(b.textContent) === false && b.querySelector('span[style*="doctor-palette"]')))
const docEl = doc.asElement() ?? (await page.evaluateHandle(() =>
  [...document.querySelectorAll('aside button')].find((b) => b.querySelector('span[style]')))).asElement()
await docEl.click()
await sleep(2000)

// ③ 왼쪽 = 그 의사의 실제 하루 (CAL-SLOT-02·03·08 · CAL-PAST-01)
await shot('04-day-calendar')

// ④ 날짜 칸 → 작은 달력. 달 이동이 있는지(데모에는 없었다).
const dateBtn = await page.evaluateHandle(() =>
  [...document.querySelectorAll('aside button')].find((b) => /^\d+월 \d+일 \(.\)$/.test(b.textContent.trim())))
await dateBtn.asElement().click()
await sleep(700)
await shot('05-month-picker')
await clickText('button[aria-label="다음 달"]', '')
  .catch(async () => { await (await page.$('button[aria-label="다음 달"]')).click() })
await sleep(600)
await shot('06-next-month')

// 내일로 되돌아와 고른다 — 「지난 시각」에 막히지 않는 날
await (await page.$('button[aria-label="이전 달"]')).click()
await sleep(500)
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
await page.evaluate((d) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === String(d) && x.className.includes('aspect-square'))
  b?.click()
}, tomorrow.getDate())
await sleep(2000)

// ⑤ 시각 찍기 — 레인의 특정 지점(11시 언저리)을 눌러 자리표를 만든다 (CAL-BOOK-04b)
const lane = await page.$('[data-testid="day-lane"]')
const bb = await lane.boundingBox()
await page.mouse.move(bb.x + bb.width / 2, bb.y + 120)
await sleep(400)
await shot('07-hover-preview')
await page.mouse.click(bb.x + bb.width / 2, bb.y + 120)
await sleep(800)
await shot('08-slot-picked')

// ⑥ 사유 + 저장 직전 확인 (CAL-BOOK-08 · QUEUE-SAME-01)
const reason = await page.$('aside textarea')
await reason.type('고혈압 정기 진료')
await sleep(300)
await clickText('aside button', '예약하기')
await sleep(900)
await shot('09-confirm')

if (process.argv[4] === 'save') {
  await clickText('[role="dialog"] button', '예약 확정', '알겠습니다, 그대로 잡기')
  await sleep(2500)
  await shot('10-saved')
}
await browser.close()
console.log('done')
