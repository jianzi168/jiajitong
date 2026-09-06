/**
 * 微信小程序胶囊按钮安全区
 * 自定义 navigationStyle 时，顶栏右侧内容必须避开胶囊。
 */
export function getCapsuleSafeArea() {
  const sys = uni.getSystemInfoSync()
  const statusBarHeight = sys.statusBarHeight || 20
  const windowWidth = sys.windowWidth || 375
  const fallbackNav = typeof uni.upx2px === 'function' ? uni.upx2px(88) : 44
  const fallbackReserve = typeof uni.upx2px === 'function' ? uni.upx2px(200) : 100

  let menuButton = null
  try {
    if (typeof uni.getMenuButtonBoundingClientRect === 'function') {
      menuButton = uni.getMenuButtonBoundingClientRect()
    }
  } catch (e) {
    menuButton = null
  }

  const hasMenu =
    menuButton &&
    typeof menuButton.width === 'number' &&
    menuButton.width > 0 &&
    typeof menuButton.left === 'number'

  // 导航内容区高度：与胶囊垂直居中对齐
  const navBarHeight = hasMenu
    ? (menuButton.top - statusBarHeight) * 2 + menuButton.height
    : fallbackNav

  // 距屏幕右缘的留白，使内容右边界停在胶囊左侧
  const capsuleReserveRight = hasMenu
    ? Math.max(0, windowWidth - menuButton.left + 8)
    : fallbackReserve

  return {
    statusBarHeight,
    windowWidth,
    navBarHeight,
    capsuleReserveRight,
    menuButton: hasMenu ? menuButton : null,
  }
}
