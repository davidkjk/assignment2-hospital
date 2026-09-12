import puppeteer from 'puppeteer-core'

// 임의 화면 대조 — 시간 무관 화면용.
// 사용: S=$(pwd) node shot-screen.mjs real <name> <realPath>
//       S=$(pwd) node shot-screen.mjs demo <name> <demoPath>
//   예) real messages /messages   ·   demo messages /staff/messages

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2]
const NAME = process.argv[3]
const PATH = process.argv[4]
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1200', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1200 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = () => page.screenshot({ path: `${process.env.S}/shot/${OUT}-${NAME}.png`, fullPage: true })

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
  await page.goto(`http://localhost:5173${PATH}`, { waitUntil: 'networkidle2' })
  await sleep(2500)
} else {
  await page.goto(`https://demo-pi-inky-72.vercel.app${PATH}`, { waitUntil: 'networkidle2' })
  await sleep(2800)
}
console.log('URL:', page.url())
await shot()
await browser.close()
