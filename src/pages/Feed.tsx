import { Bell, Globe, LineChart, Trash2, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { LogoMark } from '@/components/brand/Logo'
import { CoinIcon } from '@/components/common'
import { bridgeSend, useBridgeStore } from '@/lib/bridge'
import { fmtClock, fmtDateTime, fmtPct, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useChat } from '@/store/chat'
import { useMarkets } from '@/store/markets'

const ICON = { bell: Bell, globe: Globe, chart: LineChart, bolt: Zap }

function when(t: number) {
  const d = new Date(t)
  const same = d.toDateString() === new Date().toDateString()
  return same ? fmtClock(t) : fmtDateTime(t)
}

export default function Feed() {
  const { feed, alerts, connected } = useBridgeStore()
  const markets = useMarkets((s) => s.markets)
  const send = useChat((s) => s.send)
  const movers = Object.values(markets)
    .filter((m) => m.dayNtlVlm > 5e6)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 8)

  return (
    <div className="flex h-full gap-2 px-2 pb-1">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px] bg-panel">
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <h1 className="text-[15px] font-medium text-fg">Feed</h1>
            <p className="text-[12px] text-fg-2">Everything your alerts caught, newest first.</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 no-scrollbar">
          {feed.length === 0 ? (
            <div className="grid h-full place-items-center">
              <div className="flex max-w-sm flex-col items-center text-center">
                <span className="grid size-11 place-items-center rounded-[11px] bg-black text-fg">
                  <LogoMark className="size-6" />
                </span>
                <p className="mt-3 text-[13px] text-fg">Nothing yet</p>
                <p className="mt-1 text-[12px] text-fg-2">Ask Impulse to watch something, like “Alert me when smart money starts shorting Crude Oil”.</p>
                <button
                  onClick={() => void send('Alert me when smart money starts shorting Crude Oil, and also ping me when the situation in the Middle East changes.', { surface: 'modal' })}
                  className="mt-4 rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] text-fg-2 ring-1 ring-white/[0.05] hover:bg-white/[0.1] hover:text-fg"
                >
                  Try it
                </button>
              </div>
            </div>
          ) : (
            <ol className="relative space-y-2 border-l border-white/[0.06] pl-5">
              <AnimatePresence initial={false}>
                {feed.map((f) => (
                  <motion.li
                    key={f.id}
                    layout
                    initial={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.25, ease: [0.2, 0.9, 0.1, 1] }}
                    className="relative rounded-[12px] bg-raised p-3"
                  >
                    <span className="absolute top-4 -left-[25px] size-2 rounded-full bg-brand ring-4 ring-panel" />
                    <div className="flex items-center gap-2 text-[11px] text-fg-3">
                      {f.coin && <CoinIcon coin={f.coin} className="size-3.5 rounded" />}
                      {when(f.at)}
                    </div>
                    <div className="mt-1 text-[13.5px] font-medium text-fg">{f.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-fg-2">{f.body}</div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>
      </section>

      <aside className="flex w-[320px] shrink-0 flex-col gap-2">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] bg-panel">
          <h2 className="px-4 pt-4 pb-2 text-[13px] text-fg">Active alerts</h2>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3 no-scrollbar">
            {!connected && <p className="px-1 text-[12px] text-fg-3">Alerts run in the local bridge. Start it with pnpm bridge.</p>}
            {connected && alerts.length === 0 && <p className="px-1 text-[12px] text-fg-3">No alerts yet.</p>}
            <AnimatePresence initial={false}>
              {alerts.map((a) => {
                const Icon = ICON[a.icon ?? 'bell'] ?? Bell
                return (
                  <motion.div
                    key={a.id}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="group flex gap-2.5 rounded-[12px] bg-raised p-2.5"
                  >
                    <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-brand text-white">
                      <Icon className="size-3" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] leading-tight font-medium text-fg">{a.title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-fg-2">{a.description}</div>
                      {a.lastFiredAt && <div className="mt-1 text-[10.5px] text-fg-3">Last fired {when(a.lastFiredAt)}</div>}
                    </div>
                    <button onClick={() => bridgeSend({ type: 'delete_alert', id: a.id })} className="self-start text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-down" aria-label="Delete alert">
                      <Trash2 className="size-3.5" />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </section>
        <section className="rounded-[12px] bg-panel p-3">
          <h2 className="px-1 pb-2 text-[13px] text-fg">Biggest movers</h2>
          {movers.map((m) => (
            <div key={m.coin} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[12.5px]">
              <CoinIcon coin={m.coin} className="size-4" />
              <span className="flex-1 truncate text-fg">{m.name}</span>
              <span className={cn('num', tone(m.changePct))}>{fmtPct(m.changePct)}</span>
            </div>
          ))}
        </section>
      </aside>
    </div>
  )
}
