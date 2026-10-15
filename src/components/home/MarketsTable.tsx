import { ChevronDown, ChevronsUpDown, ChevronUp, Heart, ListFilter, PanelRight, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useMemo, useState } from 'react'
import { CoinIcon, LivePrice } from '@/components/common'
import { MarketSummary } from '@/components/home/MarketSummary'
import { useOpenMarket } from '@/components/shell/PortfolioPanel'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ASSET_CLASSES, INDUSTRIES, type AssetClass } from '@/lib/catalog'
import { fmtCompact, fmtPct, tone } from '@/lib/format'
import { applyScan, sortMarkets } from '@/lib/scan'
import { cn } from '@/lib/utils'
import { useMarkets, type Market } from '@/store/markets'
import { FEATURED_SCANS, usePrefs, type Scan, type SortKey } from '@/store/prefs'

const COLS: { key: SortKey; label: string; w: string }[] = [
  { key: 'markPx', label: 'Last Price', w: 'w-[92px]' },
  { key: 'changePct', label: 'Change', w: 'w-[88px]' },
  { key: 'dayNtlVlm', label: 'Volume', w: 'w-[88px]' },
  { key: 'openInterest', label: 'Open Interest', w: 'w-[104px]' },
  { key: 'funding', label: 'Funding', w: 'w-[84px]' },
]

export function MarketsTable({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
  const markets = useMarkets((s) => s.markets)
  const loaded = useMarkets((s) => s.loaded)
  const { favorites, toggleFavorite, scans, activeScan, showSummary, set } = usePrefs()
  const openMarket = useOpenMarket()
  const scan = [...scans, ...FEATURED_SCANS].find((s) => s.id === activeScan)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const [extra, setExtra] = useState<Scan>({ id: 'adhoc', name: '' })
  const [classes, setClasses] = useState<AssetClass[]>([])
  const [industries, setIndustries] = useState<string[]>([])

  const rows = useMemo(() => {
    let list = Object.values(markets)
    list = applyScan(list, scan, favorites)
    list = applyScan(list, { ...extra, assetClasses: classes, industries }, favorites)
    const s = sort ?? scan?.sort ?? { key: 'dayNtlVlm' as SortKey, dir: 'desc' as const }
    return sortMarkets(list, s.key, s.dir)
  }, [markets, scan, favorites, extra, classes, industries, sort])

  const activeSort = sort ?? scan?.sort ?? { key: 'dayNtlVlm', dir: 'desc' }
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))

  const chips = [
    extra.minVolume != null && { label: `Volume ≥ ${fmtCompact(extra.minVolume)}`, clear: () => setExtra({ ...extra, minVolume: undefined }) },
    extra.minChangePct != null && { label: `Change ≥ ${extra.minChangePct}%`, clear: () => setExtra({ ...extra, minChangePct: undefined }) },
    extra.maxChangePct != null && { label: `Change ≤ ${extra.maxChangePct}%`, clear: () => setExtra({ ...extra, maxChangePct: undefined }) },
    extra.favoritesOnly && { label: 'Favorites', clear: () => setExtra({ ...extra, favoritesOnly: undefined }) },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="px-4 pt-3">
        <h1 className="text-[15px] font-medium text-fg">{scan?.name ?? 'All Markets'}</h1>
        <div className="mt-3 flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolbarButton>
                <ListFilter className="size-3.5" /> Add filter
              </ToolbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Volume (24h)</DropdownMenuLabel>
              {[1e6, 1e7, 1e8].map((v) => (
                <DropdownMenuItem key={v} onSelect={() => setExtra({ ...extra, minVolume: v })}>
                  At least {fmtCompact(v)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Change (24h)</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setExtra({ ...extra, minChangePct: 0, maxChangePct: undefined })}>Gainers</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setExtra({ ...extra, maxChangePct: 0, minChangePct: undefined })}>Losers</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setExtra({ ...extra, minChangePct: 5 })}>Up 5% or more</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setExtra({ ...extra, maxChangePct: -5 })}>Down 5% or more</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setExtra({ ...extra, favoritesOnly: true })}>Favorites only</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <MultiSelect label="Asset class" options={ASSET_CLASSES} value={classes} onChange={(v) => setClasses(v as AssetClass[])} />
          <MultiSelect label="Industry" options={INDUSTRIES} value={industries} onChange={setIndustries} />
          <AnimatePresence initial={false}>
            {chips.map((c) => (
              <motion.button
                key={c.label}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.14 }}
                onClick={c.clear}
                className="flex h-[26px] items-center gap-1 rounded-[8px] bg-brand-soft px-2 text-[12px] text-brand"
              >
                {c.label} <X className="size-3" />
              </motion.button>
            ))}
          </AnimatePresence>
          <button
            onClick={() => set({ showSummary: !showSummary })}
            className="ml-auto flex items-center gap-1.5 text-[12px] text-fg-2 transition-colors hover:text-fg"
          >
            <PanelRight className="size-3.5" />
            {showSummary ? 'Hide summary' : 'Show summary'}
          </button>
        </div>
      </div>

      <div className="mt-2 flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto no-scrollbar">
          <div className="min-w-[640px]">
            <div className="sticky top-0 z-10 flex h-9 items-center bg-panel pr-4 pl-4 text-[11.5px] text-fg-2">
              <span className="w-8" />
              <span className="flex-1">{loaded ? `${rows.length} markets` : 'Loading markets…'}</span>
              {COLS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={cn('flex items-center justify-end gap-0.5 text-right transition-colors hover:text-fg', c.w, activeSort.key === c.key && 'text-fg')}
                >
                  {c.label}
                  {activeSort.key === c.key ? (
                    activeSort.dir === 'desc' ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />
                  ) : (
                    c.key === 'changePct' && <ChevronsUpDown className="size-3" />
                  )}
                </button>
              ))}
            </div>
            <motion.div key={activeScan} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
              {rows.map((m) => (
                <MarketRow
                  key={m.coin}
                  m={m}
                  fav={favorites.includes(m.coin)}
                  selected={selected === m.coin && showSummary}
                  onSelect={onSelect}
                  onOpen={openMarket}
                  onFavorite={toggleFavorite}
                />
              ))}
            </motion.div>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {showSummary && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 316, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.9, 0.1, 1] }}
              className="shrink-0 overflow-hidden border-l border-white/[0.04]"
            >
              <MarketSummary coin={selected} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

