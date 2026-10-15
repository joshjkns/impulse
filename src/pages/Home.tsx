import { useState } from 'react'
import { MarketBriefing } from '@/components/home/MarketBriefing'
import { MarketStrip } from '@/components/home/MarketStrip'
import { MarketsTable } from '@/components/home/MarketsTable'
import { ScansSidebar } from '@/components/home/ScansSidebar'

export default function Home() {
  const [selected, setSelected] = useState('BTC')
  return (
    <div className="flex h-full flex-col gap-2 px-2 pb-1">
      <div className="flex h-[156px] shrink-0 gap-2 rounded-[12px] bg-panel p-1.5">
        <MarketStrip />
        <MarketBriefing />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[12px] bg-panel">
        <ScansSidebar />
        <MarketsTable selected={selected} onSelect={setSelected} />
      </div>
    </div>
  )
}
