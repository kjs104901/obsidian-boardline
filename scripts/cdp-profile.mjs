// Profile one expression in a CDP page and print where the time went (self time by function).
// Usage: node scripts/cdp-profile.mjs <port> <page url prefix> <expression file> [out.cpuprofile]
import fs from 'node:fs'

const [, , portArg, urlPrefix, exprFile, outFile] = process.argv
const targets = await (await fetch(`http://127.0.0.1:${portArg}/json`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix))
if (!page) throw new Error('page not found')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
let nextId = 1
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

// A page in the background has its timers slowed down (to once a second, or a minute).
await send('Page.bringToFront')
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
await send('Profiler.enable')
await send('Profiler.setSamplingInterval', { interval: 200 })
await send('Profiler.start')
const r = await send('Runtime.evaluate', { expression: fs.readFileSync(exprFile, 'utf8'), awaitPromise: true, returnByValue: true })
const { profile } = await send('Profiler.stop')
console.log('result:', r.result?.value ?? r.exceptionDetails?.exception?.description)
if (outFile) fs.writeFileSync(outFile, JSON.stringify(profile))

// Self time per function (samples × interval), and total time of the hottest call paths.
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
const dt = (profile.endTime - profile.startTime) / profile.samples.length / 1000
for (const s of profile.samples) {
  const n = byId.get(s)
  const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`
  self.set(key, (self.get(key) ?? 0) + dt)
}
console.log(`total ${((profile.endTime - profile.startTime) / 1000).toFixed(0)} ms; top self time:`)
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${v.toFixed(0).padStart(7)} ms  ${k}`)

// Inclusive time: each node's samples plus its children's.
const parent = new Map()
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
const counts = new Map()
for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1)
const total = new Map()
for (const [id, c] of counts) {
  const seen = new Set()
  for (let p = id; p !== undefined; p = parent.get(p)) {
    const n = byId.get(p)
    const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`
    if (seen.has(key)) continue
    seen.add(key)
    total.set(key, (total.get(key) ?? 0) + c * dt)
  }
}
console.log('top inclusive time:')
for (const [k, v] of [...total].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${v.toFixed(0).padStart(7)} ms  ${k}`)
ws.close()
