import { useState } from 'react'
import { toast } from 'sonner'
import { bridgeSend, playChime, useBridgeStore } from '@/lib/bridge'
import { fmtClock } from '@/lib/format'
import { ACCENTS, THEMES } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useChat } from '@/store/chat'
import { usePrefs } from '@/store/prefs'
import { useWorkspaces } from '@/store/workspaces'
import { Button, DangerButton, Group, Page, Row, Segmented, Stepper, TextField, Toggle } from './controls'

// A fixed afternoon time so the preview shows the 12h/24h difference.
const SAMPLE_TIME = new Date(2026, 0, 1, 15, 30).getTime()

export function TradingPage() {
  const p = usePrefs()
  return (
    <Page title="Trading" description="Defaults for new order tickets, including ones the AI proposes. Markets you've already traded keep the leverage you last used.">
      <Group title="Order defaults">
        <Row label="Leverage" hint="Capped at each market's maximum.">
          <Stepper value={p.defaultLeverage} min={1} max={50} onChange={(v) => p.set({ defaultLeverage: v })} suffix="×" />
        </Row>
        <Row label="Margin mode" hint="Isolated limits a loss to the position's own margin.">
          <Segmented
            id="margin"
            value={p.defaultMarginMode}
            onChange={(v) => p.set({ defaultMarginMode: v })}
            options={[
              { value: 'isolated', label: 'Isolated' },
              { value: 'cross', label: 'Cross' },
            ]}
          />
        </Row>
        <Row label="Order type">
          <Segmented
            id="otype"
            value={p.defaultOrderType}
            onChange={(v) => p.set({ defaultOrderType: v })}
            options={[
              { value: 'market', label: 'Market' },
              { value: 'limit', label: 'Limit' },
            ]}
          />
        </Row>
      </Group>

      <Group title="Execution">
        <Row label="Max slippage" hint="Market orders won't fill worse than this from the mid price.">
          <Segmented
            id="slip"
            value={p.maxSlippagePct}
            onChange={(v) => p.set({ maxSlippagePct: v })}
            options={[0.5, 1, 3, 5, 8].map((v) => ({ value: v, label: `${v}%` }))}
          />
        </Row>
        <Row label="Confirm orders" hint="Place and Close need a second click within 3 seconds.">
          <Toggle checked={p.confirmOrders} onChange={(v) => p.set({ confirmOrders: v })} label="Confirm orders" />
        </Row>
      </Group>
    </Page>
  )
}

export function DisplayPage() {
  const p = usePrefs()
  return (
    <Page title="Display" description="How the terminal looks and moves.">
      <Group title="Theme">
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => p.set({ theme: t.id })}
              aria-pressed={p.theme === t.id}
              className={cn(
                'overflow-hidden rounded-[10px] text-left ring-1 transition-shadow duration-150',
                p.theme === t.id ? 'ring-2 ring-brand' : 'ring-line hover:ring-ring',
              )}
            >
              <div className="flex h-14 gap-1.5 p-2" style={{ background: t.vars.canvas }}>
                <div className="w-1/3 rounded-[5px]" style={{ background: t.vars.panel }} />
                <div className="flex flex-1 flex-col gap-1.5 rounded-[5px] p-1.5" style={{ background: t.vars.panel }}>
                  <div className="h-1.5 w-3/4 rounded-full" style={{ background: t.vars.fg }} />
                  <div className="h-1.5 w-1/2 rounded-full" style={{ background: t.vars['fg-3'] }} />
                  <div className="mt-auto h-1.5 w-1/3 rounded-full bg-brand" />
                </div>
              </div>
              <div className="px-2.5 py-1.5 text-[12px] text-fg" style={{ background: t.vars.raised }}>
                {t.label}
              </div>
            </button>
          ))}
        </div>
        <Row label="Accent" hint="Buttons, toggles, links and your chat bubbles.">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => p.set({ accent: a.id })}
              aria-label={a.label}
              aria-pressed={p.accent === a.id}
              title={a.label}
              className={cn(
                'size-5 rounded-full ring-offset-2 ring-offset-panel transition-shadow',
                p.accent === a.id ? 'ring-2 ring-fg' : 'hover:ring-1 hover:ring-fg-3',
              )}
              style={{ background: a.color }}
            />
          ))}
        </Row>
      </Group>
      <Group title="Prices">
        <Row label="Flash on price change" hint="Briefly tint prices green or red when they tick.">
          <Toggle checked={p.priceFlash} onChange={(v) => p.set({ priceFlash: v })} label="Flash on price change" />
        </Row>
        <Row label="24-hour clock" hint={`Times show as ${fmtClock(SAMPLE_TIME)}.`}>
          <Toggle checked={p.clock24h} onChange={(v) => p.set({ clock24h: v })} label="24-hour clock" />
        </Row>
      </Group>
      <Group title="Layout">
        <Row label="Favorites ticker" hint="Scrolling prices of your favorites in the footer.">
          <Toggle checked={p.footerTicker} onChange={(v) => p.set({ footerTicker: v })} label="Favorites ticker" />
        </Row>
        <Row label="Market summary on Home" hint="Detail panel beside the markets table.">
          <Toggle checked={p.showSummary} onChange={(v) => p.set({ showSummary: v })} label="Market summary" />
        </Row>
        <Row label="Portfolio panel on Home">
          <Toggle checked={p.portfolioOpen} onChange={(v) => p.set({ portfolioOpen: v })} label="Portfolio panel" />
        </Row>
      </Group>
      <Group title="Accessibility">
        <Row label="Reduce motion" hint="Turn off springs, slides and blur transitions. Also follows your system setting.">
          <Toggle checked={p.reduceMotion} onChange={(v) => p.set({ reduceMotion: v })} label="Reduce motion" />
        </Row>
      </Group>
    </Page>
  )
}

