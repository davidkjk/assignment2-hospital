import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' }, // 창구 PC 시계 = 병원 시계(Asia/Seoul)
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const shot = (n) => page.screenshot({ path: `${process.env.S}/shot/${OUT}-${n}.png` })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 실은 /queue, 데모는 /staff/queue. 탭은 쿼리로 직접 진입.
const base = OUT === 'real' ? 'http://localhost:5173' : 'https://demo-pi-inky-72.vercel.app/staff'
const url = (tab) => `${base}/queue${tab ? `?tab=${tab}` : ''}`

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
}

const tabs = [['', 'waiting'], ['not_arrived', 'notarrived'], ['arrived', 'arrived'], ['total', 'total']]
for (const [q, name] of tabs) {
  await page.goto(url(q), { waitUntil: 'networkidle2' })
  await sleep(1500)
  console.log('URL:', page.url())
  await shot(`queue-${name}`)
}
await browser.close()
