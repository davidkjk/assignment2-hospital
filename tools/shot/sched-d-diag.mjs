import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = '/Users/kimjunkee/dev/vcu/assignment2-hospital/tools/shot/shot'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1500,1000', '--no-sandbox'], defaultViewport: { width: 1500, height: 1000 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/admin/schedule', { waitUntil: 'networkidle2' }); await sleep(2000)
// 병원 운영시간 탭으로
const clickText = async (t, exact = true) => {
  const els = await page.$$('button, a, [role="button"]')
  for (const e of els) { const tx = await (await e.getProperty('textContent')).jsonValue(); const s = (tx || '').trim(); if (exact ? s === t : s.includes(t)) { await e.click(); return true } }
  return false
}
console.log('운영시간 탭 클릭:', await clickText('병원 운영시간', false)); await sleep(1200)
// 월요일 종료 칸에 2599
const end = await page.$('input[aria-label="월요일 종료"]')
if (!end) { console.log('종료 칸 못 찾음'); await browser.close(); process.exit(1) }
await end.click({ clickCount: 3 }); await page.keyboard.press('Backspace')
await end.type('2599')
const val = await (await end.getProperty('value')).jsonValue()
console.log('입력 후 값:', val)
await clickText('저장'); await sleep(800)
const err = await page.evaluate(() => document.querySelector('[data-testid="err-월요일-종료"]')?.textContent ?? null)
const saveEnabled = await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='저장'); return b ? !b.disabled : null })
console.log('D) 종료칸 인라인 오류:', err)
console.log('D) 저장 버튼 여전히 활성:', saveEnabled)
await page.screenshot({ path: OUT + '/sched-d-invalid.png', fullPage: false })
await browser.close()
