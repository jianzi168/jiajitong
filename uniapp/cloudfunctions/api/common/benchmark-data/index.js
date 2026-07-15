/**
 * Benchmark data 总入口
 * 引擎单一来源 (PDD §0.3) - 此模块被 cloudfunctions/common/engine 通过相对路径 require
 */
const cities = require('./cities')
const categoryBenchmarks = require('./category-benchmarks')
const babyBenchmarks = require('./baby-benchmarks')

/**
 * 按城市名查城市对象，找不到返回 null
 */
function getCityByName(name) {
  return cities.find(c => c.name === name) || null
}

/**
 * 按 category id 查类目基准
 */
function getBenchmarkByCategory(categoryId) {
  return categoryBenchmarks.find(b => b.category === categoryId) || null
}

/**
 * 按 tier 查备育基准
 */
function getBabyBenchmarkByTier(tier) {
  return babyBenchmarks[tier] || null
}

module.exports = {
  cities,
  categoryBenchmarks,
  babyBenchmarks,
  getCityByName,
  getBenchmarkByCategory,
  getBabyBenchmarkByTier,
}