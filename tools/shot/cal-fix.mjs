import puppeteer from 'puppeteer-core'

// #4(주간 전체=가로 스크롤)·#2(미니 길이) — 짧은 창(800px)으로 실제 화면 재현.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1400,800', '--no-sandbox'], defaultViewport: { width: 1400, height: 800 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/calendar', { waitUntil: 'networkidle2' }); await sleep(2000)

// #4 주간(전체 의사)
const btns = await page.$$('button')
for (const b of btns) { const t = await (await b.getProperty('textContent')).jsonValue(); if (t && t.trim() === '주간') { await b.click(); await sleep(1500); break } }
await page.screenshot({ path: `${S}/shot/calfix-week-all.png` })  // 뷰포트만(스크롤 여부 보이게)
// 주간 격자가 가로로 넘치는지 vs 스크롤되는지: scrollWidth>clientWidth면 스크롤 컨테이너 OK
const wk = await page.$eval('.cal-week-grid', (e) => ({ scroll: e.scrollWidth, client: e.clientWidth, overflowX: getComputedStyle(e).overflowX }))
console.log('주간 격자:', JSON.stringify(wk), '→ 가로스크롤', wk.scroll > wk.client ? '있음(정상)' : '불필요')

// #2 미니
await page.click('.cal-nav-range'); await sleep(800)
await page.screenshot({ path: `${S}/shot/calfix-mini.png` })
const mini = await page.$eval('.cal-mini-weeks', (e) => ({ scroll: e.scrollHeight, client: e.clientHeight, max: getComputedStyle(e).maxHeight }))
console.log('미니 주격자:', JSON.stringify(mini), '→ 세로스크롤', mini.scroll > mini.client ? '있음' : '전부보임')
await browser.close()