interface RowProps {
  m: Market
  fav: boolean
  selected: boolean
  onSelect: (coin: string) => void
  onOpen: (coin: string) => void
  onFavorite: (coin: string) => void
}

/** Rows only re-render when their own market ticks (unchanged markets keep their object identity). */
const MarketRow = memo(
  function MarketRow({ m, fav, selected, onSelect, onOpen, onFavorite }: RowProps) {
    return (
      <div
        onClick={() => onSelect(m.coin)}
        onDoubleClick={() => onOpen(m.coin)}
        className={cn(
          'group flex h-[37.5px] cursor-pointer items-center border-t border-white/[0.035] pr-4 pl-4 text-[12.5px] transition-colors duration-100 [contain-intrinsic-size:auto_37.5px] [content-visibility:auto]',
          selected ? 'bg-hover/70' : 'hover:bg-hover/40',
        )}
      >
        <button onClick={(e) => (e.stopPropagation(), onFavorite(m.coin))} className="w-8 text-fg-3 transition-transform active:scale-75" aria-label="Favorite">
          <Heart className={cn('size-3.5 transition-colors', fav ? 'fill-heart text-heart' : 'fill-[#5a5a62] text-[#5a5a62]')} />
        </button>
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <CoinIcon coin={m.coin} className="size-[19px]" />
          <span className="truncate text-fg">{m.name}</span>
        </span>
        <LivePrice value={m.markPx} className="w-[92px] text-right text-fg" />
        <span className={cn('num w-[88px] text-right', tone(m.changePct))}>{fmtPct(m.changePct)}</span>
        <span className="num w-[88px] text-right text-fg">{fmtCompact(m.dayNtlVlm)}</span>
        <span className="num w-[104px] text-right text-fg">{fmtCompact(m.openInterest)}</span>
        <span className={cn('num w-[84px] text-right', tone(m.funding))}>{fmtPct(m.funding * 100, 4)}</span>
      </div>
    )
  },
  // Handlers are recreated by the parent each render but always do the same thing.
  (a, b) => a.m === b.m && a.fav === b.fav && a.selected === b.selected,
)

const ToolbarButton = ({ children, className, ...p }: React.ComponentProps<'button'>) => (
  <button
    {...p}
    className={cn(
      'flex h-[26px] items-center gap-1.5 rounded-[8px] bg-raised px-2.5 text-[12px] text-fg ring-1 ring-white/[0.04] transition-colors duration-150 hover:bg-hover data-[state=open]:bg-hover',
      className,
    )}
  >
    {children}
  </button>
)

function MultiSelect({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton className={cn(value.length && 'text-brand')}>
          {value.length ? `${label} · ${value.length}` : label}
          <ChevronDown className="size-3 text-fg-2" />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={value.includes(o)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => onChange(c ? [...value, o] : value.filter((x) => x !== o))}
          >
            {o}
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
