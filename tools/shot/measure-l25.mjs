import puppeteer from 'puppeteer-core'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',env:{...process.env,TZ:'Asia/Seoul'},args:['--no-sandbox'],defaultViewport:{width:1600,height:1000}})
const p=await b.newPage(); const s=ms=>new Promise(r=>setTimeout(r,ms))
await p.goto('http://localhost:5173/login',{waitUntil:'networkidle2'});await s(1000)
const i=await p.$$('input');await i[0].type('admin@gaon.local');await i[1].type('demo1234');await p.keyboard.press('Enter');await s(3000)
await p.goto('http://localhost:5173/admin/staff',{waitUntil:'networkidle2'});await s(1800)
const m=await p.evaluate(()=>{
  const card=document.querySelector('[data-staff-row]')?.getBoundingClientRect()
  const right=document.querySelector('[data-col="right"] > *')?.getBoundingClientRect()
  const rightWrap=document.querySelector('[data-col="right"]')?.getBoundingClientRect()
  const list=document.querySelector('[data-staff-row]')?.closest('ul')?.getBoundingClientRect()
  const filters=document.querySelector('[role="group"][aria-label="상태 필터"]')?.getBoundingClientRect()
  const pick=r=>r?{top:Math.round(r.top),left:Math.round(r.left)}:null
  return {firstCard:pick(card), rightPanel:pick(right), rightWrap:pick(rightWrap), list:pick(list), filters:pick(filters)}
})
console.log(JSON.stringify(m,null,1))
await b.close()
