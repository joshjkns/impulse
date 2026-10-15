import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * Adapters for local coding-agent CLIs. Impulse never calls a model API itself: it shells out to the
 * harness the user already has installed and logged in, hands it the Impulse MCP server (or, for
 * harnesses without MCP, a CLI it can call from its shell tool) and streams the reply back.
 */

export interface McpLaunch {
  command: string
  args: string[]
  env: Record<string, string>
}

export interface RunContext {
  prompt: string
  system: string
  mcp: McpLaunch
  /** Shell command the agent can use when MCP is unavailable. */
  cliHint: string
  session?: string
  model?: string
  workdir: string
  bridgeUrl: string
}

export type Parser = 'claude' | 'codex' | 'anthropic-sse' | 'gemini' | 'opencode' | 'cursor' | 'text'

export interface Launch {
  args: string[]
  parser: Parser
  /** Files written into the run's working directory before launch (relative path → contents). */
  files?: Record<string, string>
  env?: Record<string, string>
  /** Session id to remember when the harness lets us pick it up front. */
  session?: string
}

export interface Harness {
  id: string
  name: string
  bin: string
  /** Harness reads MCP config natively; otherwise the prompt teaches it the CLI fallback. */
  mcp: boolean
  /** Harness keeps its own conversation state between runs (so we don't resend history). */
  sessions: boolean
  homepage: string
  /** Harness accepts a model flag. When false the picker only offers the harness's own default. */
  modelFlag: boolean
  /** Suggested model ids for the picker. Any other id can still be typed in. */
  models: string[]
  /** Command (args to `bin`) that prints one model id per line, merged into `models` on detect. */
  listModels?: string[]
  launch: (c: RunContext) => Launch
}

const mcpJson = (c: RunContext) => JSON.stringify({ mcpServers: { impulse: { command: c.mcp.command, args: c.mcp.args, env: c.mcp.env } } }, null, 2)
const withSystem = (c: RunContext) => `${c.system}\n\n---\n\n${c.prompt}`
const cliSystem = (c: RunContext) =>
  `${c.system}\n\nYou do not have native Impulse tools in this harness. Call them from your shell:\n  ${c.cliHint} list            # show tools\n  ${c.cliHint} <tool> '<json args>'\nEvery tool returns JSON. Use them instead of guessing.`
const withCli = (c: RunContext) => `${cliSystem(c)}\n\n---\n\n${c.prompt}`
const toml = (s: string) => JSON.stringify(s)

