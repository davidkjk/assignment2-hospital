import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = '/Users/kimjunkee/dev/vcu/assignment2-hospital/tools/shot'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1200', '--no-sandbox'], defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
console.log('로그인 후 URL:', page.url())
await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(3000)
console.log('캘린더 URL:', page.url())
await page.screenshot({ path: OUT + '/cal-door-0-loaded.png', fullPage: false })
const next = await page.waitForSelector('button[aria-label="다음"]', { timeout: 8000 })
await next.click(); await sleep(1500) // 내일

const cols = await page.$$('.cal-column')
const heads = await page.evaluate(() => [...document.querySelectorAll('.cal-column-head .cal-column-name')].map(e => e.textContent.trim()))
const targetCol = cols[1]
console.log('클릭할 열 의사:', heads[1])
const dotted = await targetCol.evaluateHandle((col) => {
  for (const pos of col.querySelectorAll('.cal-slot-pos[role="button"]')) {
    if (pos.querySelector('.cal-slot.is-dotted')) return pos
  }
  return null
})
const el = dotted.asElement()
if (!el) { console.log('빈 슬롯 없음'); await browser.close(); process.exit(1) }
const box = await el.boundingBox()
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(1500)

const result = await page.evaluate(() => {
  const door = document.querySelector('aside[aria-label="새 예약"]')
  const surfaceHead = [...document.querySelectorAll('.text-base.font-semibold')].map(e => e.textContent.trim())
  return {
    doorOpen: !!door,
    doorText: door ? door.innerText.replace(/\s+/g, ' ').slice(0, 260) : null,
    oldPhonePanel: !!document.querySelector('.cal-panel-title, select[aria-label="의사"]'),
    surfaceHeads: surfaceHead.slice(0, 6),
  }
})
console.log('문 열림:', result.doorOpen)
console.log('옛 전화예약 패널 존재?(있으면 실패):', result.oldPhonePanel)
console.log('왼쪽 작업면 머리들:', JSON.stringify(result.surfaceHeads))
console.log('문 본문:', result.doorText)
await page.screenshot({ path: OUT + '/cal-door-1.png', fullPage: false })

// 왼쪽 일간 캘린더(day-lane)에서 다른 시각을 눌러 시각이 바뀌는지
const lane = await page.$('[data-testid="day-lane"]')
if (lane) {
  const lb = await lane.boundingBox()
  await page.mouse.click(lb.x + lb.width / 2, lb.y + 220); await sleep(800)
  const t2 = await page.evaluate(() => {
    const door = document.querySelector('aside[aria-label="새 예약"]')
    // 시각 PickedValue: 문 본문에서 HH:MM 찾기
    const m = door?.innerText.match(/\b\d{2}:\d{2}\b/)
    return m ? m[0] : null
  })
  console.log('D) 왼쪽 캘린더 다른 지점 클릭 후 시각:', t2)
  await page.screenshot({ path: OUT + '/cal-door-2-timechange.png', fullPage: false })
} else {
  console.log('day-lane 없음 — 시각 작업면 미표시')
}
await browser.close()
