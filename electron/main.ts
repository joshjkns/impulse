/**
 * Impulse desktop shell.
 *
 *   Electron main ──fork──▶ bridge/server.ts (Electron's own Node, ELECTRON_RUN_AS_NODE=1)
 *        │
 *        └── BrowserWindow ── impulse://app/ (the Vite build in dist/) or the dev server with --dev-url
 *
 * The bridge is the same daemon `pnpm bridge` runs; if one is already listening (e.g. `pnpm dev` in a
 * terminal) the app uses it instead of starting a second. Alerts keep firing while the window is closed
 * on macOS, and arrive as native notifications.
 */
import { fork, execFile, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, Menu, Notification, net, protocol, shell, type MenuItemConstructorOptions } from 'electron'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const SCHEME = 'impulse'
const APP_URL = `${SCHEME}://app/`
const BRIDGE_PORT = Number(process.env.IMPULSE_BRIDGE_PORT ?? 7420)
const devUrl = process.argv.find((a) => a.startsWith('--dev-url='))?.slice('--dev-url='.length)
const isMac = process.platform === 'darwin'

app.setName('Impulse')
// Same-origin storage across launches needs a real (standard, secure) scheme rather than file://.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

// A second launch just focuses the running window (see 'second-instance').
if (!app.requestSingleInstanceLock()) app.exit(0)

let win: BrowserWindow | null = null
let bridge: ChildProcess | null = null
let quitting = false

/* ------------------------------------------------------------------ bridge */

async function bridgeRunning() {
  try {
    const r = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`, { signal: AbortSignal.timeout(800) })
    return ((await r.json()) as { name?: string }).name === 'impulse-bridge'
  } catch {
    return false
  }
}

/** GUI apps on macOS/Linux start with a bare PATH; borrow the login shell's so harness CLIs are found. */
function loginShellPath(): Promise<string | undefined> {
  if (process.platform === 'win32') return Promise.resolve(undefined)
  const sh = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')
  return new Promise((res) =>
    execFile(sh, ['-ilc', 'printf "__IMPULSE_PATH__%s__IMPULSE_PATH__" "$PATH"'], { timeout: 4000 }, (_e, out) =>
      res(/__IMPULSE_PATH__(.*?)__IMPULSE_PATH__/s.exec(String(out ?? ''))?.[1] || undefined),
    ),
  )
}

let restarts = 0
async function startBridge() {
  if (await bridgeRunning()) return
  const logDir = path.join(app.getPath('userData'), 'logs')
  mkdirSync(logDir, { recursive: true })
  const log = createWriteStream(path.join(logDir, 'bridge.log'), { flags: 'a' })
  const PATH = (await loginShellPath()) ?? process.env.PATH
  bridge = fork(path.join(ROOT, 'bridge', 'server.ts'), [], {
    execPath: process.execPath,
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      PATH,
      ELECTRON_RUN_AS_NODE: '1',
      // Packaged builds keep alerts, settings and OI history with the app's data; dev runs share the repo's .impulse/.
      ...(app.isPackaged ? { IMPULSE_DATA_DIR: path.join(app.getPath('userData'), 'bridge') } : {}),
      // The browser-wallet pairing page is served by the bridge from the build (the dev server serves it in dev).
      IMPULSE_STATIC: DIST,
    },
  })
  bridge.stdout?.pipe(log)
  bridge.stderr?.pipe(log)
  if (!app.isPackaged) {
    bridge.stdout?.pipe(process.stdout)
    bridge.stderr?.pipe(process.stderr)
  }
  bridge.on('message', (m: { type?: string; title?: string; body?: string }) => {
    if (m.type === 'notify') notify(String(m.title ?? 'Impulse'), String(m.body ?? ''))
  })
  bridge.on('exit', (code) => {
    bridge = null
    if (quitting) return
    log.write(`\n[impulse] bridge exited with ${code}\n`)
    // Crash loop guard: a few quick retries, then leave it down (the app shows "bridge offline").
    if (restarts++ < 5) setTimeout(() => void startBridge(), 1000 * restarts)
  })
}

function stopBridge() {
  if (!bridge) return
  bridge.kill('SIGTERM')
  const b = bridge
  setTimeout(() => b.exitCode === null && b.kill('SIGKILL'), 2000).unref()
}

function notify(title: string, body: string) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: isMac ? 'Impulse' : title, subtitle: isMac ? title : undefined, body })
  n.on('click', () => showWindow())
  n.show()
}

/* ------------------------------------------------------------------ app protocol */

/** Serve dist/ at impulse://app/ with an SPA fallback so client-side routes survive a reload. */
function registerAppProtocol() {
  protocol.handle(SCHEME, (req) => {
    const { pathname } = new URL(req.url)
    const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
    let file = path.join(DIST, rel)
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    return net.fetch(pathToFileURL(file).toString())
  })
}

/* ------------------------------------------------------------------ window */

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}
const stateFile = () => path.join(app.getPath('userData'), 'window.json')
function loadState(): WindowState {
  try {
    return { width: 1440, height: 900, ...JSON.parse(readFileSync(stateFile(), 'utf8')) }
  } catch {
    return { width: 1440, height: 900 }
  }
}
function saveState(w: BrowserWindow) {
  const b = w.getNormalBounds()
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() }))
  } catch {
    /* best effort */
  }
}

function createWindow() {
  const s = loadState()
  win = new BrowserWindow({
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#101012',
    title: 'Impulse',
    // The top bar is the title bar: traffic lights inset on macOS, native caption buttons overlaid elsewhere.
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 15 } }
      : { titleBarOverlay: { color: '#101012', symbolColor: '#9a9aa2', height: 44 } }),
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  if (s.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())
  win.on('close', () => win && saveState(win))
  win.on('closed', () => (win = null))

  // Wallet popups that talk back to the page through window.opener (Coinbase Wallet) open as child windows;
  // other links (docs, explorers, wallet deep links, the browser-wallet page) open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWalletPopup(url))
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 420, height: 720, backgroundColor: '#0a0b0d', autoHideMenuBar: true, parent: win ?? undefined },
      }
    if (/^(https?|mailto|wc|metamask|rainbow|phantom):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const home = devUrl ?? APP_URL
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(home)) return
    e.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  void win.loadURL(home)
}

const WALLET_POPUP_HOSTS = ['keys.coinbase.com', 'www.coinbase.com', 'coinbase.com']
function isWalletPopup(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && WALLET_POPUP_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

function showWindow() {
  if (!win) createWindow()
  else {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Bridge log', click: () => void shell.openPath(path.join(app.getPath('userData'), 'logs', 'bridge.log')) },
        { label: 'Open data folder', click: () => void shell.openPath(app.getPath('userData')) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/* ------------------------------------------------------------------ lifecycle */

app.on('second-instance', () => showWindow())

app.whenReady().then(async () => {
  registerAppProtocol()
  buildMenu()
  // Start the bridge first so the page's first WebSocket connect usually lands; the app reconnects anyway.
  await startBridge()
  createWindow()
  app.on('activate', () => showWindow())
})

// macOS apps stay alive with no windows, which keeps alerts running in the background.
app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

app.on('before-quit', () => {
  quitting = true
  stopBridge()
})
