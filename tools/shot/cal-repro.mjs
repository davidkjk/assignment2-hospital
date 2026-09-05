import puppeteer from 'puppeteer-core'

// 캘린더 버그 재현 — 콘솔/페이지 오류 캡처 + 단계별 스크린샷.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1200', '--no-sandbox'], defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE.ERR: ' + m.text().slice(0, 300)) })

const dump = (label) => { console.log(`\n--- ${label} — 오류 ${errors.length}건 ---`); errors.forEach((e) => console.log('  ' + e)); errors.length = 0 }

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(2500)
await page.screenshot({ path: `${S}/shot/cal-00-initial.png`, fullPage: true }); dump('초기(일간·전체)')

// #1 의사 칩 2명 선택
const nameChips = await page.$$('.cal-name-chips .cal-chip')
console.log('의사 칩 수(전체 포함):', nameChips.length)
if (nameChips[1]) { await nameChips[1].click(); await sleep(800) }
if (nameChips[2]) { await nameChips[2].click(); await sleep(1200) }
await page.screenshot({ path: `${S}/shot/cal-01-two-doctors.png`, fullPage: true }); dump('#1 의사 2명 선택')

// 전체로 되돌리고 #4 주간
const allChip = (await page.$$('.cal-name-chips .cal-chip'))[0]
if (allChip) { await allChip.click(); await sleep(800) }
const btns = await page.$$('button')
for (const b of btns) { const t = await (await b.getProperty('textContent')).jsonValue(); if (t && t.trim() === '주간') { await b.click(); await sleep(1500); break } }
await page.screenshot({ path: `${S}/shot/cal-02-week-all.png`, fullPage: true }); dump('#4 주간·전체 의사')

// #2 미니캘린더(기간 버튼) — 다음 달
const range = await page.$('.cal-nav-range')
if (range) { await range.click(); await sleep(1200) }
await page.screenshot({ path: `${S}/shot/cal-03-mini.png`, fullPage: true }); dump('#2 미니캘린더 열림')

await browser.close()
