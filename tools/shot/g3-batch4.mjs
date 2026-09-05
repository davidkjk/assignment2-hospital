import puppeteer from 'puppeteer-core'

// G3 배치4(staff군) 눈대조 — 직원 관리 목록·의사 프로필/팔레트.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const S = process.env.S

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1300', '--no-sandbox'], defaultViewport: { width: 1600, height: 1300 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inp = await page.$$('input')
await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)

await page.goto('http://localhost:5173/admin/staff', { waitUntil: 'networkidle2' })
await sleep(2200)
await page.screenshot({ path: `${S}/shot/g3b4-after-staff.png`, fullPage: true })
console.log('staff:', page.url())

const btns = await page.$$('button, tr, li')
for (const b of btns) {
  const t = await (await b.getProperty('textContent')).jsonValue()
  if (t && /선생|의사|프로필|색|담당/.test(t) && t.length < 40) { await b.click(); await sleep(1500); break }
}
await page.screenshot({ path: `${S}/shot/g3b4-after-profile.png`, fullPage: true })
console.log('profile:', page.url())
await browser.close()
