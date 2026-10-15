import { Command } from 'cmdk'
import { Check, ChevronDown, Settings2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useBridgeStore } from '@/lib/bridge'
import { cn } from '@/lib/utils'
import { resolvePick, useChat, type ModelPick } from '@/store/chat'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'

/** A harness the user can run on, with the models the picker offers for it. */
export interface Provider {
  id: string
  name: string
  mcp: boolean
  /** Harness takes a model flag; otherwise only its own default is offered. */
  modelFlag: boolean
  models: string[]
}

const CUSTOM_NAME = 'Custom command'

/** Installed harnesses (plus the custom command when set), each with suggested, discovered and recently used models. */
export function useProviders(): Provider[] {
  const harnesses = useBridgeStore((s) => s.harnesses)
  const custom = useBridgeStore((s) => s.settings.customCommand)
  const recent = usePrefs((s) => s.recentModels)
  const defaults = usePrefs((s) => s.defaultModels)
  return useMemo(() => {
    const list: Provider[] = harnesses
      .filter((h) => h.installed)
      .map((h) => ({ id: h.id, name: h.name, mcp: h.mcp, modelFlag: h.modelFlag ?? true, models: h.models ?? [] }))
    if (custom) list.push({ id: 'custom', name: CUSTOM_NAME, mcp: true, modelFlag: true, models: [] })
    return list.map((p) => ({
      ...p,
      models: p.modelFlag ? Array.from(new Set([defaults[p.id], ...p.models, ...(recent[p.id] ?? [])].filter((m): m is string => !!m))) : [],
    }))
  }, [harnesses, custom, recent, defaults])
}

export function useProviderName() {
  const harnesses = useBridgeStore((s) => s.harnesses)
  return (id: string) => (id === 'custom' ? CUSTOM_NAME : (harnesses.find((h) => h.id === id)?.name ?? id))
}

/**
 * Searchable provider → model menu. Picking "Default" yields `model: undefined`; typing an id that isn't
 * listed offers it as a custom model for the current provider.
 */
export function ModelMenu({
  providers,
  value,
  onPick,
  defaultLabel,
  children,
  footer,
  align = 'start',
  side = 'top',
}: {
  providers: Provider[]
  value: ModelPick
  onPick: (pick: ModelPick) => void
  /** What "Default" resolves to for a provider, shown beside it. */
  defaultLabel: (p: Provider) => string
  children: ReactNode
  footer?: (close: () => void) => ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rememberModel = usePrefs((s) => s.rememberModel)
  // The current provider leads, so its models are what Enter and the arrow keys reach first.
  const ordered = useMemo(() => [...providers].sort((a, b) => Number(b.id === value.harness) - Number(a.id === value.harness)), [providers, value.harness])
  const current = providers.find((p) => p.id === value.harness)
  const typed = search.trim()
  const offerCustom = !!typed && !!current?.modelFlag && !/\s/.test(typed) && !current.models.includes(typed)

  const pick = (p: ModelPick) => {
    if (p.model && !providers.find((x) => x.id === p.harness)?.models.includes(p.model)) rememberModel(p.harness, p.model)
    onPick(p)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setSearch(''))}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} collisionPadding={8} className="w-[300px] gap-0 overflow-hidden rounded-xl border-line bg-popover p-0">
        <Command loop className="flex max-h-[360px] flex-col">
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder={current?.modelFlag ? 'Search or type a model id' : 'Search models'}
            className="h-9 shrink-0 border-b border-line bg-transparent px-3 text-[12.5px] text-fg outline-none placeholder:text-fg-3"
          />
          <Command.List className="min-h-0 flex-1 overflow-y-auto p-1 no-scrollbar">
            {!offerCustom && (
              <Command.Empty className="px-2 py-3 text-center text-[12px] text-fg-3">
                {providers.length ? 'No matching models' : 'No harness found. Start the bridge or install one.'}
              </Command.Empty>
            )}
            {ordered.map((p) => (
              <Command.Group
                key={p.id}
                heading={
                  <span className="flex items-center gap-1.5">
                    {p.name}
                    {!p.mcp && <span className="rounded bg-chip px-1 text-[9.5px] text-fg-2 normal-case">CLI tools</span>}
                  </span>
                }
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-3 [&_[cmdk-group-heading]]:uppercase"
              >
                <Item value={`${p.id}::default`} keywords={[p.name, 'default']} onSelect={() => pick({ harness: p.id })}>
                  <span className="flex-1">Default</span>
                  <span className="max-w-[140px] truncate text-[11px] text-fg-3">{defaultLabel(p)}</span>
                  <Tick on={value.harness === p.id && value.model === undefined} />
                </Item>
                {p.models.map((m) => (
                  <Item key={m} value={`${p.id}::${m}`} keywords={[p.name, m]} onSelect={() => pick({ harness: p.id, model: m })}>
                    <span className="min-w-0 flex-1 truncate">{m}</span>
                    <Tick on={value.harness === p.id && value.model === m} />
                  </Item>
                ))}
                {!p.modelFlag && <div className="px-2 pb-1 text-[11px] text-fg-3">{p.name} picks its model itself.</div>}
              </Command.Group>
            ))}
            {offerCustom && current && (
              <Command.Group forceMount>
                <Item value="__custom-model__" forceMount onSelect={() => pick({ harness: current.id, model: typed })}>
                  <span className="min-w-0 flex-1 truncate">
                    Use <span className="text-fg">{typed}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-fg-3">{current.name}</span>
                </Item>
              </Command.Group>
            )}
          </Command.List>
          {footer && <div className="shrink-0 border-t border-line p-1">{footer(() => setOpen(false))}</div>}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function Item({ className, ...p }: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      {...p}
      className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-fg-2 outline-none data-[selected=true]:bg-hover data-[selected=true]:text-fg', className)}
    />
  )
}