export const HARNESSES: Harness[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    mcp: true,
    sessions: true,
    homepage: 'https://claude.com/claude-code',
    modelFlag: true,
    models: ['opus', 'sonnet', 'haiku', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
    launch: (c) => ({
      parser: 'claude',
      args: [
        '-p',
        c.prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--mcp-config',
        mcpJson(c),
        '--strict-mcp-config',
        '--allowedTools',
        'mcp__impulse',
        'WebSearch',
        'WebFetch',
        '--disallowedTools',
        'Bash',
        'Edit',
        'Write',
        'NotebookEdit',
        '--append-system-prompt',
        c.system,
        ...(c.model ? ['--model', c.model] : []),
        ...(c.session ? ['--resume', c.session] : []),
      ],
    }),
  },
  {
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    mcp: true,
    sessions: true,
    homepage: 'https://github.com/openai/codex',
    modelFlag: true,
    models: ['gpt-5-codex', 'gpt-5', 'gpt-5-mini'],
    launch: (c) => {
      const cfg = [
        `mcp_servers.impulse.command=${toml(c.mcp.command)}`,
        `mcp_servers.impulse.args=[${c.mcp.args.map(toml).join(',')}]`,
        ...Object.entries(c.mcp.env).map(([k, v]) => `mcp_servers.impulse.env.${k}=${toml(v)}`),
        'mcp_servers.impulse.default_tools_approval_mode="approve"',
      ].flatMap((x) => ['-c', x])
      const base = ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', ...cfg, ...(c.model ? ['-m', c.model] : [])]
      return {
        parser: 'codex',
        args: c.session ? [...base, 'resume', c.session, c.prompt] : [...base, withSystem(c)],
      }
    },
  },
  {
    id: 'grok',
    name: 'Grok',
    bin: 'grok',
    mcp: true,
    sessions: false,
    homepage: 'https://x.ai/cli',
    modelFlag: true,
    models: ['grok-code-fast-1', 'grok-4'],
    launch: (c) => ({
      // Grok's stream-json mirrors Claude Code's (assistant messages + stream_event partials).
      parser: 'claude',
      files: {
        '.grok/config.toml': [
          '[mcp_servers.impulse]',
          `command = ${toml(c.mcp.command)}`,
          `args = [${c.mcp.args.map(toml).join(', ')}]`,
          'enabled = true',
          '',
          '[mcp_servers.impulse.env]',
          ...Object.entries(c.mcp.env).map(([k, v]) => `${k} = ${toml(v)}`),
        ].join('\n'),
      },
      args: ['-p', withSystem(c), '--output-format', 'streaming-messages-json', '--include-partial-messages', '--always-approve', '--trust', '--no-subagents', ...(c.model ? ['-m', c.model] : [])],
    }),
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    mcp: true,
    sessions: false,
    homepage: 'https://github.com/google-gemini/gemini-cli',
    modelFlag: true,
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    launch: (c) => ({
      parser: 'gemini',
      files: { '.gemini/settings.json': mcpJson(c) },
      args: ['-p', withSystem(c), '--output-format', 'stream-json', '-y', ...(c.model ? ['-m', c.model] : [])],
    }),
  },
  {
    id: 'pi',
    name: 'pi',
    bin: 'pi',
    mcp: false,
    sessions: true,
    homepage: 'https://github.com/badlogic/pi-mono',
    modelFlag: true,
    models: [],
    launch: (c) => {
      const session = c.session ?? crypto.randomUUID()
      return {
        parser: 'text',
        session,
        args: ['-p', '--append-system-prompt', cliSystem(c), '--session-id', session, ...(c.model ? ['--model', c.model] : []), c.prompt],
      }
    },
  },
  {
    id: 'omp',
    name: 'oh-my-pi',
    bin: 'omp',
    mcp: false,
    sessions: false,
    homepage: 'https://github.com/can1357/oh-my-pi',
    modelFlag: true,
    models: [],
    launch: (c) => ({
      parser: 'text',
      files: { '.mcp.json': mcpJson(c) },
      args: ['-p', ...(c.model ? ['--model', c.model] : []), withCli(c)],
    }),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    mcp: true,
    sessions: true,
    homepage: 'https://opencode.ai',
    modelFlag: true,
    models: ['anthropic/claude-sonnet-5-5', 'openai/gpt-5'],
    listModels: ['models'],
    launch: (c) => ({
      parser: 'opencode',
      files: {
        'opencode.json': JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            mcp: { impulse: { type: 'local', command: [c.mcp.command, ...c.mcp.args], environment: c.mcp.env, enabled: true } },
            permission: { edit: 'deny', bash: 'deny', webfetch: 'allow' },
          },
          null,
          2,
        ),
      },
      env: { OPENCODE_CONFIG: path.join(c.workdir, 'opencode.json') },
      args: ['run', '--format', 'json', ...(c.model ? ['-m', c.model] : []), ...(c.session ? ['-s', c.session] : []), c.session ? c.prompt : withSystem(c)],
    }),
  },
  {
    id: 'cursor',
    name: 'Cursor CLI',
    bin: 'cursor-agent',
    mcp: true,
    sessions: true,
    homepage: 'https://cursor.com/cli',
    modelFlag: true,
    models: ['auto', 'gpt-5', 'sonnet-4.5'],
    launch: (c) => ({
      parser: 'cursor',
      files: { '.cursor/mcp.json': mcpJson(c) },
      args: ['-p', '--output-format', 'stream-json', '--approve-mcps', '--force', ...(c.model ? ['--model', c.model] : []), ...(c.session ? ['--resume', c.session] : []), c.session ? c.prompt : withSystem(c)],
    }),
  },
  {
    id: 'amp',
    name: 'Amp',
    bin: 'amp',
    mcp: true,
    sessions: false,
    homepage: 'https://ampcode.com',
    modelFlag: false,
    models: [],
    launch: (c) => ({
      parser: 'text',
      files: { 'amp.settings.json': JSON.stringify({ 'amp.mcpServers': { impulse: { command: c.mcp.command, args: c.mcp.args, env: c.mcp.env } } }, null, 2) },
      args: ['--settings-file', path.join(c.workdir, 'amp.settings.json'), '--dangerously-allow-all', '-x', withSystem(c)],
    }),
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    mcp: true,
    sessions: false,
    homepage: 'https://github.com/QwenLM/qwen-code',
    modelFlag: true,
    models: ['qwen3-coder-plus'],
    launch: (c) => ({
      parser: 'text',
      files: { '.qwen/settings.json': mcpJson(c) },
      args: ['-p', withSystem(c), '-y', ...(c.model ? ['-m', c.model] : [])],
    }),
  },
  {
    id: 'droid',
    name: 'Factory Droid',
    bin: 'droid',
    mcp: false,
    sessions: false,
    homepage: 'https://factory.ai',
    modelFlag: true,
    models: [],
    launch: (c) => ({ parser: 'text', args: ['exec', '--auto', 'low', ...(c.model ? ['-m', c.model] : []), withCli(c)] }),
  },
]

