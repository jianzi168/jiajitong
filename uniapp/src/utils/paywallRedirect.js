const ROUTES = Object.freeze({
  preview: '/subpackages/report/preview',
  full: '/subpackages/report/full',
  pdf: '/subpackages/report/full',
  dashboard: '/pages/dashboard/index',
  actions: '/pages/actions/index',
  share: '/subpackages/report/share',
})
export function resolvePaywallRedirect(from) {
  return ROUTES[String(from || '')] || ROUTES.full
}
