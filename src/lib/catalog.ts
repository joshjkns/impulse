/**
 * Human metadata for Hyperliquid markets. The exchange only gives tickers; this maps them to
 * display names, asset classes and industries used by filters, scans and the AI tools.
 * Anything not listed falls back to its ticker and a heuristic asset class.
 */
export type AssetClass = 'Crypto' | 'Equities' | 'Commodities' | 'Indices' | 'FX'

export interface CatalogEntry {
  name: string
  assetClass: AssetClass
  industries?: string[]
  region?: string
  description?: string
}

const C = (name: string, industries: string[] = [], description?: string): CatalogEntry => ({
  name,
  assetClass: 'Crypto',
  industries: ['Crypto', ...industries],
  description,
})
const E = (name: string, industries: string[], region = 'US', description?: string): CatalogEntry => ({
  name,
  assetClass: 'Equities',
  industries,
  region,
  description,
})
const K = (name: string, industries: string[] = ['Commodities'], description?: string): CatalogEntry => ({
  name,
  assetClass: 'Commodities',
  industries,
  description,
})
const I = (name: string, region = 'US', description?: string): CatalogEntry => ({
  name,
  assetClass: 'Indices',
  industries: ['Index'],
  region,
  description,
})
const F = (name: string): CatalogEntry => ({ name, assetClass: 'FX', industries: ['Currencies'] })

const SEMI = ['Semiconductors', 'AI']
const MEM = ['Semiconductors', 'Memory', 'AI']

