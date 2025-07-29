/* eslint-disable @typescript-eslint/no-use-before-define */
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  MenuItem,
} = require('electron')
const path = require('node:path')
const {exec, spawn} = require('node:child_process')
const net = require('net')
const os = require('os')
const fs = require('fs')
const fsExtra = require('fs-extra')
const extract = require('extract-zip')
const {URL} = require('url')
const i18next = require('i18next')
const {startServer} = require('./node')
const {getAutoUpdate} = require('./sharedStates')
const {
  i18n,
  changeUserLanguage,
  changeUserLanguageAndShowDialog,
} = require('./language')

const isDev = process.env.NODE_ENV === 'development'
const isWindows = process.platform === 'win32'
// const isPreview = process.env.NODE_ENV === 'development'
let store

async function initializeStore() {
  const ElectronStore = (await import('electron-store')).default
  store = new ElectronStore({
    defaults: {
      lastCustomPath: '',
      tempMigratePath: '',
      customPath: path.join(os.homedir(), '.argo'),
    },
  })
}

function removeLastDir() {
  const lastDir = store.get('lastCustomPath')
  if (!lastDir || !fsExtra.existsSync(lastDir)) return
  fsExtra.remove(lastDir)
}

// 清除迁移时的临时文件
function removeTemp() {
  const tempDir = store.get('tempMigratePath')
  if (!tempDir || !fsExtra.existsSync(tempDir)) return

  fsExtra.readdir(tempDir, (err, files) => {
    if (err) {
      return
    }

    files.forEach((file) => {
      if (file.endsWith('.argo.migrating') || file.endsWith('.argo.lock')) {
        const fullPath = path.join(tempDir, file)
        fsExtra.remove(fullPath, (removeErr) => {
          if (removeErr) console.error(`删除失败: ${fullPath}`, removeErr)
        })
      }
    })
  })
}

if (!isWindows) {
  const fixPath = require('fix-path')
  fixPath()
}

const {
  selectFolderHandler,
  handleGetPath,
  handleOpenLogPath,
  sendDataToMain,
  getDataForMain,
  openDevTools,
  maxWindow,
  openBrowser,
  showDialog,
  handleOpenLog,
  getAppVersion,
} = require('./handler')
const checkUpdate = require('./update')
const handleMigrate = require('./migrateFolder')
const {
  logOperation,
  saveUserPreference,
  loadUserPreference,
} = require('./preference')

if (require('electron-squirrel-startup')) {
  return
}

const QUIT_TYPE = {0: 'minimize', 1: 'quit', 2: 'maintain'}
// import './api'

const srcPath = path.join(__dirname, '..', 'src')
const argoPath = path.join(srcPath, 'argo')

// if (process.defaultApp) {
//   if (process.argv.length >= 2) {
//     app.setAsDefaultProtocolClient('argo', process.execPath, [
//       path.resolve(process.argv[1]),
//     ])
//   }
// } else {
//   app.setAsDefaultProtocolClient('argo')
// }

let loading
let argoProcess
let ollamaProcess
let mainWindow
let tray
let isQuitting = false

