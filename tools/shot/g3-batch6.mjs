import puppeteer from 'puppeteer-core'

// G3 배치6(patients+patient군) 눈대조 — 환자검색(결과행)·환자 상세(헤더·상태·방문·문진·기록·가족·상담).
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1400', '--no-sandbox'], defaultViewport: { width: 1600, height: 1400 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inp = await page.$$('input')
await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)

await page.goto('http://localhost:5173/patients', { waitUntil: 'networkidle2' })
await sleep(1200)
const search = await page.$('input[aria-label="환자 검색"]')
if (search) { await search.type('김'); await sleep(300); await page.keyboard.press('Enter'); await sleep(2000) }
await page.screenshot({ path: `${S}/shot/g3b6-after-search.png`, fullPage: true })
console.log('search:', page.url())

// 환자 상세 진입
const links = await page.$$('button, a')
for (const b of links) {
  const t = await (await b.getProperty('textContent')).jsonValue()
  if (t && t.includes('환자 상세')) { await b.click(); await sleep(2500); break }
}
await page.screenshot({ path: `${S}/shot/g3b6-after-detail.png`, fullPage: true })
console.log('detail:', page.url())
await browser.close()