export const CATALOG: Record<string, CatalogEntry> = {
  BTC: C('Bitcoin', ['Layer 1', 'Store of value'],
    'Bitcoin is a decentralized digital currency that allows for peer-to-peer transactions without the need for a central authority or intermediary. It operates on a blockchain that launched in 2009 and was founded by the anonymous Satoshi Nakamoto. It was the first blockchain that gained popularity.'),
  ETH: C('Ethereum', ['Layer 1', 'Smart contracts'],
    'Ethereum is a decentralized, open-source blockchain with smart contract functionality. Ether is the native cryptocurrency of the platform and the second-largest cryptocurrency by market capitalization.'),
  HYPE: C('Hyperliquid', ['Layer 1', 'DeFi'],
    'Hyperliquid is a performant L1 optimized for trading, home to a fully onchain order book for perpetuals and spot. HYPE is its native token used for staking, gas and governance.'),
  SOL: C('Solana', ['Layer 1'], 'Solana is a high-throughput layer-1 blockchain using proof of history alongside proof of stake.'),
  NEAR: C('NEAR Protocol', ['Layer 1', 'AI'], 'NEAR is a sharded proof-of-stake layer-1 focused on usability and chain abstraction.'),
  ZEC: C('Zcash', ['Privacy'], 'Zcash is a privacy-focused cryptocurrency that uses zero-knowledge proofs to shield transactions.'),
  XRP: C('XRP', ['Payments']),
  DOGE: C('Dogecoin', ['Meme']),
  SUI: C('Sui', ['Layer 1']),
  AVAX: C('Avalanche', ['Layer 1']),
  LINK: C('Chainlink', ['Oracles']),
  BNB: C('BNB', ['Layer 1', 'Exchange']),
  ADA: C('Cardano', ['Layer 1']),
  LTC: C('Litecoin', ['Payments']),
  ENA: C('Ethena', ['DeFi']),
  AAVE: C('Aave', ['DeFi']),
  PUMP: C('Pump.fun', ['Meme']),
  TAO: C('Bittensor', ['AI']),
  FARTCOIN: C('Fartcoin', ['Meme']),
  kPEPE: C('Pepe', ['Meme']),
  WLD: C('Worldcoin', ['AI']),
  VIRTUAL: C('Virtuals Protocol', ['AI']),

  'xyz:XYZ100': I('Nasdaq 100', 'US', 'Tracks the Nasdaq-100, the 100 largest non-financial companies listed on the Nasdaq.'),
  'xyz:SP500': I('S&P 500', 'US', 'Tracks the S&P 500, a market-cap weighted index of 500 leading US companies.'),
  'xyz:KR200': I('KOSPI 200', 'Korea', 'Tracks the KOSPI 200, the 200 largest companies on the Korea Exchange.'),
  'xyz:JP225': I('Nikkei 225', 'Japan'),
  'xyz:NIFTY': I('Nifty 50', 'India'),
  'xyz:IBOV': I('Ibovespa', 'Brazil'),
  'xyz:VIX': I('VIX', 'US'),
  'xyz:DXY': I('US Dollar Index', 'US'),
  'xyz:EWY': I('iShares MSCI South Korea', 'Korea'),
  'xyz:EWJ': I('iShares MSCI Japan', 'Japan'),
  'xyz:EWT': I('iShares MSCI Taiwan', 'Taiwan'),
  'xyz:EWZ': I('iShares MSCI Brazil', 'Brazil'),
  'xyz:SMH': { ...I('VanEck Semiconductor ETF'), industries: ['Index', ...SEMI] },
  'xyz:SOXL': { ...I('Direxion Semi Bull 3x'), industries: ['Index', ...SEMI] },
  'xyz:DRAM': { ...I('DRAM ETF'), industries: ['Index', ...MEM] },
  'xyz:XLE': I('Energy Select Sector SPDR'),
  'xyz:TLT': I('iShares 20+ Year Treasury'),
  'xyz:MAGS': I('Magnificent Seven ETF'),

  'xyz:NVDA': E('NVIDIA', SEMI, 'US', 'NVIDIA designs GPUs and accelerated computing platforms that power gaming, data centers and AI training.'),
  'xyz:AMD': E('AMD', SEMI),
  'xyz:INTC': E('Intel', SEMI),
  'xyz:MU': E('Micron Technology', MEM, 'US', 'Micron manufactures DRAM and NAND memory and storage products.'),
  'xyz:SNDK': E('SanDisk', MEM, 'US', 'SanDisk designs and manufactures NAND flash memory and storage solutions.'),
  'xyz:SKHX': E('SK Hynix', MEM, 'Korea', 'SK hynix is a South Korean memory chipmaker and a leading supplier of high-bandwidth memory for AI accelerators.'),
  'xyz:SKHY': E('SK Hynix ADR', MEM, 'Korea'),
  'xyz:SMSN': E('Samsung Electronics', MEM, 'Korea'),
  'xyz:TSM': E('TSMC', SEMI, 'Taiwan'),
  'xyz:ASML': E('ASML', SEMI, 'Europe'),
  'xyz:AVGO': E('Broadcom', SEMI),
  'xyz:QCOM': E('Qualcomm', SEMI),
  'xyz:MRVL': E('Marvell', SEMI),
  'xyz:ARM': E('Arm Holdings', SEMI, 'UK'),
  'xyz:AMAT': E('Applied Materials', SEMI),
  'xyz:LRCX': E('Lam Research', SEMI),
  'xyz:WDC': E('Western Digital', MEM),
  'xyz:KIOXIA': E('Kioxia', MEM, 'Japan'),
  'xyz:CXMT': E('CXMT', MEM, 'China'),
  'xyz:YMTC': E('YMTC', MEM, 'China'),
  'xyz:GIGADEV': E('GigaDevice', MEM, 'China'),
  'xyz:CAMBRICON': E('Cambricon', SEMI, 'China'),
  'xyz:UMC': E('UMC', SEMI, 'Taiwan'),
  'xyz:IBIDEN': E('Ibiden', SEMI, 'Japan'),
  'xyz:H100': E('H100 Rental Index', ['AI', 'Compute']),
  'xyz:TSLA': E('Tesla', ['Automotive', 'AI']),
  'xyz:AAPL': E('Apple', ['Consumer tech']),
  'xyz:MSFT': E('Microsoft', ['Software', 'AI']),
  'xyz:GOOGL': E('Alphabet', ['Internet', 'AI']),
  'xyz:AMZN': E('Amazon', ['Internet', 'Cloud']),
  'xyz:META': E('Meta Platforms', ['Internet', 'AI']),
  'xyz:NFLX': E('Netflix', ['Media']),
  'xyz:ORCL': E('Oracle', ['Software', 'Cloud', 'AI']),
  'xyz:PLTR': E('Palantir', ['Software', 'AI']),
  'xyz:COIN': E('Coinbase', ['Crypto equities', 'Exchange']),
  'xyz:HOOD': E('Robinhood', ['Fintech']),
  'xyz:MSTR': E('Strategy', ['Crypto equities']),
  'xyz:CRCL': E('Circle', ['Crypto equities', 'Fintech']),
  'xyz:CRWV': E('CoreWeave', ['Cloud', 'AI']),
  'xyz:NBIS': E('Nebius', ['Cloud', 'AI']),
  'xyz:IREN': E('IREN', ['Cloud', 'AI']),
  'xyz:DELL': E('Dell', ['Hardware', 'AI']),
  'xyz:IBM': E('IBM', ['Software']),
  'xyz:NOW': E('ServiceNow', ['Software']),
  'xyz:NET': E('Cloudflare', ['Software']),
  'xyz:CRWD': E('CrowdStrike', ['Software', 'Security']),
  'xyz:RDDT': E('Reddit', ['Internet']),
  'xyz:BABA': E('Alibaba', ['Internet'], 'China'),
  'xyz:SOFTBANK': E('SoftBank', ['Conglomerate', 'AI'], 'Japan'),
  'xyz:HYUNDAI': E('Hyundai Motor', ['Automotive'], 'Korea'),
  'xyz:LLY': E('Eli Lilly', ['Healthcare']),
  'xyz:COST': E('Costco', ['Retail']),
  'xyz:GME': E('GameStop', ['Retail']),
  'xyz:RIVN': E('Rivian', ['Automotive']),
  'xyz:RKLB': E('Rocket Lab', ['Aerospace']),
  'xyz:GEV': E('GE Vernova', ['Energy']),
  'xyz:CVX': E('Chevron', ['Energy']),

  'xyz:CL': K('WTI Crude Oil', ['Energy', 'Commodities'],
    'West Texas Intermediate crude oil, the US benchmark for oil prices, priced in dollars per barrel and closely tied to OPEC+ supply decisions and Middle East geopolitics.'),
  'xyz:BRENTOIL': K('Brent Crude Oil', ['Energy', 'Commodities']),
  'xyz:NATGAS': K('Natural Gas', ['Energy', 'Commodities']),
  'xyz:HO': K('Heating Oil', ['Energy', 'Commodities']),
  'xyz:TTF': K('Dutch TTF Gas', ['Energy', 'Commodities']),
  'xyz:GOLD': K('Gold', ['Metals', 'Commodities'], 'Gold spot price in US dollars per troy ounce, a classic safe-haven asset.'),
  'xyz:SILVER': K('Silver', ['Metals', 'Commodities']),
  'xyz:PLATINUM': K('Platinum', ['Metals', 'Commodities']),
  'xyz:PALLADIUM': K('Palladium', ['Metals', 'Commodities']),
  'xyz:COPPER': K('Copper', ['Metals', 'Commodities']),
  'xyz:ALUMINIUM': K('Aluminium', ['Metals', 'Commodities']),
  'xyz:URANIUM': K('Uranium', ['Energy', 'Commodities']),
  'xyz:CORN': K('Corn', ['Agriculture', 'Commodities']),
  'xyz:WHEAT': K('Wheat', ['Agriculture', 'Commodities']),

  'xyz:EUR': F('Euro'),
  'xyz:JPY': F('Japanese Yen'),
  'xyz:GBP': F('British Pound'),
  'xyz:KRW': F('Korean Won'),
}

export function catalogFor(coin: string): CatalogEntry {
  const hit = CATALOG[coin]
  if (hit) return hit
  const sym = coin.includes(':') ? coin.split(':')[1] : coin
  return { name: sym, assetClass: coin.includes(':') ? 'Equities' : 'Crypto', industries: coin.includes(':') ? [] : ['Crypto'] }
}

export const ASSET_CLASSES: AssetClass[] = ['Crypto', 'Equities', 'Commodities', 'Indices', 'FX']

export const INDUSTRIES = Array.from(new Set(Object.values(CATALOG).flatMap((e) => e.industries ?? []))).sort()
