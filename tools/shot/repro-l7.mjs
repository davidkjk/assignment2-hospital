import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.env.S
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  env: { ...process.env, TZ: 'Asia/Seoul' }, args: ['--window-size=1600,1000','--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 } })
const page = await browser.newPage()
const msgs = []
page.on('console', m => msgs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', e => msgs.push(`[pageerror] ${e.message}`))
const sleep = ms => new Promise(r=>setTimeout(r,ms))
await page.goto('http://localhost:5173/login',{waitUntil:'networkidle2'}); await sleep(1000)
const inp = await page.$$('input'); await inp[0].type('admin@gaon.local'); await inp[1].type('demo1234')
await page.keyboard.press('Enter'); await sleep(3000)
await page.goto('http://localhost:5173/calendar',{waitUntil:'networkidle2'}); await sleep(2000)
// 주간 버튼 클릭
const weekBtn = await page.$x ? null : null
await page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='주간'); if(b) b.click() })
await sleep(1500)
await page.screenshot({path:`${OUT}/shot/repro-l7-week-all.png`})
// 상태: 전체 과/전체 의사 칩 여부
const state = await page.evaluate(()=>{
  const chips=[...document.querySelectorAll('button')].filter(b=>/전체/.test(b.textContent)).map(b=>b.textContent.trim())
  const cols=document.querySelectorAll('.cal-week-col, [data-week-col], .cal-doctor-col').length
  return { chips, cols, bodyLen: document.body.innerText.length }
})
console.log('STATE', JSON.stringify(state))
console.log('MSGS', msgs.slice(-20).join('\n'))
await browser.close()
