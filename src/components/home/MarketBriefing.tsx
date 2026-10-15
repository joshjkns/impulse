import { ChevronRight, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { CoinIcon } from '@/components/common'
import { fmtPct } from '@/lib/format'
import { useBridgeStore } from '@/lib/bridge'
import { useChat } from '@/store/chat'
import { useMarkets, type Market } from '@/store/markets'

/** Summary computed from live data, as a string so a store selector can return it without re-render churn. */
function summarize(markets: Record<string, Market>) {
  const list = Object.values(markets).filter((m) => m.dayNtlVlm > 2.5e7)
  if (!list.length) return ''
  const by = (cls: Market['assetClass']) => list.filter((m) => m.assetClass === cls)
  const avg = (xs: Market[]) => xs.reduce((a, m) => a + m.changePct, 0) / Math.max(1, xs.length)
  const crypto = avg(by('Crypto'))
  const eq = avg(by('Equities'))
  const movers = [...list].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 2)
  const mood = (v: number) => (v > 0.5 ? 'firmer' : v < -0.5 ? 'weaker' : 'little changed')
  return JSON.stringify({
    text: `Crypto is ${mood(crypto)} (${fmtPct(crypto, 1)} avg) while equities are ${mood(eq)} (${fmtPct(eq, 1)}); ${movers[0].name} leads the tape at ${fmtPct(movers[0].changePct, 1)}.`,
    bullets: movers.map((m) => ({ coin: m.coin, text: `${m.name} ${m.changePct >= 0 ? 'up' : 'down'} ${Math.abs(m.changePct).toFixed(1)}% on the day` })),
  })
}

/**
 * The briefing shows the latest AI-written summary (pushed by the agent via the `set_briefing`
 * tool) and falls back to a summary computed from live market data.
 */
export function MarketBriefing() {
  // Re-renders only when the summary's wording changes, not on every price tick.
  const summary = useMarkets((s) => summarize(s.markets))
  const briefing = useBridgeStore((s) => s.briefing)
  const send = useChat((s) => s.send)
  const computed = useMemo(() => (summary ? (JSON.parse(summary) as { text: string; bullets: { coin?: string; text: string }[] }) : undefined), [summary])

  const view = briefing ?? computed

  return (
    <motion.button
      onClick={() => send('Give me a market briefing for today: what is moving across crypto, equities and commodities and why.', { surface: 'modal' })}
      whileTap={{ scale: 0.995 }}
      className="group flex w-[262px] shrink-0 flex-col rounded-[12px] bg-raised p-3 text-left transition-colors duration-150 hover:bg-[#24252a]"
    >
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand">
        <Sparkles className="size-3.5" />
        Market Briefing
        <ChevronRight className="ml-auto size-3.5 text-fg-2 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
      <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.4] font-medium text-fg">{view?.text ?? 'Reading the tape…'}</p>
      <div className="mt-auto space-y-1">
        {view?.bullets.slice(0, 2).map((b) => (
          <span key={b.text} className="flex items-center gap-1.5 text-[11px] text-fg">
            {b.coin ? <CoinIcon coin={b.coin} className="size-3.5 rounded" /> : <span className="size-1.5 rounded-full bg-fg-2" />}
            <span className="truncate">{b.text}</span>
          </span>
        ))}
      </div>
    </motion.button>
  )
}