/** PATH plus the usual per-user install locations, so GUI-launched bridges still find CLIs. */
export function searchPath() {
  const h = homedir()
  const extra = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${h}/.local/bin`,
    `${h}/.bun/bin`,
    `${h}/.npm-global/bin`,
    `${h}/.grok/bin`,
    `${h}/.opencode/bin`,
    `${h}/.cargo/bin`,
    `${h}/.amp/bin`,
  ]
  return Array.from(new Set([...(process.env.PATH ?? '').split(path.delimiter), ...extra])).join(path.delimiter)
}

export function which(bin: string) {
  for (const dir of searchPath().split(path.delimiter)) {
    const p = path.join(dir, bin)
    if (dir && existsSync(p)) return p
  }
  return undefined
}

export interface HarnessStatus {
  id: string
  name: string
  installed: boolean
  version?: string
  path?: string
  mcp: boolean
  homepage: string
  modelFlag: boolean
  models: string[]
}

const run = (bin: string, args: string[], timeout: number) =>
  new Promise<string>((resolve) =>
    execFile(bin, args, { timeout, env: { ...process.env, PATH: searchPath() } }, (_err, stdout) => resolve(String(stdout ?? ''))),
  )

/** Model ids a harness reports itself (e.g. `opencode models`), one per line. */
async function discoverModels(bin: string, h: Harness) {
  if (!h.listModels) return []
  const out = await run(bin, h.listModels, 8000)
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[\w./:@[\]-]+$/.test(l))
    .slice(0, 200)
}

export async function detectHarnesses(): Promise<HarnessStatus[]> {
  return Promise.all(
    HARNESSES.map(async (h): Promise<HarnessStatus> => {
      const p = which(h.bin)
      const base = { id: h.id, name: h.name, mcp: h.mcp, homepage: h.homepage, modelFlag: h.modelFlag, models: h.models }
      if (!p) return { ...base, installed: false }
      const [out, found] = await Promise.all([run(p, ['--version'], 6000), discoverModels(p, h)])
      const version = out.trim().split('\n')[0]?.slice(0, 60)
      return { ...base, installed: true, version: version || undefined, path: p, models: Array.from(new Set([...h.models, ...found])) }
    }),
  )
}