const showLoading = () => {
  loading = new BrowserWindow({
    title: 'Argo',
    show: false,
    frame: false, // 无边框（窗口、工具栏等），只包含网页内容
    width: 500,
    height: 300,
    resizable: false,
    transparent: true, // 窗口是否支持透明，如果想做高级效果最好为true
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // loading.once('show', cb)
  loading.loadFile(path.join(srcPath, 'loading.html'))
  // loading.webContents.openDevTools()
  loading.show()
}

const killProcessWindows = (processName, exeName) => {
  exec(`taskkill /F /IM ${exeName}`, (err, stdout, stderr) => {
    if (err) {
      console.error(`Failed to terminate ${processName}:`, err)
      return
    }
    console.log(`${processName} terminated successfully:`, stdout)
  })
}

const extractAndCleanArgoZip = async () => {
  const argoZipPath = path.join(srcPath, 'argo.zip')
  try {
    if (!fs.existsSync(argoZipPath)) return

    if (fs.existsSync(argoPath)) {
      fs.rmSync(argoPath, {recursive: true, force: true})
      console.log('已清空解压路径中的所有内容')
    }

    fs.mkdirSync(argoPath, {recursive: true})

    await extract(argoZipPath, {dir: argoPath})
    console.log('Argo 解压成功')

    fs.rmSync(argoZipPath)
    console.log('压缩包已删除')
  } catch (error) {
    console.error('解压 argo.zip 时出错:', error)
  } finally {
    if (fs.existsSync(argoZipPath)) fs.rmSync(argoZipPath)
  }
}

// 解析对话框返回值
function parseDialogResult(result) {
  /*
  返回值结构:
  - Windows/Linux: 按钮索引 + checkbox 状态
  - macOS: 对象 { response: 索引, checkboxChecked: 布尔值 }
  */
  console.log(result, 'result')
  if (typeof result === 'object') {
    // macOS
    return [QUIT_TYPE[result.response], result.checkboxChecked]
  } // Windows/Linuxoriginated
  const checkboxChecked = dialog.checkboxChecked || false
  return [QUIT_TYPE[result], checkboxChecked]
}

function checkPortReady(port, timeout = 30000) {
  return new Promise((resolve) => {
    const startTime = Date.now()

    function attemptConnect() {
      const client = net.connect({port}, () => {
        client.end()
        if (loading) {
          loading.webContents.send('load-completed')
        }
        setTimeout(() => {
          resolve(true)
        }, 200)
      })

      client.on('error', () => {
        if (Date.now() - startTime > timeout) {
          resolve(false)
        } else {
          setTimeout(attemptConnect, 1000) // 每秒重试
        }
      })
    }

    attemptConnect()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Argo',
    icon: path.join(__dirname, '..', 'icons', 'argo.png'),
    webPreferences: {
      webgl: true,
      nodeIntegration: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      enablePreferredSizeMode: true,
    },
    // autoHideMenuBar: true,
    show: false,
    maximized: true,
  })
  mainWindow.loadURL('http://localhost:11838')

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }
  mainWindow.webContents.userAgent = 'argo'
  mainWindow.webContents.setWindowOpenHandler(() => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        maximized: true,
        webPreferences: {
          nodeIntegration: true,
          preload: path.join(__dirname, 'preload.js'),
        },
      },
    }
  })
  createTray()

  mainWindow.on('ready-to-show', () => {
    if (loading) {
      loading.hide()
      loading.close()
      loading = null
    }
    mainWindow.show()
    mainWindow.maximize()
    setTimeout(() => {
      checkUpdate(mainWindow, ipcMain, app)
    }, 1000)
    process.env.ELECTRON_ENABLE_LOGGING = true
  })

  mainWindow.on('close', async (event) => {
    if (isQuitting) return
    const isAutoUpdate = getAutoUpdate()
    console.log('isAutoUpdate', isAutoUpdate)
    if (isAutoUpdate) {
      app.quit()
      return
    }
    event.preventDefault()
    const lastAction = loadUserPreference()
    if (lastAction === 'minimize') {
      mainWindow.minimize()
      // createTray()
      return
    }
    if (lastAction === 'quit') {
      app.quit()
      return
    }

    // 同步弹窗选择
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [i18next.t('Minimize to tray'), i18next.t('Exit the program')],
      defaultId: 0,
      cancelId: 2,
      title: i18next.t('Operate Confirm'),
      message: i18next.t('Please select the operation to be performed:'),
      checkboxLabel: i18next.t('Remember my choice'),
      checkboxChecked: false,
    })
    const [action, remember] = parseDialogResult(result)
    logOperation(action)
    if (action === 'minimize') {
      // 最小化到托盘
      if (remember) saveUserPreference('minimize')
      mainWindow.minimize()
      // createTray()
    } else if (action === 'quit') {
      // 退出程序
      if (remember) saveUserPreference('quit')
      app.quit()
    }
  })
}

async function runArgo() {
  const data = await checkPortReady(11636, 0)
  if (data) {
    createWindow() // 端口准备好后，打开主窗口
  }
  startServer()
  await extractAndCleanArgoZip()

  const ollamaBinPath = isWindows
    ? 'ollama'
    : path.join(srcPath, 'ollama', 'ollama')

  if (!isWindows) {
    process.env.PATH = `${process.env.PATH}:${path.dirname(ollamaBinPath)}`
  }

  process.env.ARGO_STORAGE_PATH = store.get('customPath')

  const argoBinPath = path.join(argoPath, 'argo')

  ollamaProcess = spawn(ollamaBinPath, ['serve'], {
    detached: true,
    stdio: 'ignore',
  })
  argoProcess = spawn(argoBinPath, [], {
    detached: true,
    stdio: 'ignore',
  })

  const handleChildEvent = (processName, process, sendError = false) => {
    process.on('error', (err) => {
      console.error(`${processName} Spawn error: ${err.message}`)
      if (sendError) {
        const dialogOpts = {
          type: 'info',
          buttons: [i18next.t('Close')],
          detail: `${processName} ${i18next.t('Command execution failed, error:')} ${err.message}`,
        }

        dialog.showMessageBox(dialogOpts).then((returnValue) => {
          if (returnValue.response === 0) app.quit()
        })
      }
    })
  }

  handleChildEvent('Ollama', ollamaProcess)
  handleChildEvent('Argo', argoProcess, true)

  // 等待端口准备好
  const isready = await checkPortReady(11636, 660000)
  if (isready) {
    createWindow() // 端口准备好后，打开主窗口
  } else {
    app.quit()
  }
}