export function NotificationsPage() {
  const p = usePrefs()
  const { connected, settings } = useBridgeStore()
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

  const saveNtfy = (ntfyTopic: string) => {
    bridgeSend({ type: 'settings', settings: { ntfyTopic } })
    useBridgeStore.setState({ settings: { ...settings, ntfyTopic } })
  }

  return (
    <Page title="Notifications" description="How you hear about alerts you've set up with the AI.">
      <Group title="In app">
        <Row label="Alert pop-ups" hint="Show a banner at the top of the window when an alert fires.">
          <Toggle checked={p.alertPopups} onChange={(v) => p.set({ alertPopups: v })} label="Alert pop-ups" />
        </Row>
        <Row label="Sound" hint="Play a short chime when an alert fires.">
          <Button onClick={playChime}>Test</Button>
          <Toggle checked={p.alertSound} onChange={(v) => p.set({ alertSound: v })} label="Sound" />
        </Row>
      </Group>
      <Group title="Desktop">
        <Row label="Desktop notifications" hint="Shown when Impulse is in a background tab.">
          <Button disabled={perm !== 'default'} onClick={() => Notification.requestPermission().then(setPerm)}>
            {perm === 'granted' ? 'Enabled' : perm === 'denied' ? 'Blocked in browser' : 'Enable'}
          </Button>
        </Row>
      </Group>
      <Group title="Phone">
        <Row
          label="ntfy topic"
          hint={
            <>
              Install the{' '}
              <a className="underline" href="https://ntfy.sh" target="_blank" rel="noreferrer">
                ntfy
              </a>{' '}
              app and subscribe to the same topic. Pick something hard to guess.
            </>
          }
        />
        <div className="flex gap-2 px-3.5 pb-3">
          <TextField value={settings.ntfyTopic} onCommit={saveNtfy} placeholder="impulse-yourname-7f3a" sanitize={(s) => s.replace(/[^\w-]/g, '')} />
          <Button
            disabled={!settings.ntfyTopic || !connected}
            onClick={() => (bridgeSend({ type: 'test_notification' }), toast.success('Test sent to your phone'))}
          >
            Test
          </Button>
        </div>
      </Group>
    </Page>
  )
}

export function DataPage() {
  const p = usePrefs()
  const threads = useChat((s) => s.threads.length)
  const tabs = useWorkspaces((s) => s.tabs.length)
  const feed = useBridgeStore((s) => s.feed.length)

  const resetPrefs = () => {
    // Keep accounts and the AI harness: those are set up deliberately, not preferences.
    const { watched, harness, model, defaultModels, recentModels } = usePrefs.getState()
    usePrefs.setState({ ...usePrefs.getInitialState(), watched, harness, model, defaultModels, recentModels })
    toast.success('Preferences reset')
  }

  const exportAll = () => {
    const dump: Record<string, unknown> = {}
    for (const k of ['impulse.prefs', 'impulse.workspaces', 'impulse.chat', 'impulse.feed']) {
      try {
        const v = localStorage.getItem(k)
        if (v) dump[k] = JSON.parse(v)
      } catch {
        /* skip */
      }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `impulse-backup-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Page title="Data & storage" description="Everything is stored in this browser. Trading keys are never included in exports.">
      <Group title="Saved here">
        <Row label="Favorites" hint={`${p.favorites.length} markets`}>
          <DangerButton onConfirm={() => p.set({ favorites: [] })}>Clear</DangerButton>
        </Row>
        <Row label="Market scans" hint={`${p.scans.length} saved scans`}>
          <DangerButton onConfirm={() => p.set({ scans: usePrefs.getInitialState().scans, activeScan: 'all' })}>Reset to defaults</DangerButton>
        </Row>
        <Row label="Chat history" hint={`${threads} conversation${threads === 1 ? '' : 's'}`}>
          <DangerButton onConfirm={() => (useChat.setState({ threads: [], activeThread: undefined, queue: [] }), toast.success('Chat history cleared'))}>Clear</DangerButton>
        </Row>
        <Row label="Alert feed" hint={`${feed} items`}>
          <DangerButton
            onConfirm={() => {
              useBridgeStore.setState({ feed: [] })
              try {
                localStorage.removeItem('impulse.feed')
              } catch {
                /* ignore */
              }
            }}
          >
            Clear
          </DangerButton>
        </Row>
        <Row label="Workspaces" hint={`${tabs} open tabs`}>
          <DangerButton onConfirm={() => (useWorkspaces.setState(useWorkspaces.getInitialState()), toast.success('Workspaces reset'))}>Reset</DangerButton>
        </Row>
      </Group>
      <Group title="Backup">
        <Row label="Export" hint="Download preferences, workspaces, chats and feed as JSON.">
          <Button onClick={exportAll}>Export</Button>
        </Row>
        <Row label="Reset preferences" hint="Restore trading, display and notification defaults. Keeps accounts and AI settings.">
          <DangerButton onConfirm={resetPrefs}>Reset</DangerButton>
        </Row>
      </Group>
    </Page>
  )
}
