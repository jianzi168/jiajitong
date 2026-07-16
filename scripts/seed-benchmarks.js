const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '../cloudfunctions/api/common/benchmark-data')
const cities = JSON.parse(fs.readFileSync(path.join(root, 'cities.json'), 'utf8'))

if (cities.length !== 10) {
  console.error(`[seed-benchmarks] 期望 10 城，实际 ${cities.length}`)
  process.exit(1)
}

const names = new Set(cities.map((c) => c.name))
if (names.size !== cities.length) {
  console.error('[seed-benchmarks] 城市名称重复')
  process.exit(1)
}

console.log('[seed-benchmarks] OK —', cities.map((c) => c.name).join('、'))
