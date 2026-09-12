import puppeteer from 'puppeteer-core'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT=process.env.S
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',env:{...process.env,TZ:'Asia/Seoul'},args:['--no-sandbox'],defaultViewport:{width:1600,height:1000}})
const p=await b.newPage(); const s=ms=>new Promise(r=>setTimeout(r,ms))
await p.goto('http://localhost:5173/login',{waitUntil:'networkidle2'});await s(1000)
const i=await p.$$('input');await i[0].type('admin@gaon.local');await i[1].type('demo1234');await p.keyboard.press('Enter');await s(3000)
await p.goto('http://localhost:5173/admin/staff',{waitUntil:'networkidle2'});await s(1800)
// 첫 프로필 버튼 클릭
await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='프로필'); b&&b.click()})
await s(1500)
await p.screenshot({path:`${OUT}/shot/palette-l27.png`,clip:{x:820,y:120,width:640,height:560}})
await b.close()
