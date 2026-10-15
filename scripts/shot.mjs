// Dev helper: screenshot app routes with Playwright. Usage: node scripts/shot.mjs <url-path> <out.png> [waitMs] [splash]
import { chromium } from 'playwright'
const [path = '/', out = 'shot.png', wait = '6000', splash] = process.argv.slice(2)
const base = process.env.BASE ?? 'http://localhost:5180'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 })
if (!splash) await page.addInitScript(() => sessionStorage.setItem('impulse.splash', '1'))
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(base + path)
await page.waitForTimeout(+wait)
await page.screenshot({ path: out })
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'no errors')
await browser.close()
