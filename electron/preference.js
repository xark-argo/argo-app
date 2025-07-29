const {app} = require('electron')
const path = require('path')
const fs = require('fs')
// const {appConfigDir} = require('electron-util') // 需安装 electron-util

// 初始化日志和配置目录

// 记录操作到日志文件
function logOperation(action) {
  const timestamp = new Date().toISOString()
  const logEntry = `${timestamp} - User chose: ${action}\n`
  const userDataDir = app.getPath('userData')
  const logFilePath = path.join(userDataDir, 'operation.log')
  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) console.error('日志写入失败:', err)
  })
}

// 保存用户偏好
function saveUserPreference(action) {
  const preference = {lastAction: action}
  console.log(action, '=================saveUserPreference=================')

  const userDataDir = app.getPath('userData')
  const configFilePath = path.join(userDataDir, 'user-preference.json')
  console.log(configFilePath, JSON.stringify(preference))
  fs.writeFileSync(configFilePath, JSON.stringify(preference))
}

// 读取用户偏好
function loadUserPreference() {
  try {
    const userDataDir = app.getPath('userData')
    console.log('userDataDir', userDataDir)
    const configFilePath = path.join(userDataDir, 'user-preference.json')
    const data = fs.readFileSync(configFilePath, 'utf8')
    return JSON.parse(data).lastAction || 'ask'
  } catch {
    return 'ask' // 默认询问
  }
}

module.exports = {
  logOperation,
  saveUserPreference,
  loadUserPreference,
}
