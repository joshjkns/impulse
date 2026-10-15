import type { Market } from '@/store/markets'
import type { Scan, SortKey } from '@/store/prefs'

export function applyScan(list: Market[], scan: Scan | undefined, favorites: string[]) {
  if (!scan) return list
  return list.filter((m) => {
    if (scan.coins?.length && !scan.coins.includes(m.coin)) return false
    if (scan.favoritesOnly && !favorites.includes(m.coin)) return false
    if (scan.assetClasses?.length && !scan.assetClasses.includes(m.assetClass)) return false
    if (scan.industries?.length && !scan.industries.some((i) => m.industries.includes(i))) return false
    if (scan.regions?.length && !(m.region && scan.regions.includes(m.region))) return false
    if (scan.minChangePct != null && m.changePct < scan.minChangePct) return false
    if (scan.maxChangePct != null && m.changePct > scan.maxChangePct) return false
    if (scan.minVolume != null && m.dayNtlVlm < scan.minVolume) return false
    return true
  })
}

export function sortMarkets(list: Market[], key: SortKey, dir: 'asc' | 'desc') {
  const s = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * s
    return ((av as number) - (bv as number)) * s
  })
}
