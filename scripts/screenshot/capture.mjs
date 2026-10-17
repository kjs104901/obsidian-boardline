// Pictures of demo boards: serves scripts/screenshot/ with Vite, opens the pages in a headless
// Edge or Chrome, and captures each once its board is drawn.
//   node scripts/screenshot/capture.mjs [out.png]   the README's screenshot (docs/images/board.png)
//   node scripts/screenshot/capture.mjs listing     the community directory's (docs/listing/*.png, 1200x800 at 2x)
// BROWSER=<path> picks the browser.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { phosphorIcons } from '../icons-plugin.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const PORT = 9339

const jobs =
  process.argv[2] === 'listing'
    ? [
        { page: 'hero.html', width: 1200, height: 800, out: here('../../docs/listing/1-boardline.png') },
        { page: 'index.html?dark', width: 1200, height: 800, out: here('../../docs/listing/2-flowcharts.png') },
        { page: 'index.html?scene=notes', width: 1200, height: 800, out: here('../../docs/listing/3-notes.png') },
      ]
    : [{ page: 'index.html', width: 1440, height: 860, out: path.resolve(process.argv[2] ?? here('../../docs/images/board.png')) }]
const SCALE = 2

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const browserPath = BROWSERS.find((b) => b && fs.existsSync(b))
if (!browserPath) throw new Error('No Edge or Chrome found; set BROWSER to one.')

const server = await createServer({
  root: here('.'),
  configFile: false,
  logLevel: 'warn',
  plugins: [phosphorIcons()],
  // The engine's DOM elements without Obsidian (scripts/dom.ts), as in the tests.
  resolve: { alias: { '@boardline/core': here('../../src/core'), '@boardline/board-ui': here('../../src/board-ui'), '@boardline/dom': here('../dom.ts') } },
  server: { port: 0 },
})
await server.listen()
const base = server.resolvedUrls.local[0]

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'boardline-shot-'))
const browser = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=1440,900',
  '--hide-scrollbars',
  '--no-first-run',
  'about:blank',
])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let page
  for (let i = 0; i < 50 && !page; i++) {
    await sleep(200)
    page = await fetch(`http://127.0.0.1:${PORT}/json`)
      .then((r) => r.json())
      .then((targets) => targets.find((t) => t.type === 'page'))
      .catch(() => undefined)
  }
  if (!page) throw new Error('The browser did not start.')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)))
  let nextId = 1
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') console.error(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.error(m.params.args.map((a) => a.value ?? a.description).join(' '))
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Runtime.enable')
  for (const job of jobs) {
    await send('Emulation.setDeviceMetricsOverride', { width: job.width, height: job.height, deviceScaleFactor: SCALE, mobile: false })
    await send('Page.navigate', { url: base + job.page })
    await sleep(300)
    let ready = false
    for (let i = 0; i < 150 && !ready; i++) {
      await sleep(200)
      ready = (await send('Runtime.evaluate', { expression: 'window.boardReady === true', returnByValue: true })).result.value === true
    }
    if (!ready) throw new Error(`${job.page}: the demo board did not finish drawing.`)
    // Note cards read their notes and fonts settle a moment after the first frames.
    await sleep(800)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync(path.dirname(job.out), { recursive: true })
    fs.writeFileSync(job.out, Buffer.from(shot.data, 'base64'))
    console.log(`Saved ${path.relative(process.cwd(), job.out)} (${job.width * SCALE}×${job.height * SCALE})`)
  }
  ws.close()
} finally {
  browser.kill()
  await server.close()
  await sleep(300)
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
}
