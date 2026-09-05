import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=1600,1100', '--no-sandbox'], defaultViewport: { width: 1600, height: 1100 },
})
const page = await browser.newPage()
const S = process.env.S
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await sleep(1200)
const inputs = await page.$$('input')
await inputs[0].type('admin@gaon.local'); await inputs[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3500)
await page.goto('http://localhost:5173/messages', { waitUntil: 'networkidle2' }); await sleep(1400)
await page.screenshot({ path: `${S}/shot/qa-l56-01-oneScreen.png` })

// 작성이 바로 열려 있다 — 검색해서 3명 고른다
const searchBox = await page.$('[data-testid="left-tool"] input')
await searchBox.type('김'); await sleep(1600)
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-testid="left-tool"] button')].find((x) => /고르기/.test(x.textContent || ''))
    if (b) b.click()
  })
  await sleep(700)
}
// 내용도 채워 보내기 버튼 위 칩과 함께 보이게
await page.evaluate(() => {
  const ta = document.querySelector('textarea[aria-label="내용"]')
  if (ta) { const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(ta, '진료 안내 문자입니다.'); ta.dispatchEvent(new Event('input', { bubbles: true })) }
})
await sleep(500)
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label="고른 받는 사람"] span')].map((s) => s.textContent).filter((t) => t && !/받는 사람/.test(t)))
console.log('칩:', chips)
await page.screenshot({ path: `${S}/shot/qa-l56-02-chips.png` })
await browser.close()
