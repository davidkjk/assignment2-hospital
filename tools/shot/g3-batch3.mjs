import puppeteer from 'puppeteer-core'

// G3 배치3(admin-merge군) 눈대조 — 병합후보·대표검토(비교/확인)·병합이력.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TAG = process.argv[2] || 'after'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1300', '--no-sandbox'], defaultViewport: { width: 1600, height: 1300 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inputs = await page.$$('input')
await inputs[0].type('admin@gaon.local'); await inputs[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)

// 대표검토 클릭 → 비교/확인 패널
await page.goto('http://localhost:5173/admin/patient-merge-candidates', { waitUntil: 'networkidle2' }); await sleep(2000)
const btns = await page.$$('button')
for (const b of btns) {
  const t = await (await b.getProperty('textContent')).jsonValue()
  if (t && t.includes('대표 검토')) { await b.click(); await sleep(2000); break }
}
await page.screenshot({ path: `${S}/shot/g3b3-${TAG}-compare.png`, fullPage: true })
console.log('compare shot:', page.url())

// 병합 이력
await page.goto('http://localhost:5173/admin/merge-history', { waitUntil: 'networkidle2' }); await sleep(2000)
await page.screenshot({ path: `${S}/shot/g3b3-${TAG}-history.png`, fullPage: true })
console.log('history shot:', page.url())
await browser.close()
