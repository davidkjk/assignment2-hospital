import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1400,1000', '--no-sandbox'], defaultViewport: { width: 1400, height: 1000 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (n) => page.screenshot({ path: `${process.env.S}/shot/uifix3-${n}.png` })

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1000)
const inputs = await page.$$('input')
await inputs[0].type('admin@gaon.local'); await inputs[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)

// 직원 관리 — 목록 색원 제거 확인 + 의사 프로필 열어 팔레트 픽커(검정 네모 제거) 확인
await page.goto('http://localhost:5173/admin/staff', { waitUntil: 'networkidle2' }); await sleep(2000)
await shot('staff-list')
const prof = await page.$('[data-staff-row] button')
// 「프로필」 버튼을 찾아 클릭
const btns = await page.$$('[data-staff-row] button')
for (const b of btns) { const t = await page.evaluate((e) => e.textContent, b); if (t && t.includes('프로필')) { await b.click(); break } }
await sleep(1500)
await shot('staff-profile')

// 안내 보내기 — 좌우 스왑 확인
await page.goto('http://localhost:5173/messages', { waitUntil: 'networkidle2' }); await sleep(2000)
await shot('messages')
console.log('done', page.url())
await browser.close()
