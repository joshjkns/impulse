import { Check, ChevronDown, ExternalLink, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { bridgeSend, BRIDGE_WS, useBridgeStore } from '@/lib/bridge'
import { ModelMenu, useProviders } from '@/components/chat/ModelPicker'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/store/prefs'
import { CopyButton, Group, Notice, Page, Row, TextField } from './controls'

function BridgeOffline() {
  return (
    <Notice tone="warn">
      Bridge offline. Run <code className="rounded bg-black/30 px-1">pnpm bridge</code> in the project folder (or <code className="rounded bg-black/30 px-1">pnpm dev</code>).
    </Notice>
  )
}

export function AgentPage() {
  const { harnesses, connected, settings } = useBridgeStore()
  const { harness, set } = usePrefs()
  const defaults = usePrefs((s) => s.defaultModels)
  const setDefaultModel = usePrefs((s) => s.setDefaultModel)
  const providers = useProviders()

  const saveCustom = (customCommand: string) => {
    bridgeSend({ type: 'settings', settings: { customCommand } })
    useBridgeStore.setState({ settings: { ...settings, customCommand } })
  }

  return (
    <Page
      title="AI agent"
      description="Impulse runs on the AI harness you already use. Nothing is sent to an Impulse server. Switch provider and model per chat from the picker under the message box."
    >
      {!connected && <BridgeOffline />}
      <Group title="Default models">
        {providers.length === 0 && <Row label="No harness found" hint="Install one of the harnesses below, then Rescan." />}
        {providers.map((p) => (
          <Row key={p.id} label={p.name} hint={p.modelFlag ? 'Used when a chat is on Default.' : `${p.name} picks its model itself.`}>
            {p.modelFlag && (
              <ModelMenu
                providers={[p]}
                value={{ harness: p.id, model: defaults[p.id] || undefined }}
                onPick={(v) => setDefaultModel(p.id, v.model ?? '')}
                defaultLabel={() => 'built in'}
                side="bottom"
                align="end"
              >
                <button className="flex h-8 max-w-[220px] items-center gap-1.5 rounded-[8px] bg-field px-2.5 text-[12px] ring-1 ring-line hover:ring-ring data-[state=open]:ring-ring">
                  <span className={cn('truncate', defaults[p.id] ? 'text-fg' : 'text-fg-3')}>{defaults[p.id] || 'Harness default'}</span>
                  <ChevronDown className="size-3 shrink-0 text-fg-3" />
                </button>
              </ModelMenu>
            )}
          </Row>
        ))}
      </Group>

      <Group
        title="Harnesses"
        aside={
          <button onClick={() => bridgeSend({ type: 'detect' })} className="flex items-center gap-1 text-[11.5px] text-fg-2 hover:text-fg disabled:opacity-40" disabled={!connected}>
            <RefreshCw className="size-3" /> Rescan
          </button>
        }
      >
        {[...harnesses, { id: 'custom', name: 'Custom command', installed: true, mcp: true, homepage: '', version: 'any CLI' }].map((h) => (
          <button
            key={h.id}
            disabled={!h.installed}
            onClick={() => set({ harness: h.id, model: undefined })}
            className={cn('flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors first:rounded-t-[12px] last:rounded-b-[12px]', harness === h.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]', !h.installed && 'opacity-45')}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[12.5px] text-fg">
                {h.name}
                <span className={cn('rounded px-1 text-[10px]', h.mcp ? 'bg-brand-soft text-brand' : 'bg-chip text-fg-2')}>{h.mcp ? 'MCP' : 'CLI tools'}</span>
              </span>
              <span className="block truncate text-[11px] text-fg-3">{h.installed ? (h.version ?? 'installed') : 'not installed'}</span>
            </span>
            {!h.installed && h.homepage && (
              <a href={h.homepage} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-fg-3 hover:text-fg">
                <ExternalLink className="size-3.5" />
              </a>
            )}
            {harness === h.id && (
              <motion.span layoutId="harness-check" className="text-brand">
                <Check className="size-4" />
              </motion.span>
            )}
          </button>
        ))}
      </Group>

      {harness === 'custom' && (
        <Group title="Custom command">
          <Row label="Command" hint="Runs in a shell. Prompt in $IMPULSE_PROMPT, MCP config at $IMPULSE_MCP_CONFIG, picked model in $IMPULSE_MODEL." />
          <div className="px-3.5 pb-3">
            <TextField value={settings.customCommand} onCommit={saveCustom} placeholder={'kimi --print -p "$IMPULSE_PROMPT"'} mono />
          </div>
        </Group>
      )}
    </Page>
  )
}

export function IntegrationsPage() {
  const connected = useBridgeStore((s) => s.connected)
  const mcpCmd = 'claude mcp add impulse -- node "$(pwd)/bridge/mcp.ts"'
  return (
    <Page title="Integrations" description="The local bridge connects the browser to your AI harness and exposes Impulse's tools over MCP.">
      <Group title="Bridge">
        <Row label="Status" hint={<span className="num">{BRIDGE_WS}</span>}>
          <span className={cn('flex items-center gap-1.5 text-[12px]', connected ? 'text-up' : 'text-[#ff9aa9]')}>
            <span className={cn('size-1.5 rounded-full', connected ? 'bg-up' : 'bg-down')} />
            {connected ? 'Connected' : 'Offline'}
          </span>
        </Row>
      </Group>
      {!connected && <BridgeOffline />}
      <Group title="MCP server">
        <Row label="Use Impulse tools from your harness" hint="Add the bridge's MCP server to Claude Code (or any MCP client) to use market data, alerts and order proposals outside the app." />
        <div className="flex items-center gap-2 px-3.5 pb-3">
          <code className="num flex-1 truncate rounded-[8px] bg-black/30 px-2.5 py-2 text-[11.5px] text-fg">{mcpCmd}</code>
          <CopyButton text={mcpCmd} />
        </div>
      </Group>
    </Page>
  )
}
