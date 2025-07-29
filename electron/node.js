const express = require('express')
const {createProxyMiddleware} = require('http-proxy-middleware')
const path = require('path')
const mime = require('mime')

function startServer() {
  const app = express()

  // 修复 Windows 上可能的 MIME 类型问题
  mime.define({'application/javascript': ['js']}, true)

  // 添加请求日志
  app.use((req, res, next) => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    )
    next()
  })
  // 设置静态文件目录
  const staticPath = path.join(__dirname, '..', 'dist')

  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:11636',
      changeOrigin: true, // 修改请求头中的 host 为目标服务器
      pathRewrite: {
        // 路径重写规则
        '^/api': '/api', // 移除 /api 前缀（根据实际情况调整）
      },
      logLevel: 'debug', // 启用调试日志
      onProxyReq: () => {
        // 可在此处添加自定义请求头
        // proxyReq.setHeader('X-Proxy-Added', 'true')
      },
    })
  )

  app.use(express.static(staticPath))

  // 处理 404 并返回 index.html
  // app.use((req, res, next) => {
  //   res.sendFile(path.join(staticPath, 'index.html'), (err) => {
  //     if (err) {
  //       console.error('Error serving index.html:', err)
  //       res.status(500).send('Internal Server Error')
  //     }
  //   })
  // })
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'))
  })

  // 监听端口
  const PORT = 11838
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`)
  })
}
module.exports = {startServer}
