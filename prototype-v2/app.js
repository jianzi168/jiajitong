const SCREENS = [
  { id: 'landing', label: 'P-01 落地页' },
  { id: 'quick-1', label: 'P-02 快测 1/3' },
  { id: 'quick-2', label: 'P-02 快测 2/3' },
  { id: 'quick-3', label: 'P-02 快测 3/3' },
  { id: 'quick-result', label: 'P-02 快测结果' },
  { id: 'login', label: '微信登录' },
  { id: 'wizard-1', label: 'P-03 向导 1/5' },
  { id: 'wizard-2', label: 'P-04 向导 2/5' },
  { id: 'wizard-3', label: 'P-05 向导 3/5' },
  { id: 'wizard-3-warn', label: 'P-05 收支预警' },
  { id: 'wizard-4', label: 'P-06 向导 4/5' },
  { id: 'wizard-5', label: 'P-07 向导 5/5' },
  { id: 'wizard-loading', label: 'P-07 生成中' },
  { id: 'report', label: 'P-08 规划书预览' },
  { id: 'report-full', label: 'P-09 完整规划书' },
  { id: 'setup-reminder', label: '设置周度提醒' },
  { id: 'share', label: 'P-10 分享长图' },
  { id: 'home', label: '首页 Tab' },
  { id: 'home-empty', label: '首页空态' },
  { id: 'dashboard', label: 'P-11 看板' },
  { id: 'dashboard-empty', label: '看板空态' },
  { id: 'weekly', label: 'P-12 周度填报' },
  { id: 'actions', label: 'P-13 行动清单' },
  { id: 'partner', label: 'P-14 伴侣邀请' },
  { id: 'review', label: 'P-15 月末复盘' },
  { id: 'paywall', label: 'P-16 付费页' },
  { id: 'profile', label: 'P-17 我的' },
  { id: 'family-profile', label: '家庭档案' },
  { id: 'privacy', label: '隐私与导出' },
  { id: 'error-city', label: '城市未覆盖' },
  { id: 'error-imbalance', label: '收支失衡' },
];

const screenContainer = document.getElementById('deviceScreen');
const navContainer = document.getElementById('screenNav');

function mountScreens() {
  SCREENS.forEach(({ id }) => {
    const tpl = document.getElementById(`tpl-${id}`);
    if (!tpl) {
      console.warn(`Missing template: tpl-${id}`);
      return;
    }
    screenContainer.appendChild(tpl.content.cloneNode(true));
  });
}

function buildNav() {
  SCREENS.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.screen = id;
    btn.addEventListener('click', () => showScreen(id));
    navContainer.appendChild(btn);
  });
}

function showScreen(id) {
  const screen = document.querySelector(`.screen[data-id="${id}"]`);
  if (!screen) return;

  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  document.querySelectorAll('.proto-nav nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === id);
  });

  const navBtn = navContainer.querySelector(`[data-screen="${id}"]`);
  if (navBtn) navBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  if (id === 'wizard-loading') startLoadingAnimation();
  if (id === 'quick-result' || id === 'report') animateScoreRings(screen);
}

let loadingTimer = null;

function startLoadingAnimation() {
  const texts = ['正在匹配同城消费数据', '推算你们的小家预算', '生成专属行动建议'];
  const steps = document.querySelectorAll('.loading-steps span');
  const textEl = document.getElementById('loadingText');
  let i = 0;
  clearInterval(loadingTimer);
  if (textEl) textEl.textContent = texts[0];
  steps.forEach((s, idx) => s.classList.toggle('active', idx === 0));
  loadingTimer = setInterval(() => {
    i = (i + 1) % texts.length;
    if (textEl) textEl.textContent = texts[i];
    steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
  }, 700);
}

function animateScoreRings(screen) {
  screen.querySelectorAll('.score-display[data-score]').forEach((el) => {
    const target = parseInt(el.dataset.score, 10);
    const numEl = el.querySelector('.score-num');
    if (!numEl) return;
    let current = 0;
    const step = Math.ceil(target / 24);
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      numEl.textContent = current;
      if (current >= target) clearInterval(timer);
    }, 30);
  });
}

function bindNavigation() {
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      showScreen(go.dataset.go);
      return;
    }

    const card = e.target.closest('.pick-card');
    if (card && !e.target.closest('[data-go]')) {
      card.parentElement.querySelectorAll('.pick-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    }

    const radioChip = e.target.closest('.pill-option');
    if (radioChip) {
      const group = radioChip.closest('.pill-group');
      if (group) {
        group.querySelectorAll('.pill-option').forEach((c) => c.classList.remove('selected'));
        radioChip.classList.add('selected');
      }
    }

    const chip = e.target.closest('.tag-btn');
    if (chip && chip.closest('.tag-row')) {
      chip.closest('.tag-row').querySelectorAll('.tag-btn').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    }

    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const target = document.getElementById(toggle.dataset.toggle);
      if (target) target.classList.toggle('open');
    }

    if (e.target.closest('[data-action="simulate-loading"]')) {
      e.preventDefault();
      showScreen('wizard-loading');
      setTimeout(() => showScreen('report'), 2200);
    }

    if (e.target.closest('[data-action="simulate-login"]')) {
      e.preventDefault();
      showScreen('wizard-1');
    }
  });
}

mountScreens();
buildNav();
bindNavigation();
showScreen('landing');
