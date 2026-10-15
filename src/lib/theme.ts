/**
 * Colour themes. Each theme swaps the surface and text tokens from index.css; the accent swaps `--brand`.
 * Up/down colours stay fixed across themes so P&L reads the same everywhere.
 */

type Surface = 'canvas' | 'panel' | 'raised' | 'hover' | 'field' | 'chip' | 'line' | 'fg' | 'fg-2' | 'fg-3' | 'popover' | 'ring'

export interface Theme {
  id: string
  label: string
  vars: Record<Surface, string>
}

export const THEMES = [
  {
    id: 'impulse',
    label: 'Impulse',
    vars: {
      canvas: '#101012',
      panel: '#18171c',
      raised: '#202126',
      hover: '#26262a',
      field: '#1e1e22',
      chip: '#2c2c30',
      line: '#24242a',
      fg: '#ececef',
      'fg-2': '#9a9aa3',
      'fg-3': '#63636c',
      popover: '#1b1a20',
      ring: '#3a3a42',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    vars: {
      canvas: '#0b0f17',
      panel: '#111723',
      raised: '#182030',
      hover: '#1e2738',
      field: '#151c2a',
      chip: '#232d40',
      line: '#1c2433',
      fg: '#e6ebf5',
      'fg-2': '#8f9bb3',
      'fg-3': '#5a6680',
      popover: '#141b28',
      ring: '#2f3a52',
    },
  },
  {
    id: 'black',
    label: 'Black',
    vars: {
      canvas: '#000000',
      panel: '#0a0a0b',
      raised: '#131315',
      hover: '#1a1a1d',
      field: '#101012',
      chip: '#1f1f23',
      line: '#1a1a1e',
      fg: '#f2f2f4',
      'fg-2': '#9a9aa3',
      'fg-3': '#5e5e66',
      popover: '#0f0f11',
      ring: '#34343a',
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    vars: {
      canvas: '#1a1b1e',
      panel: '#222327',
      raised: '#2a2b30',
      hover: '#313238',
      field: '#26272b',
      chip: '#36373d',
      line: '#2e2f35',
      fg: '#ededf0',
      'fg-2': '#a3a3ac',
      'fg-3': '#6c6c75',
      popover: '#25262b',
      ring: '#45464e',
    },
  },
  {
    id: 'mocha',
    label: 'Mocha',
    vars: {
      canvas: '#14110f',
      panel: '#1c1815',
      raised: '#24201c',
      hover: '#2b2622',
      field: '#211c19',
      chip: '#322c27',
      line: '#2a2420',
      fg: '#efe9e3',
      'fg-2': '#a59a90',
      'fg-3': '#6d635b',
      popover: '#201b18',
      ring: '#423a33',
    },
  },
] as const satisfies readonly Theme[]

export const ACCENTS = [
  { id: 'blue', label: 'Blue', color: '#2e84f5' },
  { id: 'violet', label: 'Violet', color: '#8b6cf6' },
  { id: 'teal', label: 'Teal', color: '#14b8a6' },
  { id: 'orange', label: 'Orange', color: '#f97316' },
  { id: 'pink', label: 'Pink', color: '#ec4899' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type AccentId = (typeof ACCENTS)[number]['id']

export function applyTheme(themeId: string, accentId: string) {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]
  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0]
  const root = document.documentElement
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(`--${k}`, v)
  root.style.setProperty('--brand', accent.color)
  root.dataset.theme = theme.id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.vars.canvas)
}
