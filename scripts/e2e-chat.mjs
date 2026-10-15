// Dev helper: drive the AI flow end to end and screenshot as it progresses.
import { chromium } from 'playwright'
const [prompt = 'Generate market summary for WTI Crude Oil', outDir = '.', path = '/workspaces/cl'] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1.5 })
await page.addInitScript(() => sessionStorage.setItem('impulse.splash', '1'))
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto('http://localhost:5180' + path)
await page.waitForTimeout(4000)
await page.keyboard.press('/')
await page.waitForTimeout(300)
await page.keyboard.type(prompt, { delay: 15 })
await page.keyboard.press('Enter')
const marks = [2, 15, 40, 70, 110, 160, 220]
let t0 = Date.now()
for (const s of marks) {
  await page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)))
  await page.screenshot({ path: `${outDir}/e2e-${String(s).padStart(3, '0')}.png` })
  const done = await page.evaluate(() => document.body.innerText.includes('Worked for'))
  console.log(`t=${s}s done=${done}`)
  if (done && s >= 15) break
}
await page.waitForTimeout(2500)
await page.screenshot({ path: `${outDir}/e2e-final.png` })
const steps = await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('impulse.chat') || '{}'); const t = c.state?.threads?.[0]; const m = t?.messages?.at(-1); return m?.steps?.map((x) => `${x.status} ${x.name} ${JSON.stringify(x.args).slice(0, 90)} ${x.error ?? ''}`) })
console.log((steps ?? []).join('\n'))
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'no errors')
await browser.close()
