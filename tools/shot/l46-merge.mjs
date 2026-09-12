import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' }, args: ['--window-size=1600,1200','--no-sandbox'], defaultViewport: { width: 1600, height: 1200 } })
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (n) => page.screenshot({ path: `${process.env.S}/shot/l46-${n}.png`, fullPage: true })
const clickText = async (txt) => {
  const h = await page.evaluateHandle((t) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t && !b.disabled), txt)
  const el = h.asElement(); if (!el) { console.log('버튼 못 찾음:', txt); return false }
  await el.click(); return true
}
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1200)
const inputs = await page.$$('input'); await inputs[0].type('admin@gaon.local'); await inputs[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3000)
await page.goto('http://localhost:5173/admin/patient-merge-candidates', { waitUntil: 'networkidle2' }); await sleep(2000)
await shot('01-list')
if (await clickText('대표 검토')) { await sleep(1500); await shot('02-compare') }
// 비교 화면에서 한 카드의 대표 지정(대표 검토) 눌러 검토 활성화
const picks = await page.$$eval('button', bs => bs.filter(b=>b.textContent.trim()==='대표 검토').length)
console.log('대표 검토 버튼 수(비교화면):', picks)
if (await clickText('대표 검토')) { await sleep(1000) }
if (await clickText('병합 내용 검토')) { await sleep(1500); await shot('03-confirm-checkbox') }
else console.log('병합 내용 검토 버튼 비활성/미발견')
await browser.close()
