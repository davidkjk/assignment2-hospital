import puppeteer from 'puppeteer-core'

// 환자 검색(S5) + 환자 상세(S4) 대조. 시간 무관(검색·상세는 정적 데이터).
// 사용: S=$(pwd) node shot-patients.mjs real "<검색어>"   /   demo
//   real: /patients 에서 검색어 입력 → 결과 shot → 첫 결과 클릭 → 상세 shot
//   demo: /staff/patients (검색) → /staff/patient/anyid (상세)

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2]
const QUERY = process.argv[3] || '김'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1200', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (n) => page.screenshot({ path: `${process.env.S}/shot/${OUT}-${n}.png`, fullPage: true })

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
  await page.goto('http://localhost:5173/patients', { waitUntil: 'networkidle2' })
  await sleep(1500)
  const box = await page.$('input')
  if (box) { await box.type(QUERY); await page.keyboard.press('Enter') }
  await sleep(2000)
  await shot('s5-patients')
  // 첫 결과 행 클릭 → 상세
  const clicked = await page.evaluate(() => {
    const row = document.querySelector('[data-search-row], [role="listitem"], a[href*="/patients/"], li')
    if (row) { (row.querySelector('a,button') || row).click(); return true }
    return false
  })
  await sleep(2500)
  await shot('s4-patient-detail')
  console.log('clicked result:', clicked, '·', page.url())
} else {
  await page.goto('https://demo-pi-inky-72.vercel.app/staff/patients', { waitUntil: 'networkidle2' })
  await sleep(2500)
  const box = await page.$('input')
  if (box) { await box.type(QUERY) }
  await sleep(1500)
  await shot('s5-patients')
  await page.goto('https://demo-pi-inky-72.vercel.app/staff/patient/demo', { waitUntil: 'networkidle2' })
  await sleep(2500)
  await shot('s4-patient-detail')
  console.log('URL:', page.url())
}
await browser.close()
