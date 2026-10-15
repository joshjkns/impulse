import { connectorsForWallets, darkTheme, type Theme } from '@rainbow-me/rainbowkit'
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createConfig, http } from 'wagmi'
import { arbitrum } from 'wagmi/chains'
import { browserWallet } from './browserWallet'

/** WalletConnect needs a cloud project id; without one we only offer injected/extension wallets. */
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

/** Set by the Electron preload. Extensions can't load in the app, so it gets the browser relay instead. */
export const isDesktop = typeof window !== 'undefined' && 'impulseDesktop' in window

const webWallets = projectId
  ? [rabbyWallet, metaMaskWallet, coinbaseWallet, rainbowWallet, walletConnectWallet]
  : [injectedWallet, rabbyWallet, coinbaseWallet]
// In the app: extension wallets go through the user's browser; Coinbase uses its popup; the rest pair by QR.
const desktopWallets = projectId ? [browserWallet, coinbaseWallet, walletConnectWallet, metaMaskWallet, rainbowWallet] : [browserWallet, coinbaseWallet]

const connectors = connectorsForWallets(
  [{ groupName: isDesktop ? 'Desktop' : 'Popular', wallets: isDesktop ? desktopWallets : webWallets }],
  { appName: 'Impulse', projectId: projectId ?? 'impulse-local' },
)

export const wagmiConfig = createConfig({
  connectors,
  chains: [arbitrum],
  transports: { [arbitrum.id]: http() },
})

/** RainbowKit theme matched to the matte terminal palette. */
export const rainbowTheme: Theme = (() => {
  const t = darkTheme({ accentColor: '#2e84f5', borderRadius: 'medium', overlayBlur: 'small' })
  return {
    ...t,
    colors: {
      ...t.colors,
      modalBackground: '#18171c',
      modalBorder: '#24242a',
      generalBorder: '#24242a',
      actionButtonSecondaryBackground: '#26262a',
      closeButtonBackground: '#26262a',
      menuItemBackground: '#26262a',
      profileForeground: '#18171c',
      connectButtonBackground: '#202126',
      modalBackdrop: 'rgba(6,6,8,0.6)',
    },
    fonts: { body: '"Inter Variable", ui-sans-serif, system-ui' },
    shadows: { ...t.shadows, dialog: '0 24px 80px rgba(0,0,0,0.5)' },
  }
})()

/** Hyperliquid's USDC bridge on Arbitrum. Sending native USDC here credits the sender's HL account. */
export const HL_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7' as const
export const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
