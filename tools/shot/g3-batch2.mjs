import puppeteer from 'puppeteer-core'

// G3 배치2(의사 콘솔군) 눈대조 — 의사 진료 콘솔(대기목록·환자맥락·진료기록·문구칩).
// 사용: S=$(pwd) node g3-batch2.mjs <tag>
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TAG = process.argv[2] || 'after'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1300', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1300 },
})
const page = await browser.newPage()

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inputs = await page.$$('input')
await inputs[0].type('doctor1@gaon.local')
await inputs[1].type('demo1234')
await page.keyboard.press('Enter')
await sleep(4000)
console.log('after login:', page.url())
await page.screenshot({ path: `${process.env.S}/shot/g3b2-${TAG}-console.png`, fullPage: true })

// 대기 목록에서 첫 환자 선택 → 환자맥락·진료기록·문구칩 노출
const rows = await page.$$('button')
for (const b of rows) {
  const t = await (await b.getProperty('textContent')).jsonValue()
  if (t && /\d+\s*번|대기|번째/.test(t)) { await b.click(); await sleep(1500); break }
}
await page.screenshot({ path: `${process.env.S}/shot/g3b2-${TAG}-patient.png`, fullPage: true })
console.log('done:', page.url())
await browser.close()
