const {ipcMain, dialog, BrowserWindow, shell, ipcRenderer} = require('electron')
const path = require('path')
const {exec} = require('node:child_process')
const i18next = require('i18next')

const isWindows = process.platform === 'win32'

let sharedData = null
const selectFolderHandler = () => {
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择文件夹',
      buttonLabel: '选择',
    })

    // 返回第一个选择的路径，若取消则为undefined
    return result.filePaths[0]
  })
}

const sendDataToMain = () => {
  ipcMain.on('send-data-to-main', (_, data) => {
    sharedData = data
  })
}

const getAppVersion = (app) => {
  ipcMain.handle('get-version', () => {
    return app.getVersion()
  })
}

const getDataForMain = () => {
  ipcMain.handle('get-data-from-main', async () => {
    return sharedData // 返回存储的数据
  })
}

const openDevTools = () => {
  ipcMain.on('open-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win.webContents.openDevTools()
  })
}

const handleOpenLog = (store, openDirectory = true) => {
  let logDir = ''
  logDir = path.join(store.get('customPath'), openDirectory ? '' : 'app.log')
  let command = openDirectory
    ? `start "" "${logDir}"`
    : `start notepad "${logDir}"`
  if (!isWindows) {
    command =
      process.platform === 'darwin'
        ? `open "${logDir}"`
        : `xdg-open "${logDir}"`
  }
  exec(command, (error) => {
    if (error) {
      console.error(`打开文件时出错: ${error}`)
    }
  })
}

const openFolder = (folderpath) => {
  const folderdir = path.join(folderpath)
  console.log(folderdir)
  try {
    let command = `start "" "${folderdir}"`
    if (!isWindows) {
      command =
        process.platform === 'darwin'
          ? `open "${folderdir}"`
          : `xdg-open "${folderdir}"`
    }
    exec(command, (error) => {
      if (error) {
        console.error(`打开文件时出错: ${error}`)
      }
    })
  } catch (err) {
    console.log('openFolder error: ', err)
  }
}
const maxWindow = () => {
  ipcMain.on('max-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win.maximize()
  })
}

const openBrowser = (url) => {
  if (url === '') return
  shell.openExternal(url)
}

const getProtocolData = ({action, data}) => {
  console.log('getProtocolData', action, data)
}

const showDialog = () => {
  ipcMain.handle('open-file-dialog', async (_, msg) => {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: [i18next.t('OK'), i18next.t('Cancel')],
      defaultId: 1,
      cancelId: 0,
      detail: msg,
      message: '',
    })
    return result
  })
}

const handleOpenLogPath = (store) => {
  ipcMain.on('open-log', async (_, openDirectory) => {
    handleOpenLog(store, openDirectory)
  })
}

const handleGetPath = (store) => {
  ipcMain.handle('get-path', async () => {
    return store.get('customPath')
  })
}

const handleSendChangeLangueAndShowDialog = (lng) => {
  console.log('changeLanguageAndShowDialog', lng)
  ipcRenderer.send('language-changed-showdialog', lng)
}

module.exports = {
  selectFolderHandler,
  sendDataToMain,
  getDataForMain,
  openDevTools,
  maxWindow,
  openBrowser,
  getProtocolData,
  showDialog,
  handleOpenLog,
  getAppVersion,
  openFolder,
  handleGetPath,
  handleOpenLogPath,
  handleSendChangeLangueAndShowDialog,
}
