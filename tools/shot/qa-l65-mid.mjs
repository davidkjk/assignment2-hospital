import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // 'real' | 'demo'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1000', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 가운데 열만 잘라 찍는다 — L65는 카드 인셋·간격·프레임 문제라 전체페이지로는 안 보인다.
async function clipToMiddle(findText) {
  const box = await page.evaluate((needle) => {
    const secs = Array.from(document.querySelectorAll('section, div'))
    // "오늘 예약 이유"를 담고 폭이 400 미만인 가장 바깥 열을 고른다.
    const cand = secs.filter((el) => el.textContent && el.textContent.includes(needle))
    let best = null
    for (const el of cand) {
      const r = el.getBoundingClientRect()
      if (r.width > 200 && r.width < 460 && r.height > 200) {
        if (!best || r.width > best.w) best = { x: r.x, y: r.y, w: r.width, h: r.height }
      }
    }
    return best
  }, findText)
  return box
}

if (OUT === 'real') {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await sleep(1200)
  const inputs = await page.$$('input')
  await inputs[0].type('doctor1@gaon.local')
  await inputs[1].type('demo1234')
  await page.keyboard.press('Enter')
  await sleep(3500)
  await page.goto('http://localhost:5173/doctor/console', { waitUntil: 'networkidle2' })
  await sleep(2500)
  const row = await page.$('[aria-label="오늘 진료 대기"] li button')
  if (row) { await row.click(); await sleep(2500) }
} else {
  await page.goto('https://demo-pi-inky-72.vercel.app/staff/doctor/console', { waitUntil: 'networkidle2' })
  await sleep(2500)
  const row = await page.$('[data-testid="doctor-console"] aside button')
  if (row) { await row.click(); await sleep(1500) }
}
console.log('URL:', page.url())
// 가운데 열 텍스트 덤프(시각·진료과 맥락 줄 확인용)
const midText = await page.evaluate(() => {
  const el = document.querySelector('[data-col="context"]') ||
    Array.from(document.querySelectorAll('section')).find((s) => s.className && s.className.includes('w-80'))
  return el ? el.innerText.slice(0, 400) : '(none)'
})
console.log('--- MID TEXT ---\n' + midText + '\n---')

// 열 요소 자체를 잡는다(스크롤돼도 전체 박스). real=data-col=context, demo=w-80 섹션.
const el = OUT === 'real'
  ? await page.$('[data-col="context"]')
  : await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('section')).find((s) => s.className && s.className.includes('w-80')))
if (el && el.asElement && el.asElement()) {
  await el.asElement().screenshot({ path: `${process.env.S}/shot/l65-${OUT}-mid.png` })
  console.log('col shot ->', `l65-${OUT}-mid.png`)
} else if (el) {
  await el.screenshot({ path: `${process.env.S}/shot/l65-${OUT}-mid.png` })
  console.log('col shot ->', `l65-${OUT}-mid.png`)
} else {
  await page.screenshot({ path: `${process.env.S}/shot/l65-${OUT}-full.png` })
  console.log('no col, full shot')
}
await browser.close()
