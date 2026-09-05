import puppeteer from 'puppeteer-core'

// 관리자 화면 대조용 — 시간에 구애받지 않는 표·폼 화면들.
// 사용: S=$(pwd) node shot-admin.mjs real <slug>   /   S=$(pwd) node shot-admin.mjs demo <slug>
//   slug = settings|schedule|staff|questionnaires|access-logs|merge-history|patient-merge-candidates|stats|errors
// 실 경로 = /admin/<slug> · 데모 경로 = /staff/admin/<slug>

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const SLUG = process.argv[3] || 'staff'

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' }, // 창구 PC 시계 = 병원 시계
  args: ['--window-size=1600,1200', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = () => page.screenshot({ path: `${process.env.S}/shot/${OUT}-adm-${SLUG}.png`, fullPage: true })

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
  await page.goto(`http://localhost:5173/admin/${SLUG}`, { waitUntil: 'networkidle2' })
  await sleep(2500)
} else {
  await page.goto(`https://demo-pi-inky-72.vercel.app/staff/admin/${SLUG}`, { waitUntil: 'networkidle2' })
  await sleep(2800)
}
console.log('URL:', page.url())
await shot()
await browser.close()
