/**
 * 引擎总入口
 * 单一来源 (技术方案 §0.3 + §7.2) - 云函数 api 网关与 scripts/test-engine.js 都从这里 require
 */
const calcQuick = require('./calcQuick')
const calcFull = require('./calcFull')
const calcHealthScore = require('./calcHealthScore')
const calcBabyReserve = require('./calcBabyReserve')
const normalize = require('./normalize')
const constants = require('./constants')
const errors = require('./errors')
const benchmark = require('../benchmark-data')

module.exports = {
  calcQuick,
  calcFull,
  calcHealthScore,
  calcBabyReserve,
  normalize,
  constants,
  errors,
  benchmark,
}