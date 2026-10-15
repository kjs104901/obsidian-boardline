// Drive a running Obsidian (started with --remote-debugging-port=<port>) over CDP and collect console output.
// Usage: node scripts/app-cdp.mjs <steps.json> <out-dir> [port=9222] [page url prefix=app://obsidian.md]
// steps: [{op:'screenshot',name}, {op:'click',x,y,mods?,count?}, {op:'drag',from,to,steps?,holdShot?}, {op:'pathDrag',points,mods?,holdShot?},
//         {op:'touchDrag',from,to}, {op:'pinch',center,from,to,move?}, {op:'key',key,mods?,commands?}, {op:'type',text}, {op:'wait',ms}, {op:'eval',expr,file?,base64?}, {op:'clickTitle',title}, {op:'rightClick',x,y}, {op:'hover',x,y|text}]
import fs from 'node:fs'
import path from 'node:path'

const [, , stepsPath, outDir, portArg, urlArg] = process.argv
const port = Number(portArg ?? 9222)
const steps = JSON.parse(fs.readFileSync(stepsPath, 'utf8'))
fs.mkdirSync(outDir, { recursive: true })

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.startsWith(urlArg ?? 'app://obsidian.md'))
if (!page) throw new Error('app page not found: ' + targets.map((t) => t.url).join(', '))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))

