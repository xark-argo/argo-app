/* eslint-disable no-restricted-syntax */

const {contextBridge, ipcRenderer} = require('electron')
const {
  openBrowser,
  openFolder,
  handleSendChangeLangueAndShowDialog,
} = require('./handler')
// export const backend = {
//   nodeVersion: async (msg: string): Promise<string> =>
//     ipcRenderer.invoke('node-version', msg),
// }
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})

const backend = {
  nodeVersion: async (msg) => ipcRenderer.invoke('node-version', msg),
}
contextBridge.exposeInMainWorld('backend', backend)
// 暴露必要的全局对象（PixiJS 可能需要访问 window 或 document）
contextBridge.exposeInMainWorld('electron', {
  // 空对象，仅用于绕过安全限制（生产环境需谨慎）
})
contextBridge.exposeInMainWorld('argoBridge', {
  loadingCompleted: () =>
    ipcRenderer.on('load-completed', () => {
      return 1
    }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openLogFolder: (openDirectory) => ipcRenderer.send('open-log', openDirectory),
  migrateData: () => {
    return ipcRenderer.invoke('migrate-folder')
  },
  getMigrationProgress: (cb) => {
    ipcRenderer.on('migration-progress', (v, progress) => {
      cb(v, progress)
    })
  },
  getPath: () => ipcRenderer.invoke('get-path'),

  sendShareText: (text) => {
    ipcRenderer.send('send-data-to-main', text)
  },
  getShareText: () => {
    return ipcRenderer.invoke('get-data-from-main')
  },
  openDevTools: () => ipcRenderer.send('open-devtools'),
  maxWindow: () => ipcRenderer.send('max-window'),
  onNotificationUpdate: (cb) => {
    ipcRenderer.on('update_available', (v, value) => {
      console.log('=======update_available', 'update_available======', v, value)
      cb(value)
    })
  },
  downloadProgress: (cb) => {
    ipcRenderer.on('update-progress', (v, progress) => {
      console.log('ipcRenderer', 'download_progress', v, progress)
      cb(v, progress)
    })
  },
  openLocalFolder: (path) => {
    openFolder(path)
  },
  isDownloadedLatest: (cb) => {
    ipcRenderer.on('update-downloaded', () => {
      console.log('=======update-downloaded======')
      cb()
    })
  },
  updateVersion: () => {
    ipcRenderer.send('restart_app')
  },
  getVersion: () => {
    return ipcRenderer.invoke('get-version')
  },
  getProtocolData: (cb) => {
    ipcRenderer.on('protocol-data', (event, {action, data}) => {
      console.log('收到数据:', action, data)
      // 执行操作，例如跳转页面、更新状态等
      cb({page: action, data})
      // getProtocolData({action, data})
    })
  },
  openBrowser: (url) => {
    openBrowser(url)
  },
  showDialog: (msg) => {
    return ipcRenderer.invoke('open-file-dialog', msg)
  },
  getPlatform: () => {
    return process.platform
  },
  changeLanguage: (lng) => ipcRenderer.send('language-changed', lng),
  changeLanguageAndShowDialog: (lng) => {
    handleSendChangeLangueAndShowDialog(lng)
  },
})

module.exports = {
  backend,
}
