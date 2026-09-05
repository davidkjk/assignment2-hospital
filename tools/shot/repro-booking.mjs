// 예약(전화예약) 크래시 재현 — pageerror·console 캡처 + 빈 시간 클릭 후 스크린샷.
// 사용: S=$(pwd) node repro-booking.mjs   (TZ 미설정 = 사용자 맥의 실제 TZ로 재현)
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// ⛔ TZ를 강제하지 않는다 — 사용자 맥의 실제 TZ(America/Vancouver)로 재현해야 버그가 보인다.
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1600,1200', '--no-sandbox'], defaultViewport: { width: 1600, height: 1200 } })
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1000)
const inputs = await page.$$('input')
await inputs[0].type('admin@gaon.local'); await inputs[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)

await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(2500)
await page.screenshot({ path: `${process.env.S}/shot/repro-cal-01-initial.png`, fullPage: false })

// 빈 시간 블록을 찾아 클릭
const clicked = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.cal-column *, [class*="cal-"]')].filter((e) => {
    const t = (e.textContent || '').trim()
    return /^빈 시간 1[0-9]:/.test(t) && e.getBoundingClientRect().height > 40
  })
  const el = els[els.length - 1] // 오후 빈 시간(13:52~) 쪽
  if (!el) return null
  el.scrollIntoView({ block: 'center' })
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + Math.min(60, r.height / 2), text: (el.textContent || '').slice(0, 40) }
})
console.log('빈시간 후보:', JSON.stringify(clicked))
if (clicked) { await page.mouse.click(clicked.x, clicked.y); await sleep(1500) }
await page.screenshot({ path: `${process.env.S}/shot/repro-cal-02-after-slot.png`, fullPage: false })

// 패널의 시간 입력에 blur 유발(값 스냅) — "시간 고르고 나면" 재현
const timeInfo = await page.evaluate(() => {
  const t = document.querySelector('input[aria-label="시간"]')
  const d = document.querySelector('input[aria-label="날짜"]')
  return { time: t ? t.value : '(없음)', date: d ? d.value : '(없음)' }
})
console.log('패널 값:', JSON.stringify(timeInfo))
// 시간 칸에 포커스→값 바꿔보고 blur
const timeEl = await page.$('input[aria-label="시간"]')
if (timeEl) { await timeEl.click({ clickCount: 3 }); await timeEl.type('09:13'); await page.keyboard.press('Tab'); await sleep(1000) }
await page.screenshot({ path: `${process.env.S}/shot/repro-cal-03-after-time.png`, fullPage: false })

// 저장 시도
const saveBtn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => /예약 저장/.test(b.textContent || '')))
if (saveBtn && saveBtn.asElement()) { await saveBtn.asElement().click(); await sleep(1200) }
await page.screenshot({ path: `${process.env.S}/shot/repro-cal-04-after-save.png`, fullPage: false })

console.log('=== 에러 목록 ===')
console.log(errors.length ? errors.join('\n') : '(에러 없음)')
await browser.close()
