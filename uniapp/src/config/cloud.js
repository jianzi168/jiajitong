/**
 * 云环境配置
 *
 * BUILD_ENV 决定用哪套云开发环境：
 *   'dev'     本地开发
 *   'staging' 体验版 QA
 *   'prod'    正式版
 *
 * 切换环境：改 BUILD_ENV 后重新 npm run dev:mp-weixin。
 *
 * envId 与 manifest.json.mp-weixin.envId 保持一致（manifest.json 是给微信开发者工具识别的，
 * 此处是给 UniApp 编译期 JS 用的）。
 */

// TODO Phase 2 后期：用 vite build --mode=dev/staging/prod 自动注入 BUILD_ENV
export const BUILD_ENV = 'dev'

export const CLOUD_ENV_IDS = {
  dev: 'cloud1-0g12dcf7941e979c',
  staging: 'cloud1-0g12dcf7941e979c',
  prod: 'cloud1-0g12dcf7941e979c',
}

export function getCloudEnvId() {
  return CLOUD_ENV_IDS[BUILD_ENV] || CLOUD_ENV_IDS.dev
}

export default {
  BUILD_ENV,
  CLOUD_ENV_IDS,
  getCloudEnvId,
}