import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const DIR = process.argv[3] || '.'
const PATIENT = '5b5bfa61-3728-42f8-933c-02117334e4cc'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (OUT === 'real') {
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
  // 상담봇 기록
  await page.goto('http://localhost:5174/chatlog', { waitUntil: 'networkidle2' })
  await sleep(2500)
  await page.screenshot({ path: `${DIR}/chatlog-real.png` })
  // 행 열기 → 대화 + 근거
  const rows = await page.$$('[data-testid="staff-chatlog"] button')
  // 목록 행만 고른다(필터 버튼 제외) — 그리드 행 클래스로.
  const listRows = await page.$$('button.grid')
  if (listRows[0]) { await listRows[0].click(); await sleep(1800); await page.screenshot({ path: `${DIR}/chatlog-real-detail.png` }) }
  // 환자상세 상담 섹션
  await page.goto(`http://localhost:5174/patients/${PATIENT}`, { waitUntil: 'networkidle2' })
  await sleep(2500)
  await page.screenshot({ path: `${DIR}/ptdetail-real.png`, fullPage: true })
} else {
  await page.goto('https://demo-pi-inky-72.vercel.app/staff/chatlog', { waitUntil: 'networkidle2' })
  await sleep(2500)
  await page.screenshot({ path: `${DIR}/chatlog-demo.png` })
  const rows = await page.$$('button.grid')
  if (rows[0]) { await rows[0].click(); await sleep(1500); await page.screenshot({ path: `${DIR}/chatlog-demo-detail.png` }) }
}
console.log('URL:', page.url())
await browser.close()
