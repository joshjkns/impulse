// Sandboxed preload: no Node APIs, just enough for the page to fit the native window chrome.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('impulseDesktop', { platform: process.platform })
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.desktop = process.platform
})
