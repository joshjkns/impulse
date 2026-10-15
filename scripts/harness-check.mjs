// Dev helper: run a one-line prompt through each harness via the bridge and report tool steps + reply.
import WebSocket from 'ws'
const harnesses = process.argv.slice(2)
const prompt = 'Use the impulse get_market tool for BTC and reply with just its mark price.'
for (const harness of harnesses) {
  await new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:7420/ws')
    const runId = Math.random().toString(36).slice(2)
    let text = ''
    const steps = []
    const t0 = Date.now()
    const timer = setTimeout(() => (console.log(`${harness}: TIMEOUT steps=${steps.join(',')} text=${text.slice(0, 120)}`), ws.close(), resolve()), 240_000)
    ws.on('open', () => ws.send(JSON.stringify({ type: 'chat', threadId: `check-${harness}`, runId, prompt, harness })))
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw))
      if (m.runId !== runId) return
      if (m.type === 'step' && m.step.status !== 'running') steps.push(`${m.step.name}:${m.step.status}`)
      if (m.type === 'text') text = m.reset ? '' : m.replace != null ? m.replace : text + (m.delta ?? '')
      if (m.type === 'run_done') {
        clearTimeout(timer)
        console.log(`${harness}: ok=${m.ok} ${((Date.now() - t0) / 1000).toFixed(1)}s steps=[${steps.join(',')}] reply=${JSON.stringify(text.trim().slice(0, 140))}${m.error ? ' error=' + String(m.error).slice(0, 300) : ''}`)
        ws.close()
        resolve()
      }
    })
  })
}