const Tick = ({ on }: { on: boolean }) => <Check className={cn('size-3.5 shrink-0 text-brand', !on && 'invisible')} />

/** Composer chip showing the active chat's provider · model, opening the picker. */
export function ModelPicker({ compact }: { compact?: boolean }) {
  const threadPick = useChat((s) => s.threads.find((t) => t.id === s.activeThread)?.pick)
  const setPick = useChat((s) => s.setPick)
  usePrefs((s) => `${s.harness}:${s.model ?? ''}`) // re-render when the fallback pick changes
  const defaults = usePrefs((s) => s.defaultModels)
  const connected = useBridgeStore((s) => s.connected)
  const harnesses = useBridgeStore((s) => s.harnesses)
  const openSettings = useUI((s) => s.openSettings)
  const providers = useProviders()
  const providerName = useProviderName()

  const pick = threadPick ?? resolvePick()
  const model = pick.model ?? defaults[pick.harness] ?? ''
  const missing = connected && harnesses.length > 0 && !providers.some((p) => p.id === pick.harness)

  return (
    <ModelMenu
      providers={providers}
      value={pick}
      onPick={setPick}
      defaultLabel={(p) => defaults[p.id] || (p.modelFlag ? 'harness default' : '')}
      footer={(close) => (
        <button
          onClick={() => (openSettings(true, 'agent'), close())}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-fg-2 hover:bg-hover hover:text-fg"
        >
          <Settings2 className="size-3.5" /> Default models & harnesses
        </button>
      )}
    >
      <button
        className={cn(
          'flex h-6 min-w-0 items-center gap-1 rounded-full px-2 text-[11.5px] text-fg-2 transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg',
          compact ? 'max-w-[170px]' : 'max-w-[280px]',
        )}
        title={!connected ? 'Bridge offline' : missing ? `${providerName(pick.harness)} is not installed` : `${providerName(pick.harness)} · ${model || 'default model'}`}
      >
        <span className={cn('size-1.5 shrink-0 rounded-full', !connected ? 'bg-fg-3' : missing ? 'bg-down' : 'bg-up')} />
        <span className="shrink-0 truncate">{providerName(pick.harness)}</span>
        <span className="text-fg-3">·</span>
        <span className="min-w-0 truncate text-fg">{model || 'Default'}</span>
        <ChevronDown className="size-3 shrink-0 opacity-70" />
      </button>
    </ModelMenu>
  )
}
