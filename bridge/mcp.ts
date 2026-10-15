#!/usr/bin/env node
/**
 * stdio MCP server spawned by the user's harness (Claude Code, Codex, Gemini, …).
 * It is a thin proxy: every tool call is POSTed to the running Impulse bridge, which records the
 * step for the chat UI and either executes it or forwards it to the open browser tab.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { TOOLS } from './tools.ts'

const BRIDGE = process.env.IMPULSE_BRIDGE_URL ?? 'http://127.0.0.1:7420'
const RUN = process.env.IMPULSE_RUN ?? ''

const server = new McpServer({ name: 'impulse', version: '1.0.0' })

for (const t of TOOLS) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.shape }, async (args: Record<string, unknown>) => {
    try {
      const res = await fetch(`${BRIDGE}/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run: RUN, name: t.name, args }),
      })
      const body = (await res.json()) as { ok: boolean; result?: unknown; error?: string }
      if (!body.ok) return { isError: true, content: [{ type: 'text' as const, text: body.error ?? 'Tool failed' }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(body.result) }] }
    } catch (e) {
      return { isError: true, content: [{ type: 'text' as const, text: `Impulse bridge unreachable at ${BRIDGE}: ${String(e)}` }] }
    }
  })
}

await server.connect(new StdioServerTransport())
