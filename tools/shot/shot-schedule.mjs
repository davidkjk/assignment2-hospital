import puppeteer from 'puppeteer-core'

// 진료 일정 관리(/admin/schedule) SideRail 다섯 줄 순회 촬영.
// 사용: S=$(pwd) node shot/shot-schedule.mjs <prefix>   (예: before / after)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PREFIX = process.argv[2] || 'sched'
const RAIL = ['전체 현황', '진료과 관리', '의사별 스케줄', '특정 날짜 변경', '병원 운영시간']

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1400,1100', '--no-sandbox'],
  defaultViewport: { width: 1400, height: 1100 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1000)
const inputs = await page.$$('input')
await inputs[0].type('admin@gaon.local')
await inputs[1].type('demo1234')
await page.keyboard.press('Enter')
await sleep(4500)
for (let t = 0; t < 6 && page.url().includes('/login'); t++) await sleep(1000)
await page.goto('http://localhost:5173/admin/schedule', { waitUntil: 'networkidle2' })
await sleep(2200)
console.log('at', page.url())

async function clickRail(label) {
  const clicked = await page.evaluate((txt) => {
    const bs = [...document.querySelectorAll('button, a')]
    const b = bs.find((x) => (x.textContent || '').replace(/\s+/g, ' ').includes(txt))
    if (b) { b.click(); return true }
    return false
  }, label)
  return clicked
}

for (let i = 0; i < RAIL.length; i++) {
  await clickRail(RAIL[i])
  await sleep(900)
  await page.screenshot({ path: `${process.env.S}/shot/${PREFIX}-sched-${i}.png`, fullPage: true })
  console.log(`${PREFIX}-sched-${i} (${RAIL[i]})`)
}
await browser.close()
