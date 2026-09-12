import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = '/Users/kimjunkee/dev/vcu/assignment2-hospital/tools/shot/shot'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1200', '--no-sandbox'], defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(2000)
// 내일로 이동(오늘은 지난 시각이라 빈 미래 슬롯이 없다) — next(›) 화살표.
const arrows = await page.$$('.cal-nav-arrow')
await arrows[arrows.length - 1].click(); await sleep(1500)

// 두 번째 의사 열(column)의 머리글 이름 확인
const heads = await page.evaluate(() => [...document.querySelectorAll('.cal-column-head .cal-column-name')].map(e => e.textContent.trim()))
console.log('열 머리(의사):', JSON.stringify(heads.slice(0, 4)))

// 두 번째 열의 첫 빈 슬롯(.cal-slot.is-dotted) 호버 → 5분 미리보기 확인
const cols = await page.$$('.cal-column')
console.log('열 개수:', cols.length)
// 대상 열 = index 1. 그 열에서 클릭 가능한 빈 슬롯(role=button, 점선 포함)을 찾는다.
const targetCol = cols[1]
const targetHead = heads[1]
const dotted = await targetCol.evaluateHandle((col) => {
  for (const pos of col.querySelectorAll('.cal-slot-pos[role="button"]')) {
    if (pos.querySelector('.cal-slot.is-dotted')) return pos
  }
  return null
})
const dottedEl = dotted.asElement()
if (!dottedEl) { console.log('빈(점선) 클릭슬롯 없음'); }
if (dottedEl) {
  const box = await dottedEl.boundingBox()
  // 호버(중간 지점) — 5분 스냅 미리보기
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await sleep(400)
  const hover = await page.evaluate(() => document.querySelector('.cal-empty-hover-time')?.textContent ?? null)
  console.log('B) 5분 호버 미리보기 시각:', hover)
  await page.screenshot({ path: OUT + '/cal-click-1-hover.png', clip: { x: 260, y: 180, width: 900, height: 500 } })
  // 클릭 → 패널 열림
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(1200)
}
// 패널 필드 값 덤프
const panel = await page.evaluate(() => {
  const title = document.querySelector('.cal-panel-title')?.textContent ?? null
  const doctorSel = document.querySelector('select[aria-label="의사"]')
  const doctorText = doctorSel ? doctorSel.options[doctorSel.selectedIndex]?.text : null
  const date = document.querySelector('input[aria-label="날짜"]')?.value ?? null
  const time = document.querySelector('input[aria-label="시간"]')?.value ?? null
  const patient = document.querySelector('input[aria-label="환자"]')?.value ?? null
  return { title, doctorText, date, time, patient }
})
console.log('C) 클릭한 열 의사:', targetHead)
console.log('C) 패널 프리필:', JSON.stringify(panel))
await page.screenshot({ path: OUT + '/cal-click-2-panel.png', fullPage: false })
await browser.close()
