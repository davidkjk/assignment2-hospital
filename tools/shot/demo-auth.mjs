import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const B = 'http://localhost:5175'
const OUT = '/Users/kimjunkee/dev/vcu/assignment2-hospital/tools/shot'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' },
  args: ['--window-size=460,900', '--no-sandbox'],
  defaultViewport: { width: 460, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()

// 폰 프레임 안쪽만 잘라 데모 화면 콘텐츠를 캡처한다.
async function shotFrame(name) {
  const el = await page.$('[data-testid="phone-frame"]')
  if (el) await el.screenshot({ path: `${OUT}/demo-auth-${name}.png` })
  else await page.screenshot({ path: `${OUT}/demo-auth-${name}.png` })
  console.log(name, '→', page.url())
}
async function clickText(txt) {
  const bs = await page.$$('button, a')
  for (const b of bs) { const t = await page.evaluate(e=>e.textContent, b); if (t && t.includes(txt)) { await b.click(); return true } }
  return false
}

// 1) 랜딩
await page.goto(B + '/app', { waitUntil: 'networkidle2' }); await sleep(700)
await shotFrame('landing')

// 2) 로그인
await page.goto(B + '/login', { waitUntil: 'networkidle2' }); await sleep(700)
await shotFrame('login')

// 3~6) 가입 마법사
await page.goto(B + '/signup', { waitUntil: 'networkidle2' }); await sleep(700)
await shotFrame('signup-consent')
// 필수 모두 동의 → 다음
await clickText('필수 항목에 모두 동의'); await sleep(300)
await clickText('다음'); await sleep(500)
await shotFrame('signup-phone')
// 전화 입력 → 인증번호 받기
await page.type('#signup-phone', '01012345678'); await sleep(300)
await clickText('인증번호 받기'); await sleep(500)
await shotFrame('signup-otp')
// OTP 6자리 → 자동으로 프로필로
const otps = await page.$$('[data-testid="otp-digit"]')
for (let i = 0; i < otps.length; i++) { await otps[i].type('1'); await sleep(80) }
await sleep(500)
await shotFrame('signup-profile')

// 7) 전화번호 변경 안내
await page.goto(B + '/auth/tel-change', { waitUntil: 'networkidle2' }); await sleep(700)
await shotFrame('tel-change')

await browser.close()
console.log('done')
