import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PREFIX = process.argv[2] || 'qnr'
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', env: { ...process.env, TZ: 'Asia/Seoul' }, args: ['--window-size=1400,1200','--no-sandbox'], defaultViewport: { width: 1400, height: 1200 } })
const p = await b.newPage()
const s = (ms) => new Promise((r) => setTimeout(r, ms))
await p.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' }); await s(1000)
const ins = await p.$$('input'); await ins[0].type('admin@gaon.local'); await ins[1].type('demo1234'); await p.keyboard.press('Enter'); await s(4500)
for (let t=0;t<6&&p.url().includes('/login');t++) await s(1000)
await p.goto('http://localhost:5173/admin/questionnaires', { waitUntil: 'networkidle2' }); await s(2000)
// 첫 진료과(내과) 카드 클릭
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('내과')); if(b) b.click() })
await s(1800)
console.log('at', p.url())
await p.screenshot({ path: `${process.env.S}/shot/${PREFIX}-qnr-editor.png`, fullPage: true })
await b.close()
