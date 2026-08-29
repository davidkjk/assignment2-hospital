import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
page.on('console', (m) => { const t = m.text(); if (/error|undefined|patient/i.test(t)) console.log('PAGE>', t) })

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(1000)
const inputs = await page.$$('input')
await inputs[0].type('admin@gaon.local')
await inputs[1].type('demo1234')
await page.keyboard.press('Enter')
await sleep(3000)

await page.goto('http://localhost:5173/admin/stats', { waitUntil: 'networkidle2' })
await sleep(2500)
console.log('stats URL:', page.url())

// 상단 지표 카드의 드릴 버튼(MetricCards drillBtn) 클릭
const drilled = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  // MetricCards drillBtn: onClick onDrill. 라벨에 "명단"·"건" 등. 그냥 첫 drill 후보 찾기.
  const cand = btns.find((b) => /명단|자세히|드릴|건 보기|상세/.test(b.textContent))
  if (cand) { cand.click(); return cand.textContent.trim() }
  return null
})
console.log('drill button:', drilled)
await sleep(1500)

// 모달 안 첫 행 버튼 클릭
const before = page.url()
const rowInfo = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]')
  if (!dlg) return { err: 'no dialog' }
  const rowBtns = [...dlg.querySelectorAll('tbody button')]
  if (!rowBtns.length) return { err: 'no row buttons', dlgText: dlg.textContent.slice(0, 120) }
  const t = rowBtns[0].textContent.trim()
  rowBtns[0].click()
  return { clicked: t, count: rowBtns.length }
})
console.log('row click:', JSON.stringify(rowInfo))
await sleep(1500)
console.log('URL before->after:', before, '->', page.url())
await page.screenshot({ path: `${process.env.S || '.'}/l14-after-click.png` })
await browser.close()
