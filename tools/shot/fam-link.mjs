import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.env.OUT || 'tools/shot'
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 900 },
})
const page = await browser.newPage()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = async (sel, text) => {
  const els = await page.$$(sel)
  for (const el of els) {
    const t = await page.evaluate((e) => e.innerText, el)
    if (t && t.includes(text)) { await el.click(); return true }
  }
  return false
}

// 1) 로그인
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
await sleep(800)
await page.type('#staff-email', 'admin@gaon.local', { delay: 15 })
await page.type('#staff-password', 'demo1234', { delay: 15 })
await ((await page.$('button[type="submit"]')) || (await page.$$('button')).at(-1)).click()
await sleep(3500)

// 2) 환자 검색 → 첫 결과 상세로
await page.goto('http://localhost:5173/patients', { waitUntil: 'networkidle2' })
await sleep(800)
const searchBox = await page.$('input[type="search"], input[placeholder*="검색"], input')
await searchBox.type('김', { delay: 30 })
await page.keyboard.press('Enter')
await sleep(1500)
// 검색 결과의 이름 링크/행 클릭 (상세로 이동)
const link = await page.$('a[href^="/patients/"]')
if (link) { await link.click() } else { await clickText('button, a', '김') }
await sleep(1800)
console.log('상세 URL:', page.url())

// 3) 가족 연결 추가 → 패널 열림(검색 단계)
await clickText('button', '가족 연결 추가')
await sleep(1000)
await page.screenshot({ path: `${OUT}/fam-1-search.png` })
console.log('shot: fam-1-search.png')

// 4) 패널 안에서 대상 검색 → 첫 결과 → 동명이인 재확인
const panelBox = await page.$('input[placeholder*="이름·전화"]')
if (panelBox) {
  await panelBox.type('김', { delay: 30 })
  await page.keyboard.press('Enter')
  await sleep(1500)
  await page.screenshot({ path: `${OUT}/fam-2-results.png` })
  console.log('shot: fam-2-results.png')
  // 첫 결과 버튼(패널 내) 클릭
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const r = btns.find((b) => /\d{4}-\*\*-\*\*|\*\*\*\*/.test(b.innerText))
    if (r) { r.click(); return r.innerText.slice(0, 40) }
    return null
  })
  console.log('선택한 결과:', clicked)
  await sleep(800)
  await page.screenshot({ path: `${OUT}/fam-3-identity.png` })
  console.log('shot: fam-3-identity.png')
  // 동명이인 재확인 → 선택
  await clickText('button', '이 사람 선택')
  await sleep(800)
  await page.screenshot({ path: `${OUT}/fam-4-relation.png` })
  console.log('shot: fam-4-relation.png')

  // 관계 입력 → 본인 확인으로 이동 → (번호 있는 대상이라) OTP 단계
  const rel = await page.$('input[placeholder*="배우자"]')
  await rel.type('배우자', { delay: 30 })
  await clickText('button', '본인 확인으로 이동')
  await sleep(1500)
  await page.screenshot({ path: `${OUT}/fam-5-otp.png` })
  console.log('shot: fam-5-otp.png')
}

await browser.close()
