import puppeteer from 'puppeteer-core'

// G3 배치1(공용 컴포넌트 타이포 이관) 눈대조 — 환자검색(SelectableList·PickBar·UndoControl) + 병합후보.
// 사용: S=$(pwd) node g3-batch1.mjs <tag>   (tag = after | before)
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
await inputs[0].type('admin@gaon.local')
await inputs[1].type('demo1234')
await page.keyboard.press('Enter')
await sleep(3500)

// 1) 환자 검색 — 결과행(SelectableList + UndoControl)
await page.goto('http://localhost:5173/patients', { waitUntil: 'networkidle2' })
await sleep(1500)
const search = await page.$('input[aria-label="환자 검색"]')
if (search) { await search.type('김'); await sleep(300); await page.keyboard.press('Enter'); await sleep(2000) }
await page.screenshot({ path: `${process.env.S}/shot/g3b1-${TAG}-patients.png`, fullPage: true })
console.log('patients:', page.url())

// 2) 병합 후보 — PickBar/SelectableList 서식
await page.goto('http://localhost:5173/admin/patient-merge-candidates', { waitUntil: 'networkidle2' })
await sleep(2500)
await page.screenshot({ path: `${process.env.S}/shot/g3b1-${TAG}-merge.png`, fullPage: true })
console.log('merge:', page.url())

// 3) 운영통계 — StatTile(staff-ui)·ConfirmDialog 인접
await page.goto('http://localhost:5173/admin/stats', { waitUntil: 'networkidle2' })
await sleep(2500)
await page.screenshot({ path: `${process.env.S}/shot/g3b1-${TAG}-stats.png`, fullPage: true })
console.log('stats:', page.url())

await browser.close()
