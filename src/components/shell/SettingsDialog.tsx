import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { bridgeSend, useBridgeStore } from '@/lib/bridge'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen)
  const setOpen = useUI((s) => s.openSettings)
  const { harnesses, connected, settings } = useBridgeStore()
  const { harness, harnessModel, set } = usePrefs()
  const [custom, setCustom] = useState(settings.customCommand)
  const [ntfy, setNtfy] = useState(settings.ntfyTopic)
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

  useEffect(() => {
    setCustom(settings.customCommand)
    setNtfy(settings.ntfyTopic)
  }, [settings])

  const save = (patch: Partial<typeof settings>) => {
    bridgeSend({ type: 'settings', settings: patch })
    useBridgeStore.setState({ settings: { ...settings, ...patch } })
  }

  const mcpCmd = 'claude mcp add impulse -- node "$(pwd)/bridge/mcp.ts"'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[86vh] overflow-y-auto border-0 bg-[#18181c] ring-1 ring-white/[0.07] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Impulse runs on the AI harness you already use. Nothing is sent to an Impulse server.</DialogDescription>
        </DialogHeader>

        <Section
          title="AI harness"
          aside={
            <button onClick={() => bridgeSend({ type: 'detect' })} className="flex items-center gap-1 text-[11.5px] text-fg-2 hover:text-fg" disabled={!connected}>
              <RefreshCw className="size-3" /> Rescan
            </button>
          }
        >
          {!connected && (
            <div className="mb-2 rounded-[10px] bg-down-soft/50 px-3 py-2 text-[12px] text-[#ff9aa9]">
              Bridge offline. Run <code className="rounded bg-black/30 px-1">pnpm bridge</code> in the project folder (or <code className="rounded bg-black/30 px-1">pnpm dev</code>).
            </div>
          )}
          <div className="space-y-1">
            {[...harnesses, { id: 'custom', name: 'Custom command', installed: true, mcp: true, homepage: '', version: 'any CLI' }].map((h) => (
              <button
                key={h.id}
                disabled={!h.installed}
                onClick={() => set({ harness: h.id })}
                className={cn(
                  'relative flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors',
                  harness === h.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
                  !h.installed && 'opacity-45',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] text-fg">
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
          </div>
          <label className="mt-3 block text-[11.5px] text-fg-2">
            Model override <span className="text-fg-3">(optional, passed as the harness's model flag)</span>
            <input
              value={harnessModel}
              onChange={(e) => set({ harnessModel: e.target.value })}
              placeholder="default"
              className="mt-1 h-9 w-full rounded-[9px] bg-field px-3 text-[12.5px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
            />
          </label>
          {harness === 'custom' && (
            <label className="mt-3 block text-[11.5px] text-fg-2">
              Custom command <span className="text-fg-3">— runs in a shell; prompt in $IMPULSE_PROMPT, MCP config at $IMPULSE_MCP_CONFIG</span>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={() => save({ customCommand: custom })}
                placeholder={'kimi --print -p "$IMPULSE_PROMPT"'}
                className="num mt-1 h-9 w-full rounded-[9px] bg-field px-3 text-[12px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
              />
            </label>
          )}
        </Section>

        <Section title="Notifications">
          <div className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="text-fg">Desktop notifications</span>
            <button
              disabled={perm !== 'default'}
              onClick={() => Notification.requestPermission().then(setPerm)}
              className="rounded-[8px] bg-chip px-2.5 py-1 text-[12px] text-fg disabled:opacity-60"
            >
              {perm === 'granted' ? 'Enabled' : perm === 'denied' ? 'Blocked in browser' : 'Enable'}
            </button>
          </div>
          <label className="mt-3 block text-[11.5px] text-fg-2">
            Phone push via <a className="underline" href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> topic — install the ntfy app and subscribe to the same topic
            <div className="mt-1 flex gap-2">
              <input
                value={ntfy}
                onChange={(e) => setNtfy(e.target.value.replace(/[^\w-]/g, ''))}
                onBlur={() => save({ ntfyTopic: ntfy })}
                placeholder="impulse-yourname-7f3a"
                className="h-9 flex-1 rounded-[9px] bg-field px-3 text-[12.5px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
              />
              <button
                disabled={!ntfy || !connected}
                onClick={() => (save({ ntfyTopic: ntfy }), bridgeSend({ type: 'test_notification' }), toast.success('Test sent to your phone'))}
                className="rounded-[9px] bg-chip px-3 text-[12px] text-fg disabled:opacity-40"
              >
                Test
              </button>
            </div>
          </label>
        </Section>

        <Section title="Use Impulse tools elsewhere">
          <p className="text-[12px] text-fg-2">The bridge exposes its tools as an MCP server, so you can also use them from your harness directly:</p>
          <button
            onClick={() => (void navigator.clipboard.writeText(mcpCmd), toast.success('Copied'))}
            className="num mt-2 flex w-full items-center gap-2 rounded-[9px] bg-black/30 px-3 py-2 text-left text-[11.5px] text-fg"
          >
            <span className="flex-1 truncate">{mcpCmd}</span>
            <Copy className="size-3.5 text-fg-2" />
          </button>
        </Section>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/[0.05] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-medium tracking-wide text-fg-2 uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
