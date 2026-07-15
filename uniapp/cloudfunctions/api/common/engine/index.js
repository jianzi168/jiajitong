/**
 * 引擎总入口
 * 单一来源 (技术方案 §0.3 + §7.2) - 云函数 api 网关与 scripts/test-engine.js 都从这里 require
 *
 * 同时被 Vue <script setup> 通过 ESM import 引用（UniApp 编译）。
 * rollup 处理 CJS 时对 `module.exports = {...}` 对象字面量不识别具名导出，
 * 必须用逐个属性赋值的形式，这样 rollup-plugin-commonjs 才能静态分析出具名导出。
 */
const calcQuick = require('./calcQuick')
const calcFull = require('./calcFull')
const calcHealthScore = require('./calcHealthScore')
const calcBabyReserve = require('./calcBabyReserve')
const normalize = require('./normalize')
const constants = require('./constants')
const errors = require('./errors')
const benchmark = require('../benchmark-data')

// 逐个属性赋值 — 让 rollup-plugin-commonjs 能识别具名导出
module.exports.calcQuick = calcQuick
module.exports.calcFull = calcFull
module.exports.calcHealthScore = calcHealthScore
module.exports.calcBabyReserve = calcBabyReserve
module.exports.normalize = normalize
module.exports.constants = constants
module.exports.errors = errors
module.exports.benchmark = benchmark

// ESM default 兼容：import engine from '...' 时拿到整个对象
module.exports.default = module.exports