let nextId = 1
const pending = new Map()
const logs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  } else if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    logs.push(`[exception] ${d.exception?.description ?? d.text}`)
  } else if (m.method === 'Log.entryAdded') {
    logs.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`)
  }
}
const send = (method, params = {}, timeoutMs = 10000) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    const t = setTimeout(() => (pending.delete(id), reject(new Error('timeout ' + method))), timeoutMs)
    pending.set(id, { resolve: (v) => (clearTimeout(t), resolve(v)), reject: (e) => (clearTimeout(t), reject(e)) })
    ws.send(JSON.stringify({ id, method, params }))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Page.bringToFront')

const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
const bits = (mods = []) => mods.reduce((a, m) => a | MOD[m], 0)
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra })
const KEYS = {
  Enter: ['Enter', 13, '\r'], Escape: ['Escape', 27], Delete: ['Delete', 46], Backspace: ['Backspace', 8], Tab: ['Tab', 9],
  '.': ['Period', 190, '.'], ',': ['Comma', 188, ','], ']': ['BracketRight', 221, ']'], '[': ['BracketLeft', 219, '['], '?': ['Slash', 191, '?'], '/': ['Slash', 191, '/'], End: ['End', 35], Home: ['Home', 36], '`': ['Backquote', 192, '`'],
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
  F5: ['F5', 116], PageDown: ['PageDown', 34], PageUp: ['PageUp', 33], ' ': ['Space', 32, ' '],
}
async function key(k, mods, commands) {
  let code, keyCode, text
  if (KEYS[k]) [code, keyCode, text] = KEYS[k]
  else if (/^[a-z]$/i.test(k)) [code, keyCode, text] = ['Key' + k.toUpperCase(), k.toUpperCase().charCodeAt(0), k]
  else if (/^[0-9]$/.test(k)) [code, keyCode, text] = ['Digit' + k, k.charCodeAt(0), k]
  else throw new Error('unknown key ' + k)
  const modifiers = bits(mods)
  const withText = text && !(mods ?? []).some((m) => m !== 'shift')
  // `commands` (e.g. ['copy']) runs editing commands the way a real shortcut would.
  await send('Input.dispatchKeyEvent', { type: withText ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: keyCode, text: withText ? text : undefined, modifiers, commands })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode, modifiers })
}

let shot = 0
const results = []
for (const s of steps) {
  switch (s.op) {
    case 'screenshot': {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(outDir, `${String(++shot).padStart(2, '0')}-${s.name}.png`), Buffer.from(r.data, 'base64'))
      break
    }
    case 'click':
      await mouse('mouseMoved', s.x, s.y)
      await mouse('mousePressed', s.x, s.y, { clickCount: s.count ?? 1, buttons: 1, modifiers: bits(s.mods) })
      await mouse('mouseReleased', s.x, s.y, { clickCount: s.count ?? 1, modifiers: bits(s.mods) })
      break
    case 'rightClick': {
      await mouse('mouseMoved', s.x, s.y, { button: 'none' })
      await mouse('mousePressed', s.x, s.y, { button: 'right', buttons: 2, clickCount: 1 })
      await mouse('mouseReleased', s.x, s.y, { button: 'right', clickCount: 1 })
      break
    }
    case 'clickTitle': {
      // Click the first visible element whose title attribute matches.
      const expr = `(() => { const el=[...document.querySelectorAll('[title]')].find(x=>x.title===${JSON.stringify(s.title)} && x.offsetParent); if(!el) return null; const r=el.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2] })()`
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
      const pos = r.result?.value
      if (!pos) throw new Error('no element titled ' + s.title)
      await mouse('mouseMoved', pos[0], pos[1])
      await mouse('mousePressed', pos[0], pos[1], { clickCount: 1, buttons: 1 })
      await mouse('mouseReleased', pos[0], pos[1], { clickCount: 1 })
      break
    }
    case 'hover': {
      // Move the mouse to x,y or onto the first visible element whose text is `text`.
      let pos = [s.x, s.y]
      if (s.text) {
        const expr = `(() => { const el=[...document.querySelectorAll('button,span,div')].find(x=>x.textContent.trim()===${JSON.stringify(s.text)} && x.offsetParent); if(!el) return null; const r=el.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2] })()`
        pos = (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value
        if (!pos) throw new Error('no element with text ' + s.text)
      }
      await mouse('mouseMoved', pos[0], pos[1], { button: 'none' })
      break
    }
    case 'pathDrag': {
      // Press at the first point, move through the rest (a lasso loop, a scribble), release.
      const pts = s.points
      await mouse('mouseMoved', pts[0][0], pts[0][1])
      await mouse('mousePressed', pts[0][0], pts[0][1], { clickCount: 1, buttons: 1, modifiers: bits(s.mods) })
      for (const [x, y] of pts.slice(1)) {
        await mouse('mouseMoved', x, y, { buttons: 1, modifiers: bits(s.mods) })
        await sleep(16)
      }
      if (s.holdShot) {
        await sleep(100)
        const r = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(path.join(outDir, `${String(++shot).padStart(2, '0')}-${s.holdShot}.png`), Buffer.from(r.data, 'base64'))
      }
      const [lx, ly] = pts[pts.length - 1]
      await mouse('mouseReleased', lx, ly, { clickCount: 1, buttons: 0, modifiers: bits(s.mods) })
      break
    }
    case 'drag': {
      const [x0, y0] = s.from, [x1, y1] = s.to, n = s.steps ?? 15
      await mouse('mouseMoved', x0, y0)
      await mouse('mousePressed', x0, y0, { clickCount: 1, buttons: 1, modifiers: bits(s.mods) })
      for (let i = 1; i <= n; i++) {
        await mouse('mouseMoved', x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, { buttons: 1, modifiers: bits(s.mods) })
        await sleep(16)
      }
      if (s.holdShot) {
        await sleep(100)
        const r = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(path.join(outDir, `${String(++shot).padStart(2, '0')}-${s.holdShot}.png`), Buffer.from(r.data, 'base64'))
      }
      await mouse('mouseReleased', x1, y1, { clickCount: 1, modifiers: bits(s.mods) })
      break
    }
    case 'touchDrag': {
      // One finger from `from` to `to`.
      const [x0, y0] = s.from, [x1, y1] = s.to, n = s.steps ?? 12
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] })
      for (let i = 1; i <= n; i++) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, id: 1 }] })
        await sleep(16)
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      break
    }
    case 'pinch': {
      // Two fingers around `center`, `from` px apart spreading to `to` px (and moving by `move`).
      const [cx, cy] = s.center, n = s.steps ?? 12, [mx, my] = s.move ?? [0, 0]
      const pts = (d, k) => [
        { x: cx + mx * k - d / 2, y: cy + my * k, id: 1 },
        { x: cx + mx * k + d / 2, y: cy + my * k, id: 2 },
      ]
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(s.from, 0) })
      for (let i = 1; i <= n; i++) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(s.from + ((s.to - s.from) * i) / n, i / n) })
        await sleep(16)
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      break
    }
    case 'key':
      await key(s.key, s.mods, s.commands)
      break
    case 'type':
      await send('Input.insertText', { text: s.text })
      break
    case 'ime': {
      // Korean IME: compose each step (e.g. ['ㅎ','하','한']), then commit the last.
      for (const step of s.steps) {
        await send('Input.imeSetComposition', { text: step, selectionStart: step.length, selectionEnd: step.length })
        await sleep(30)
      }
      await send('Input.insertText', { text: s.steps[s.steps.length - 1] })
      break
    }
    case 'wait':
      await sleep(s.ms)
      break
    case 'eval': {
      const r = await send('Runtime.evaluate', { expression: s.expr, returnByValue: true, awaitPromise: true }, s.timeout ?? 30000)
      const value = r.result?.value
      if (s.file && typeof value === 'string') {
        // Save the result: base64 when `base64` is set, text otherwise.
        fs.writeFileSync(path.join(outDir, s.file), s.base64 ? Buffer.from(value, 'base64') : value)
        results.push({ expr: s.expr.slice(0, 80), file: s.file, bytes: value.length })
      } else {
        results.push({ expr: s.expr.slice(0, 80), value, exception: r.exceptionDetails?.exception?.description })
      }
      break
    }
  }
  await sleep(s.after ?? 150)
}
await sleep(300)
fs.writeFileSync(path.join(outDir, 'console.txt'), logs.join('\n'))
console.log(JSON.stringify({ screenshots: shot, results, console: logs }, null, 2))
ws.close()
process.exit(0)
