// export basePath to next.config.js
// same as the one exported from var.ts
module.exports = {
  basePath: '/dify',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/dify' : '',
}
