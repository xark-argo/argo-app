const fs = require('fs-extra')
const progressStream = require('progress-stream')
const {pipeline} = require('stream/promises')
const {ipcMain, dialog} = require('electron')
const path = require('path')
const {exec} = require('node:child_process')
const checkDiskSpace = require('check-disk-space').default

async function checkAvailableSpace(destinationPath, requiredBytes) {
  try {
    const {free} = await checkDiskSpace(destinationPath)
    if (free < requiredBytes) {
      throw new Error(`Insufficient space on target disk`)
    }
    return true
  } catch (err) {
    console.error('检查磁盘空间失败:', err)
    throw err
  }
}

async function getDirectorySize(dir) {
  const files = await fs.readdir(dir)
  const sizes = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dir, file)
      const stat = await fs.stat(filePath)
      return stat.isDirectory() ? getDirectorySize(filePath) : stat.size
    })
  )
  return sizes.reduce((sum, size) => sum + size, 0)
}

async function processFile(srcPath, destPath, fileSize, updateProgress) {
  const readStream = fs.createReadStream(srcPath)
  const writeStream = fs.createWriteStream(destPath)

  const progress = progressStream({
    length: fileSize,
    time: 100, // 每100ms更新一次
  })

  let lastSent = 0
  progress.on('progress', (p) => {
    const delta = p.transferred - lastSent
    lastSent = p.transferred
    updateProgress(delta)
  })

  await pipeline(readStream, progress, writeStream)
}

async function processDirectory(srcDir, destDir, updateProgress) {
  await fs.ensureDir(destDir)
  const files = await fs.readdir(srcDir)

  await files.reduce(async (prevPromise, file) => {
    await prevPromise

    const srcPath = path.join(srcDir, file)
    const destPath = path.join(destDir, file)

    if (srcPath.endsWith('.lock')) return

    const stat = await fs.stat(srcPath)

    if (stat.isDirectory()) {
      await processDirectory(srcPath, destPath, (delta) => {
        updateProgress(delta)
      })
    } else {
      await processFile(srcPath, destPath, stat.size, updateProgress)
    }
  }, Promise.resolve())
}

function sendProgress(percent, mainWin) {
  console.log('迁移进度:', percent)
  mainWin.webContents.send('migration-progress', percent)
}

async function copyWithProgress(srcDir, destDir, mainWin) {
  const totalBytes = await getDirectorySize(srcDir)
  let copiedBytes = 0

  const updateProgress = (delta) => {
    copiedBytes += delta
    const percent = Math.min(99, Math.round((copiedBytes / totalBytes) * 100))
    sendProgress(percent, mainWin)
  }

  await processDirectory(srcDir, destDir, updateProgress)
}

function killDetachedProcess(pid) {
  console.log('kill', pid)
  exec(`taskkill /PID ${pid} /F /T`, (err) => {
    if (err) console.error('Windows kill fail:', err)
  })
}

const handleMigrate = async (
  store,
  app,
  mainWin,
  ollamaProcess,
  argoProcess
) => {
  ipcMain.handle('migrate-folder', async () => {
    const currentPath = store.get('customPath')

    // 1. 让用户选择新目录
    const {filePaths} = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择文件夹',
      buttonLabel: '选择',
    })

    if (!filePaths || filePaths.length === 0) {
      return null
    }

    const newParentDir = filePaths[0]
    const newPath = path.join(newParentDir, '.argo')
    const tempPath = `${newPath}.migrating`
    store.set('tempMigratePath', newParentDir)

    // 监听应用退出事件
    const cleanupOnExit = () => {
      try {
        if (fs.existsSync(tempPath)) {
          fs.removeSync(tempPath)
        }
        if (fs.existsSync(`${newPath}.lock`)) {
          fs.unlinkSync(`${newPath}.lock`)
        }
      } catch (e) {
        console.error('Cleanup error:', e)
      }
    }

    // 退出清理
    app.on('will-quit', cleanupOnExit)
    process.on('uncaughtException', cleanupOnExit)
    process.on('SIGTERM', cleanupOnExit)

    try {
      // 2. 验证目标路径
      if (
        fs.existsSync(newPath) ||
        newPath.startsWith(currentPath) ||
        newPath.startsWith(path.dirname(app.getPath('exe')))
      ) {
        return {success: false, message: 'Please select another folder'}
      }
      sendProgress(0, mainWin)

      // 3. 创建迁移标记文件
      await fs.promises.writeFile(`${newPath}.lock`, 'migration in progress')

      // 4.检查磁盘空间
      const totalBytes = await getDirectorySize(currentPath)
      await checkAvailableSpace(newParentDir, totalBytes)
      // 5. 迁移
      await copyWithProgress(currentPath, tempPath, mainWin)

      // 6. 完成迁移
      await fs.move(tempPath, newPath, {overwrite: false})
      store.set('customPath', newPath)
      store.set('lastCustomPath', currentPath)

      // 7. 清理和完成
      await fs.promises.unlink(`${newPath}.lock`)
      // await fs.remove(currentPath)

      sendProgress(100, mainWin)
      killDetachedProcess(ollamaProcess.pid)
      killDetachedProcess(argoProcess.pid)
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 2000)

      // 移除监听
      app.removeListener('will-quit', cleanupOnExit)
      process.removeListener('uncaughtException', cleanupOnExit)
      process.removeListener('SIGTERM', cleanupOnExit)
      return {
        success: true,
        message: 'Data migration is completed',
        oldPath: currentPath,
        newPath,
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      }
    }
  })
}
module.exports = handleMigrate
