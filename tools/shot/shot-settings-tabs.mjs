import puppeteer from 'puppeteer-core'

// 병원 설정(/admin/settings) 탭별 대조 — 좌측 세로줄 다섯 탭을 순회하며 각각 촬영.
// 사용: S=$(pwd) node shot-settings-tabs.mjs real   /   S=$(pwd) node shot-settings-tabs.mjs demo
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const TABS = ['예약 규칙', '대기실 운영', '문자 발송', '자동 알림', '병원 정보']

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1400,1000', '--no-sandbox'],
  defaultViewport: { width: 1400, height: 1000 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickTab(label) {
  await page.evaluate((txt) => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => x.textContent && x.textContent.replace(/\s+/g, ' ').includes(txt) && (x.getAttribute('data-menu') || x.className.includes('rounded-lg') || x.querySelector('div')))
    if (b) b.click()
  }, label)
}

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('admin@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
  await page.goto('http://localhost:5173/admin/settings', { waitUntil: 'networkidle2' })
  await sleep(2000)
} else {
  await page.goto('https://demo-pi-inky-72.vercel.app/staff/admin/settings', { waitUntil: 'networkidle2' })
  await sleep(2800)
}

for (let i = 0; i < TABS.length; i++) {
  await clickTab(TABS[i])
  await sleep(600)
  await page.screenshot({ path: `${process.env.S}/shot/${OUT}-set-${i}.png`, fullPage: true })
}
console.log('done', page.url())
await browser.close()
