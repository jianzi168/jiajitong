import { resolvePaywallRedirect } from '../src/utils/paywallRedirect.js'
const cases = [
  ['preview', '/subpackages/report/preview'],
  ['full', '/subpackages/report/full'],
  ['pdf', '/subpackages/report/full'],
  ['dashboard', '/pages/dashboard/index'],
  ['actions', '/pages/actions/index'],
  ['share', '/subpackages/report/share'],
  ['', '/subpackages/report/full'],
  ['https://evil.example', '/subpackages/report/full'],
]
for (const [from, expected] of cases) {
  if (resolvePaywallRedirect(from) !== expected) throw new Error(`${from} mismatch`)
}
console.log('paywall redirect tests passed')
