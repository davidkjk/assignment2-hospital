import puppeteer from 'puppeteer-core'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT=process.env.S
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',env:{...process.env,TZ:'Asia/Seoul'},args:['--window-size=1600,1000','--no-sandbox'],defaultViewport:{width:1600,height:1000}})
const p=await b.newPage(); const s=ms=>new Promise(r=>setTimeout(r,ms))
await p.goto('http://localhost:5173/login',{waitUntil:'networkidle2'});await s(1000)
const i=await p.$$('input');await i[0].type('admin@gaon.local');await i[1].type('demo1234');await p.keyboard.press('Enter');await s(3000)
await p.goto('http://localhost:5173/admin/staff',{waitUntil:'networkidle2'});await s(2000)
await p.screenshot({path:`${OUT}/shot/${process.argv[2]||'staffpage'}.png`})
await p.goto('http://localhost:5173/admin/questionnaires',{waitUntil:'networkidle2'});await s(2000)
await p.screenshot({path:`${OUT}/shot/qnrpage.png`})
await b.close()
