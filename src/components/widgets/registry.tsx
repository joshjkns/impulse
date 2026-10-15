import type { ComponentType } from 'react'
import { CandleChart } from '@/components/charts/CandleChart'
import { RichText } from '@/components/chat/RichText'
import { Orderbook } from '@/components/trade/Orderbook'
import { PositionsTabs } from '@/components/trade/PositionsTabs'
import type { Widget, WidgetKind } from '@/store/workspaces'
import { FundingWidget } from './FundingWidget'
import { LiquidationsWidget } from './LiquidationsWidget'
import { MonthlyReturnsWidget } from './MonthlyReturnsWidget'
import { OrderbookHeatmapWidget } from './OrderbookHeatmapWidget'
import { PriceOiWidget } from './PriceOiWidget'
import { VolumeProfileWidget } from './VolumeProfileWidget'
import { useEffect } from 'react'

export interface WidgetProps {
  coin: string
  widget: Widget
  /** Call once the first real data has rendered; flips the frame out of its drawing state. */
  onReady: () => void
}

function Ready({ onReady, children }: { onReady: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onReady, 400)
    return () => clearTimeout(t)
  }, [onReady])
  return <>{children}</>
}

export const WIDGETS: Record<WidgetKind, ComponentType<WidgetProps>> = {
  price_oi: PriceOiWidget,
  orderbook_heatmap: OrderbookHeatmapWidget,
  funding: FundingWidget,
  volume_profile: VolumeProfileWidget,
  liquidations: LiquidationsWidget,
  monthly_returns: MonthlyReturnsWidget,
  candles: ({ coin, onReady }) => (
    <Ready onReady={onReady}>
      <CandleChart coin={coin} interval="1h" bars={240} />
    </Ready>
  ),
  orderbook: ({ coin, onReady }) => (
    <Ready onReady={onReady}>
      <Orderbook coin={coin} className="h-full" />
    </Ready>
  ),
  trades: ({ coin, onReady }) => (
    <Ready onReady={onReady}>
      <Orderbook coin={coin} className="h-full" initialTab="trades" />
    </Ready>
  ),
  positions: ({ onReady }) => (
    <Ready onReady={onReady}>
      <PositionsTabs className="h-full" />
    </Ready>
  ),
  note: ({ widget, onReady }) => (
    <Ready onReady={onReady}>
      <div className="h-full overflow-y-auto px-4 pb-4 text-[12.5px] leading-relaxed text-fg">
        <RichText text={widget.body ?? ''} />
      </div>
    </Ready>
  ),
}
