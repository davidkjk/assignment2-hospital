// 재현 2: 상단 [예약] 도어 흐름 + today [예약·상담 보기] 사이드바. TZ 미강제(밴쿠버).
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1600,1200', '--no-sandbox'], defaultViewport: { width: 1600, height: 1200 } })
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })
const clickText = async (re) => page.evaluate((src) => {
  const rx = new RegExp(src)
  const b = [...document.querySelectorAll('button, a')].find((x) => rx.test((x.textContent || '').trim()))
  if (b) { b.scrollIntoView({ block: 'center' }); b.click(); return (b.textContent || '').trim().slice(0, 30) }
  return null
}, re.source)

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1000)
const inputs = await page.$$('input')
await inputs[0].type('admin@gaon.local'); await inputs[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)

// ── Test A: 상단 [예약] 도어 ──
await page.goto('http://localhost:5173/today', { waitUntil: 'networkidle2' }); await sleep(2000)
console.log('[예약] 버튼:', await clickText(/^예약$/)); await sleep(1500)
await page.screenshot({ path: `${process.env.S}/shot/repro2-A1-booking-door.png` })
// 도어 안 캘린더의 빈 시간 슬롯 클릭
const slot = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[class*="slot"], [class*="spot"], svg rect, [role="button"]')].filter((e) => e.getBoundingClientRect().height > 30 && e.getBoundingClientRect().width > 40)
  // 오후 영역의 클릭 가능한 빈 칸 추정: 가장 큰 빈 영역
  const el = els.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]
  if (!el) return null
  const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.7 }
})
if (slot) { await page.mouse.click(slot.x, slot.y); await sleep(1200) }
await page.screenshot({ path: `${process.env.S}/shot/repro2-A2-after-slot.png` })
console.log('Test A 후 에러:', errors.filter((e) => !/404/.test(e)).join(' | ') || '없음')

// ── Test B: today [예약·상담 보기] ──
errors.length = 0
await page.goto('http://localhost:5173/today', { waitUntil: 'networkidle2' }); await sleep(2000)
console.log('[예약·상담 보기]:', await clickText(/예약.*상담|상담.*보기|예약·상담/)); await sleep(1500)
await page.screenshot({ path: `${process.env.S}/shot/repro2-B1-support-panel.png` })
console.log('Test B 후 에러:', errors.filter((e) => !/404/.test(e)).join(' | ') || '없음')

await browser.close()