function createTray() {
  // 创建托盘图标
  tray = new Tray(path.join(__dirname, '..', 'icons', 'argo.png'))

  // 设置托盘菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: i18next.t('Open Argo'),
      click: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.show()
        } else {
          runArgo()
        }
        // tray.destroy()
        // tray = null
      },
    },
    {
      label: i18next.t('Open Browser'),
      click: () => {
        openBrowser('http://localhost:11838')
      },
    },
    {
      label: i18next.t('Open the log directory'),
      click: () => {
        handleOpenLog(store)
      },
    },
  ])

  if (!isWindows) {
    app.dock.setMenu(contextMenu)
  } else {
    contextMenu.append(new MenuItem({type: 'separator'}))
    contextMenu.append(
      new MenuItem({
        label: 'Quit',
        click: () => {
          app.quit()
        },
      })
    )
  }
  // 设置悬停提示与右键菜单
  tray.setToolTip('Argo')
  tray.setTitle('This is my title')
  tray.setContextMenu(contextMenu)

  // console.log('tary======', tray.getContextMenu())
  if (isWindows) {
    // 双击托盘图标打开主界面

    tray.on('double-click', () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.show()
      } else {
        runArgo()
      }
      // tray.destroy()
      // tray = null
    })
  } else {
    tray.on('click', () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.show()
      } else {
        runArgo()
      }
    })
  }
}

function handleCustomProtocol(main, url) {
  const parsedUrl = new URL(url)
  // 提取参数（例如：myapp://open?data=123）
  const action = parsedUrl.hostname // 例如 "open"
  const data = parsedUrl.searchParams.get('data')

  // 发送到渲染进程
  if (main) {
    main.webContents.send('protocol-data', {action, data})
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  i18n()

  try {
    await initializeStore()
    await removeTemp()
    removeLastDir()
    selectFolderHandler()
    handleGetPath(store)
    handleOpenLogPath(store)
    sendDataToMain()
    getDataForMain()
    openDevTools()
    maxWindow()
    getAppVersion(app)
    showDialog()

    showLoading()
    // if (isDev) {
    //   createWindow()
    //   return
    // }
    console.log('process.env.PATH:', process.env.PATH)
    await runArgo()
    handleMigrate(store, app, mainWindow, ollamaProcess, argoProcess)

    ipcMain.on('language-changed', (_, lng) => {
      changeUserLanguage(lng)
    })
    console.log('render')
    ipcMain.on('language-changed-showdialog', (_, lng) => {
      if (!mainWindow) {
        console.log(`'sssss`)
        // console.error('Main window not found')
        return
      }
      console.log('changeUserLanguageAndShowDialog')
      changeUserLanguageAndShowDialog(lng)
    })
  } catch (err) {
    console.error('启动时发生错误:', err)
    loading.webContents.send('startup-error', err.message)
  }
})

// app.disableHardwareAcceleration()
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')
// app.commandLine.appendSwitch('ignore-gpu-blacklist')

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
// app.on('window-all-closed', (event) => {})

app.on('second-instance', (event, argv) => {
  if (process.platform === 'win32') {
    // 从命令行参数中提取 URL
    const url = argv.find((arg) => arg.startsWith('argo://'))
    if (url) handleCustomProtocol(mainWindow, url)
  }
  if (!mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

const handleAppQuit = () => {
  if (ollamaProcess) ollamaProcess.kill()
  if (argoProcess) argoProcess.kill()
  if (tray) tray.destroy()
  if (isWindows) {
    killProcessWindows('OllamaLlamaServer', 'ollama_llama_server.exe')
    killProcessWindows('Ollama', 'ollama.exe')
    killProcessWindows('Argo', 'argo.exe')
  }
}

// 主进程：处理 macOS 的 open-url 事件
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleCustomProtocol(mainWindow, url)
})

app.on('before-quit', async () => {
  if (isQuitting) return
  isQuitting = true
  handleAppQuit()
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    runArgo()
  }
})
