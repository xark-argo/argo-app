const {autoUpdater, dialog} = require('electron')
const log = require('electron-log')
const path = require('path')
const os = require('os')
const i18next = require('i18next')
const chokidar = require('chokidar')
const {setAutoUpdate, getAutoUpdate} = require('./sharedStates')

Object.assign(console, log.functions)

let mainWin = null
let downloadWatcher = null
let speedInterval = null
let lastSize = 0
let lastTime = Date.now()
async function checkByAPI() {
  try {
    const res = await fetch('https://ipinfo.io/json')
    const {country} = await res.json()
    return ['CN', 'HK', 'MO', 'TW'].includes(country)
  } catch {
    return false
  }
}

// 动态配置更新源
async function configureUpdater() {
  try {
    console.log('Checking location for updater configuration...')
    const isChina = await checkByAPI()

    const {platform, arch} = process

    const isWindows = platform === 'win32'
    const releaseFile = isWindows ? '' : `RELEASES-${platform}-${arch}.json`

    const baseUrl = isChina
      ? 'https://shencha-model-platform.oss-cn-shanghai.aliyuncs.com/argo/releases/latest'
      : 'https://github.com/xark-argo/argo/releases/latest/download'

    const feedURL = {
      url: `${baseUrl}/${releaseFile}`,
      serverType: isWindows ? 'default' : 'json',
    }

    console.log(`Setting autoUpdater feed URL: ${feedURL.url}`)
    autoUpdater.setFeedURL(feedURL)
  } catch (error) {
    console.error('Error configuring autoUpdater:', error)
  }
}

const checkUpdate = async (win, ipcMain, app) => {
  if (!win) {
    console.error('Error: main window (win) is not defined!')
    return
  }

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    Object.defineProperty(app, 'isPackaged', {get: () => true})
  }

  mainWin = win
  autoUpdater.autoDownload = true // 自动下载
  autoUpdater.autoInstallOnAppQuit = true // 退出后自动安装

  await configureUpdater()

  autoUpdater.on('error', (err) => {
    console.error('Auto-update failed:', err.message)
    if (downloadWatcher) downloadWatcher.close()
    if (speedInterval) clearInterval(speedInterval)
  })

  autoUpdater.on('checking-for-update', () => {
    console.info('Checking for updates...')
  })

  autoUpdater.on('update-not-available', () => {
    console.info('No updates available')
  })

  // 获取平台特定的下载目录
  function getDownloadDir() {
    switch (process.platform) {
      case 'darwin':
        return path.join(
          os.homedir(),
          'Library',
          'Caches',
          app.getName(),
          'pending'
        )
      case 'win32':
        return path.join(
          os.homedir(),
          'AppData',
          'Local',
          app.getName(),
          'pending'
        )
      default:
        return path.join(app.getPath('temp'), app.getName(), 'pending')
    }
  }

  autoUpdater.once('update-available', () => {
    if (mainWin) {
      mainWin.webContents.send('update_available', app.getName())
      const downloadDir = getDownloadDir()
      mainWin.webContents.send('update_available', downloadDir)
      mainWin.webContents.send('update-progress', {
        speed: 0,
        currentSize: 0,
      })
      // 监控下载目录
      downloadWatcher = chokidar.watch(downloadDir, {
        persistent: true,
        ignoreInitial: true,
      })

      downloadWatcher.on('add', (filePath) => {
        // 开始计算下载速度
        speedInterval = setInterval(() => {
          fs.stat(filePath, (err, stats) => {
            if (err) return

            const currentSize = stats.size
            const currentTime = Date.now()
            const deltaTime = (currentTime - lastTime) / 1000 // 秒
            const deltaSize = currentSize - lastSize

            if (deltaTime > 0) {
              const speed = deltaSize / deltaTime // 字节/秒
              mainWin.webContents.send('update-progress', {
                speed,
                currentSize,
              })
            }

            lastSize = currentSize
            lastTime = currentTime
          })
        }, 1000) // 每秒更新一次
      })
    }
  })

  autoUpdater.once('update-downloaded', (event, notes, name, date, url) => {
    const isAutoUpdate = getAutoUpdate()
    if (isAutoUpdate) return
    setAutoUpdate(true)
    console.log('The autoUpdater has downloaded an update!')
    console.log(`The new release is named ${name} and was released on ${date}`)
    console.log(`The release notes are: ${notes}`)
    console.log(`The release notes are: ${url}`)
    // 清理监听器
    if (downloadWatcher) downloadWatcher.close()
    if (speedInterval) clearInterval(speedInterval)
    // The update will automatically be installed the next time the
    // app launches. If you want to, you can force the installation
    // now:
    const dialogOpts = {
      type: 'info',
      buttons: [i18next.t('Restart'), i18next.t('Later')],
      title: i18next.t('App Update'),
      //  message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail: i18next.t(`A new version`),
    }

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) {
        setAutoUpdate(true)

        setTimeout(() => {
          autoUpdater.quitAndInstall()
        }, 100)
      } else {
        mainWin.webContents.send('update-downloaded')
      }
    })
  })
  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`Downloaded ${progressObj.percent}%`)
    const {percent, transferred, total, bytesPerSecond} = progressObj
    // 发送进度信息到渲染进程
    mainWin.webContents.send('update-progress', {
      percent,
      transferred,
      total,
      bytesPerSecond,
    })
  })

  ipcMain.on('restart_app', () => {
    console.info('Restar有新版本需要更新ting app to install update...')
    setAutoUpdate(true)

    setTimeout(() => {
      autoUpdater.quitAndInstall()
    }, 100)
  })

  // 检测是否有更新包并通知
  console.log('before checkForUpdates', autoUpdater.getFeedURL())

  // autoUpdater.checkForUpdates()
  // 添加定时器，每十分钟检查一次更新
  try {
    autoUpdater.checkForUpdates()
  } catch {
    console.error('Error checking for updates in interval:', error)
  }
  const CHECK_INTERVAL = 10 * 60 * 1000 // 10分钟，单位毫秒
  setInterval(async () => {
    try {
      await configureUpdater()
      autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('Error checking for updates in interval:', error)
    }
  }, CHECK_INTERVAL)
}

module.exports = checkUpdate
