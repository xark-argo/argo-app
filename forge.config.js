module.exports = {
  packagerConfig: {
    icon: 'icons/argo',
    ignore: [
        /^\/?out\//,
        /^\/?\.git/,
        /^\/?\.idea/,
        /^\/?.*\.sh$/,
        /^\/?.*\.yml$/,
        /^\/?.*\.xml$/,
        /^\/?README\.md$/,
        /^\/?tsconfig.*\.json$/,
        /^\/?forge\.config\.js$/,
        /^\/?loading\.html$/,
        /^\/?RELEASES-darwin.*\.json$/,
        /^\/?yarn\.lock$/,
        /^\/?\.eslint.*$/,
        /^\/?\.gitignore$/,
    ],
    osxSign: {
      identity: 'Developer ID Application: XiaoChuan Technology Co., Ltd. (S4NWU843M5)', // 替换为你的证书名称
      hardenedRuntime: true,
      'gatekeeper-assess': false
    },
    // osxNotarize: {
    //   tool: 'notarytool',
    //   appleId: '',
    //   appleIdPassword: '',
    //   teamId: 'S4NWU843M5',
    //   log: true,
    //   log_level: 'info'
    // }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: 'icons/argo.ico',
        // certificateFile: './cert.pfx',
        // certificatePassword: process.env.CERTIFICATE_PASSWORD
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
      config: {
        iconUrl: 'icons/argo.icns',
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
};