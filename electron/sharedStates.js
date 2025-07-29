let isAutoUpdate = false

const setAutoUpdate = (v) => {
  isAutoUpdate = v
  console.log(isAutoUpdate, 'setAutoupdate')
}

const getAutoUpdate = () => {
  return isAutoUpdate
}
module.exports = {
  isAutoUpdate,
  setAutoUpdate,
  getAutoUpdate,
}
