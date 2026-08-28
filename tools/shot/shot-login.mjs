import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] // real|demo
const URL = OUT === 'real' ? 'http://localhost:5173/login' : 'https://demo-pi-inky-72.vercel.app/staff/login'
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', env:{...process.env,TZ:'Asia/Seoul'}, args: ['--window-size=1400,1000','--no-sandbox'], defaultViewport:{width:1400,height:1000} })
const p = await b.newPage()
await p.goto(URL, { waitUntil:'networkidle2' })
await new Promise(r=>setTimeout(r, OUT==='real'?1800:2500))
await p.screenshot({ path: `${process.env.S}/shot/login-${OUT}.png`, fullPage:true })
console.log(OUT,'done', p.url()); await b.close()
