import type { Parser } from './harnesses.ts'

export interface ParseSink {
  /** Append to the current assistant segment. */
  text: (delta: string) => void
  /** A new assistant segment begins (the agent spoke, used tools, and is speaking again). */
  reset: () => void
  /** Replace the current segment with complete text (for harnesses that emit whole messages). */
  replace: (full: string) => void
  session: (id: string) => void
  error: (msg: string) => void
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Returns a line handler for the given output dialect. */
export function createParser(kind: Parser, sink: ParseSink) {
  let sawDelta = false
  let first = true

  const json = (line: string): J | undefined => {
    const t = line.trim()
    if (!t.startsWith('{')) return
    try {
      return JSON.parse(t) as J
    } catch {
      return
    }
  }

  /** Anthropic Messages streaming events, used by Claude Code's partial messages and Grok. */
  const anthropicEvent = (e: J) => {
    if (e.type === 'message_start') {
      if (!first) sink.reset()
      first = false
    } else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
      sawDelta = true
      sink.text(e.delta.text)
    }
  }

  return (line: string) => {
    if (kind === 'text') {
      sink.text(line.replace(ANSI, '') + '\n')
      return
    }
    const e = json(line)
    if (!e) return
    if (typeof e.session_id === 'string') sink.session(e.session_id)
    switch (kind) {
      case 'claude': {
        if (e.type === 'stream_event' && e.event) anthropicEvent(e.event)
        else if (e.type === 'assistant' && !sawDelta) {
          const t = (e.message?.content ?? []).filter((b: J) => b.type === 'text').map((b: J) => b.text).join('')
          if (t) {
            if (!first) sink.reset()
            first = false
            sink.replace(t)
          }
        } else if (e.type === 'result' && e.is_error) sink.error(String(e.result ?? e.error ?? 'Claude Code failed'))
        break
      }
      case 'anthropic-sse': {
        if (e.type === 'stream_event' && e.event) anthropicEvent(e.event)
        else anthropicEvent(e)
        if (e.type === 'error') sink.error(String(e.error?.message ?? 'Harness error'))
        if (typeof e.sessionId === 'string') sink.session(e.sessionId)
        break
      }
      case 'codex': {
        if (e.type === 'thread.started' && e.thread_id) sink.session(e.thread_id)
        if ((e.type === 'item.completed' || e.type === 'item.updated') && e.item?.type === 'agent_message') {
          if (e.type === 'item.completed' && !first) sink.reset()
          first = false
          sink.replace(String(e.item.text ?? ''))
        }
        if (e.type === 'error' || e.type === 'turn.failed') sink.error(String(e.message ?? e.error?.message ?? 'Codex failed'))
        break
      }
      case 'gemini': {
        if (e.type === 'init' && e.session_id) sink.session(e.session_id)
        if (e.type === 'message' && e.role === 'assistant' && typeof e.content === 'string') {
          if (e.delta) sink.text(e.content)
          else sink.replace(e.content)
        }
        if (e.type === 'tool_use' || e.type === 'tool_result') {
          // Next assistant message is a fresh segment.
          first = false
          sawDelta = false
        }
        if (e.type === 'error') sink.error(String(e.message ?? 'Gemini failed'))
        break
      }
      case 'opencode': {
        if (typeof e.sessionID === 'string') sink.session(e.sessionID)
        const part = e.part ?? e.properties?.part
        if (part?.type === 'text' && typeof part.text === 'string') sink.replace(part.text)
        if (part?.type === 'tool') {
          first = false
        }
        if (e.type === 'error') sink.error(String(e.error?.data?.message ?? e.error?.message ?? 'OpenCode failed'))
        break
      }
      case 'cursor': {
        if (typeof e.session_id === 'string') sink.session(e.session_id)
        if (e.type === 'assistant') {
          const t = (e.message?.content ?? []).filter((b: J) => b.type === 'text').map((b: J) => b.text).join('')
          if (t) sink.text(t)
        }
        if (e.type === 'tool_call') {
          sink.reset()
        }
        if (e.type === 'result' && e.is_error) sink.error(String(e.result ?? 'Cursor failed'))
        break
      }
    }
  }
}
