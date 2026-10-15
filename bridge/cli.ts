#!/usr/bin/env node
/**
 * Fallback for harnesses without MCP support (e.g. pi): the agent calls tools through its shell.
 *   node bridge/cli.ts list
 *   node bridge/cli.ts get_market '{"coin":"xyz:CL"}'
 */
import { TOOLS } from './tools.ts'

const BRIDGE = process.env.IMPULSE_BRIDGE_URL ?? 'http://127.0.0.1:7420'
const [name, raw] = process.argv.slice(2)

if (!name || name === 'list' || name === '--help') {
  for (const t of TOOLS) console.log(`${t.name}  ${Object.keys(t.shape).join(', ')}\n    ${t.description}\n`)
  process.exit(0)
}

let args: unknown = {}
try {
  args = raw ? JSON.parse(raw) : {}
} catch {
  console.error('Second argument must be JSON')
  process.exit(2)
}

const res = await fetch(`${BRIDGE}/call`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ run: process.env.IMPULSE_RUN ?? '', name, args }),
}).catch((e) => {
  console.error(`Impulse bridge unreachable at ${BRIDGE}: ${e}`)
  process.exit(1)
})
const body = (await res.json()) as { ok: boolean; result?: unknown; error?: string }
if (!body.ok) {
  console.error(body.error)
  process.exit(1)
}
console.log(JSON.stringify(body.result, null, 2))
