const i18next = require('i18next')
const {app, dialog} = require('electron')
const path = require('path')
const fs = require('fs')
const zhJson = require('./zh.json')
const enJson = require('./en.json')

// 判断时区
const inChina = () => {
  const timeTranslate = 0 - new Date().getTimezoneOffset() / 60
  return timeTranslate === 8
}

// 保存用户语言
function changeUserLanguage(lang) {
  const preference = {language: lang}
  i18next.changeLanguage(lang)

  const userDataDir = app.getPath('userData')
  const configFilePath = path.join(userDataDir, 'user-preference.json')
  const isExistFile = fs.existsSync(configFilePath)
  if (!isExistFile) {
    fs.writeFileSync(configFilePath, JSON.stringify(preference))
    return
  }
  const data = fs.readFileSync(configFilePath, 'utf8')

  fs.writeFileSync(
    configFilePath,
    JSON.stringify({...JSON.parse(data), ...preference})
  )
}

// 保存用户语言
function changeUserLanguageAndShowDialog(lang) {
  if (!app || !dialog) return
  changeUserLanguage(lang)

  const confirmText = i18next.t('Confirm')
  const closeText = i18next.t('Close')
  const dialogOpts = {
    type: 'question',
    buttons: [confirmText, closeText],
    defaultId: 0,
    cancelId: 1,
    detail: i18next.t(
      'Some content will take effect after restart. Do you want to restart the software now?'
    ),
  }

  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      app.quit()
    }
  })
}

// 读取用户偏好
function loadUserLanguage() {
  try {
    const userDataDir = app.getPath('userData')
    const configFilePath = path.join(userDataDir, 'user-preference.json')
    const data = fs.readFileSync(configFilePath, 'utf8')
    return JSON.parse(data).language
  } catch {
    return inChina() ? 'zh' : 'en' // 默认跟随时区
  }
}

const i18n = () => {
  const language = loadUserLanguage()
  i18next.init({
    lng: language,
    resources: {
      en: {
        translation: enJson,
      },
      zh: {
        translation: zhJson,
      },
    },
  })
}

module.exports = {
  i18n,
  changeUserLanguage,
  changeUserLanguageAndShowDialog,
  loadUserLanguage,
}
