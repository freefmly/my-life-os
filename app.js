const storageKey = 'my-life-mvp-v1';
const areas = { health: '건강', finance: '재무', business: '사업', relationship: '관계', hobby: '취미' };
let state = JSON.parse(localStorage.getItem(storageKey) || '{"vision":"","images":[],"goals":[]}');
const paletteSize = 5;
function normalizeState() { state.vision ||= ''; state.images = Array.isArray(state.images) ? state.images : []; state.goals = Array.isArray(state.goals) ? state.goals : []; state.achievements = Array.isArray(state.achievements) ? state.achievements : []; state.books = Array.isArray(state.books) ? state.books : []; state.businessSnapshots = Array.isArray(state.businessSnapshots) ? state.businessSnapshots : []; if (!state.growth || !Array.isArray(state.growth.domains) || !Array.isArray(state.growth.skills) || !Array.isArray(state.growth.activities) || !Array.isArray(state.growth.logs)) state.growth = createDefaultGrowth(); state.growth.profile = { name: '나의 캐릭터', bio: '나만의 속도로, 더 나은 삶을 만들어가는 중.', image: '', ...(state.growth.profile || {}) }; state.goals = state.goals.map((goal, index) => ({ ...goal, colorIndex: Number.isInteger(goal.colorIndex) ? goal.colorIndex : index % paletteSize, id: goal.id || createGoalId() })); }
normalizeState();
let editingGoalIndex = null;
let draggedGoalIndex = null;
let justDragged = false;
let draggedImageIndex = null;
let editingBookId = null;
const $ = (selector) => document.querySelector(selector);
const SUPABASE_URL = 'https://mkhqlqagnkskramfrnsa.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3JsCcOOWE-0KAZizIElY9g_rer8gtoK';
const supabaseClient = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
let signedInUser = null;
let isLoadingCloudState = false;
let cloudSaveTimer = null;
const visionInput = $('#visionInput');
const board = $('#visionBoard');
const goalList = $('#goalList');
const noGoals = $('#noGoals');
const dialog = $('#goalDialog');
const achievementList = $('#achievementList');
const libraryList = $('#libraryList');
const balanceMonth = $('#balanceMonth');
const balanceForm = $('#balanceForm');
const todayFocus = $('#todayFocus');
const imageDialog = $('#imageDialog');
const characterSummary = $('#characterSummary');
const growthDomainList = $('#growthDomainList');
const growthActivityList = $('#growthActivityList');
const growthLogList = $('#growthLogList');
const todayActivityLogList = $('#todayActivityLogList');
const growthToast = $('#growthToast');
const domainSettingsList = $('#domainSettingsList');
const skillSettingsList = $('#skillSettingsList');
const activitySettingsList = $('#activitySettingsList');
const profileDialog = $('#profileDialog');
const authDialog = $('#authDialog');
const authStatus = $('#authStatus');
const authButton = $('#authButton');
let editingDomainId = null;
let editingSkillId = null;
let editingActivityId = null;

function persist() { localStorage.setItem(storageKey, JSON.stringify(state)); if (signedInUser && !isLoadingCloudState) { clearTimeout(cloudSaveTimer); cloudSaveTimer = setTimeout(saveCloudState, 700); } }
function escapeHtml(text) { const el = document.createElement('div'); el.textContent = text; return el.innerHTML; }
function formatDate(value) { if (!value) return '언젠가'; const [year, month] = value.split('-'); return `${year}.${month}`; }
function formatNumber(value) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value); }
function formatWon(value) { return `${formatNumber(value)}원`; }
function formatPercent(value) { return value < 1 ? `${value.toFixed(2)}%` : `${Math.round(value)}%`; }
const bookStatuses = { wish: '읽고 싶은 책', reading: '읽는 중', finished: '완독' };
function createGoalId() { return globalThis.crypto?.randomUUID?.() || `goal-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function hasMetric(goal) { return Number.isFinite(goal.targetValue) && goal.targetValue > 0; }
function isGoalComplete(goal) { return hasMetric(goal) && Number.isFinite(goal.currentValue) && goal.currentValue >= goal.targetValue; }
function formatMilestoneName(value, unit) {
  if (unit === '원') {
    if (value >= 100000000 && value % 100000000 === 0) return `${value / 100000000}억 원`;
    if (value >= 10000000 && value % 10000000 === 0) return `${value / 10000000}천만 원`;
    if (value >= 10000 && value % 10000 === 0) return `${value / 10000}만 원`;
  }
  return `${formatNumber(value)}${unit ? ` ${unit}` : ''}`;
}
function recordAchievement(goal) {
  if (!isGoalComplete(goal) || state.achievements.some((achievement) => achievement.goalId === goal.id && achievement.type !== 'milestone')) return false;
  state.achievements.unshift({ goalId: goal.id, type: 'goal', title: goal.title, area: goal.area, targetValue: goal.targetValue, unit: goal.unit || '', achievedAt: new Date().toISOString(), colorIndex: goal.colorIndex });
  return true;
}
function recordMilestoneAchievements(goal) {
  if (!goal.recordMilestones || !hasMetric(goal) || !Number.isFinite(goal.currentValue)) return false;
  const start = Number.isFinite(goal.startValue) ? goal.startValue : 0;
  const interval = Number.isFinite(goal.milestone) && goal.milestone > 0 ? goal.milestone : (goal.targetValue - start) / 10;
  if (interval <= 0) return false;
  const lastEligibleValue = Math.min(goal.currentValue, goal.targetValue);
  const newlyAchieved = [];
  for (let value = start + interval; value < goal.targetValue && value <= lastEligibleValue; value += interval) {
    const roundedValue = Number(value.toFixed(8));
    if (!state.achievements.some((achievement) => achievement.goalId === goal.id && achievement.type === 'milestone' && achievement.milestoneValue === roundedValue)) newlyAchieved.push(roundedValue);
  }
  newlyAchieved.forEach((value) => state.achievements.unshift({ goalId: goal.id, type: 'milestone', milestoneValue: value, title: `${formatMilestoneName(value, goal.unit || '')} 달성`, parentGoalTitle: goal.title, area: goal.area, achievedAt: new Date().toISOString(), colorIndex: goal.colorIndex }));
  return newlyAchieved.length > 0;
}
function metricMarkup(goal) {
  if (!hasMetric(goal)) return '';
  const start = Number.isFinite(goal.startValue) ? goal.startValue : 0;
  const current = Number.isFinite(goal.currentValue) ? goal.currentValue : start;
  const target = goal.targetValue;
  const unit = escapeHtml(goal.unit || '');
  const range = Math.max(target - start, 1);
  const percent = Math.max(0, Math.min(100, ((current - start) / range) * 100));
  const interval = Number.isFinite(goal.milestone) && goal.milestone > 0 ? goal.milestone : range / 10;
  const next = current >= target ? target : Math.min(target, start + (Math.floor((current - start) / interval) + 1) * interval);
  const remaining = Math.max(0, next - current);
  const nextText = current >= target ? '목표 달성! 업적 보관함에 기록했어요.' : `다음 레벨까지 ${formatNumber(remaining)}${unit} 남음`;
  const visiblePercent = current > start ? Math.max(percent, 1) : 0;
  return `<div class="goal-progress"><div class="progress-label"><span>현재 ${formatNumber(current)}${unit}</span><strong>${formatPercent(percent)}</strong></div><div class="xp-track" aria-label="목표 진행률 ${formatPercent(percent)}"><span style="width:${visiblePercent}%"></span></div><p class="next-level">✦ ${nextText}</p><div class="metric-caption">시작 ${formatNumber(start)}${unit}<span>목표 ${formatNumber(target)}${unit}</span></div></div>`;
}
function getBalanceValues() { const value = (key) => Number($(`[data-balance-input="${key}"]`).value) || 0; return { cash: value('cash'), receivables: value('receivables'), otherAssets: value('otherAssets'), loans: value('loans'), payables: value('payables'), taxPayable: value('taxPayable') }; }
function getBalanceTotals(values) { return { assets: values.cash + values.receivables + values.otherAssets, liabilities: values.loans + values.payables + values.taxPayable }; }
function currentBalanceSnapshot() { return state.businessSnapshots.find((snapshot) => snapshot.month === balanceMonth.value); }
function updateBalanceSummary() { const values = getBalanceValues(); const totals = getBalanceTotals(values); const netWorth = totals.assets - totals.liabilities; const [year, month] = (balanceMonth.value || '').split('-'); $('#summaryMonth').textContent = year ? `${year}년 ${Number(month)}월 말 기준` : '기준 월을 선택해주세요'; $('#summaryAssets').textContent = formatWon(totals.assets); $('#summaryLiabilities').textContent = formatWon(totals.liabilities); $('#summaryNetWorth').textContent = formatWon(netWorth); const previous = state.businessSnapshots.filter((snapshot) => snapshot.month < balanceMonth.value).sort((a, b) => a.month.localeCompare(b.month)).at(-1); if (!previous) $('#summaryChange').textContent = '기록을 저장하면 이전 달과 비교해드려요.'; else { const previousTotals = getBalanceTotals(previous); const difference = netWorth - (previousTotals.assets - previousTotals.liabilities); const sign = difference > 0 ? '+' : ''; $('#summaryChange').textContent = `이전 기록 대비 ${sign}${formatWon(difference)}`; } $('#snapshotCount').textContent = state.businessSnapshots.length ? `저장된 월말 기록 ${state.businessSnapshots.length}개` : '아직 저장된 기록이 없어요.'; }
function loadBalanceMonth() { const snapshot = currentBalanceSnapshot(); ['cash', 'receivables', 'otherAssets', 'loans', 'payables', 'taxPayable'].forEach((key) => { $(`[data-balance-input="${key}"]`).value = snapshot?.[key] || ''; }); $('#balanceNote').value = snapshot?.note || ''; updateBalanceSummary(); }
function renderAccounting() { if (!balanceMonth.value) balanceMonth.value = new Date().toISOString().slice(0, 7); loadBalanceMonth(); }
function renderToday() {
  const focusGoal = state.goals.find((goal) => hasMetric(goal) && !isGoalComplete(goal)) || state.goals.find((goal) => !isGoalComplete(goal)) || state.goals[0];
  if (!focusGoal) { todayFocus.innerHTML = '<div class="today-empty"><span>✦</span><div><h3>아직 첫 목표를 기다리고 있어요.</h3><p>작은 목표 하나부터 삶의 방향을 만들어볼까요?</p></div><button class="upload-button" type="button" data-nav-view="goals">목표 만들기</button></div>'; return; }
  const progress = hasMetric(focusGoal) ? (() => { const start = Number.isFinite(focusGoal.startValue) ? focusGoal.startValue : 0; const current = Number.isFinite(focusGoal.currentValue) ? focusGoal.currentValue : start; const percent = Math.max(0, Math.min(100, ((current - start) / Math.max(focusGoal.targetValue - start, 1)) * 100)); return `<div class="today-progress"><span>${formatNumber(current)}${escapeHtml(focusGoal.unit || '')}</span><div class="xp-track"><span style="width:${Math.max(percent, current > start ? 1 : 0)}%"></span></div><strong>${formatPercent(percent)}</strong></div>`; })() : '<p class="today-no-progress">다음 행동을 정하면 목표가 더 가까워져요.</p>';
  todayFocus.innerHTML = `<article class="today-goal"><div><span class="goal-area">${areas[focusGoal.area]}</span><h3>${escapeHtml(focusGoal.title)}</h3>${focusGoal.note ? `<p>${escapeHtml(focusGoal.note)}</p>` : ''}</div>${progress}<button class="text-button quick-link" type="button" data-nav-view="goals">자세히 보기 →</button></article>`;
}
function createDefaultGrowth() { return { profile: { name: '나의 캐릭터', bio: '나만의 속도로, 더 나은 삶을 만들어가는 중.', image: '' }, domains: [{ id: 'health', name: '건강', icon: '◈', color: 'lime' }, { id: 'finance', name: '재무', icon: '◉', color: 'peach' }, { id: 'business', name: '사업', icon: '▣', color: 'blue' }, { id: 'relationship', name: '관계', icon: '♡', color: 'lavender' }, { id: 'hobby', name: '취미', icon: '✎', color: 'sand' }], skills: [{ id: 'movement', domainId: 'health', name: '운동', xp: 0 }, { id: 'recovery', domainId: 'health', name: '회복·수면', xp: 0 }, { id: 'asset-management', domainId: 'finance', name: '자산관리', xp: 0 }, { id: 'investment', domainId: 'finance', name: '투자 이해', xp: 0 }, { id: 'execution', domainId: 'business', name: '실행력', xp: 0 }, { id: 'sales', domainId: 'business', name: '영업·매출', xp: 0 }, { id: 'connection', domainId: 'relationship', name: '관계 돌봄', xp: 0 }, { id: 'communication', domainId: 'relationship', name: '소통', xp: 0 }, { id: 'reading', domainId: 'hobby', name: '독서·학습', xp: 0 }, { id: 'creative', domainId: 'hobby', name: '창작·몰입', xp: 0 }], activities: [{ id: 'exercise-30', name: '30분 운동', lifeXp: 20, rewards: [{ skillId: 'movement', xp: 20 }] }, { id: 'read-30', name: '30분 독서', lifeXp: 15, rewards: [{ skillId: 'reading', xp: 15 }] }, { id: 'business-review', name: '사업 현황 점검', lifeXp: 10, rewards: [{ skillId: 'execution', xp: 10 }] }], logs: [] }; }
function xpLevel(totalXp) { let level = 1; let remaining = Math.max(0, totalXp); let required = 100; while (remaining >= required) { remaining -= required; level += 1; required = Math.round(100 * Math.pow(1.17, level - 1)); } return { level, current: remaining, required }; }
function seoulDayKey(value = new Date()) { return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); }
function relativeLogTime(loggedAt) {
  const today = Date.parse(`${seoulDayKey()}T00:00:00Z`);
  const loggedDay = Date.parse(`${seoulDayKey(loggedAt)}T00:00:00Z`);
  const daysAgo = Math.round((today - loggedDay) / 86400000);
  if (daysAgo === 0) return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: 'numeric' }).format(new Date(loggedAt));
  if (daysAgo === 1) return '어제';
  if (daysAgo === 2) return '2일 전';
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(loggedAt));
}
function growthDomain(domainId) { return state.growth.domains.find((domain) => domain.id === domainId); }
function growthSkill(skillId) { return state.growth.skills.find((skill) => skill.id === skillId); }
function domainXp(domainId) { return state.growth.skills.filter((skill) => skill.domainId === domainId).reduce((sum, skill) => sum + (skill.xp || 0), 0); }
function lifeXp() { return state.growth.logs.reduce((sum, log) => sum + (log.lifeXp || 0), 0); }
function rewardSummary(rewards) { return rewards.map((reward) => { const skill = growthSkill(reward.skillId); const name = skill?.name || reward.skillName; return name ? `${escapeHtml(name)} +${reward.xp}` : ''; }).filter(Boolean).join(' · ') || '연결 스킬 없음'; }
let growthToastTimer;
function showGrowthToast(activity) {
  clearTimeout(growthToastTimer);
  const skillRewards = activity.rewards.map((reward) => ({ ...reward, skillName: growthSkill(reward.skillId)?.name || '스킬' }));
  growthToast.innerHTML = `<span class="growth-toast-spark">✦</span><div><strong>${escapeHtml(activity.name)} 완료!</strong><p>캐릭터 <b>+${Number(activity.lifeXp) || 0} XP</b>${skillRewards.length ? ` · ${rewardSummary(skillRewards)}` : ''}</p></div>`;
  growthToast.classList.remove('is-visible');
  void growthToast.offsetWidth;
  growthToast.classList.add('is-visible');
  growthToastTimer = setTimeout(() => growthToast.classList.remove('is-visible'), 1800);
}
function renderGrowth() {
  const life = xpLevel(lifeXp());
  const profile = state.growth.profile;
  const initial = escapeHtml((profile.name || '나').trim().charAt(0) || '나');
  characterSummary.innerHTML = `<div class="character-profile"><div class="profile-avatar">${profile.image ? `<img src="${profile.image}" alt="${escapeHtml(profile.name)} 프로필 사진">` : `<span>${initial}</span>`}</div><div class="profile-copy"><p class="eyebrow">MY CHARACTER</p><div class="profile-name-line"><h3>${escapeHtml(profile.name)}</h3><span>Lv. ${life.level}</span></div><p>${escapeHtml(profile.bio)}</p></div><button class="text-button edit-profile-button" type="button" id="editProfileButton">프로필 수정</button></div><div class="life-xp"><p class="eyebrow">LEVEL PROGRESS</p><div class="xp-track"><span style="width:${(life.current / life.required) * 100}%"></span></div><span>${life.current} / ${life.required} XP · 다음 레벨까지 ${life.required - life.current} XP</span></div><div class="character-total"><strong>${state.growth.logs.length}</strong><span>기록한 활동</span></div>`;
  growthDomainList.innerHTML = state.growth.domains.map((domain) => { const xp = domainXp(domain.id); const level = xpLevel(xp); const skills = state.growth.skills.filter((skill) => skill.domainId === domain.id); return `<article class="domain-growth-card domain-${domain.color}"><div class="domain-growth-top"><span class="domain-icon">${escapeHtml(domain.icon || '✦')}</span><div><p>${escapeHtml(domain.name)}</p><h4>Lv. ${level.level}</h4></div><span class="domain-xp">${xp} XP</span></div><div class="xp-track"><span style="width:${(level.current / level.required) * 100}%"></span></div><div class="skill-mini-list">${skills.length ? skills.map((skill) => { const skillLevel = xpLevel(skill.xp || 0); return `<div><span>${escapeHtml(skill.name)}</span><strong>Lv. ${skillLevel.level}</strong></div>`; }).join('') : '<p>아직 스킬이 없어요.</p>'}</div></article>`; }).join('');
  growthActivityList.innerHTML = state.growth.activities.length ? state.growth.activities.map((activity) => `<article class="activity-quick-card"><div><h4>${escapeHtml(activity.name)}</h4><p>캐릭터 +${activity.lifeXp} XP · ${rewardSummary(activity.rewards)}</p></div><button class="upload-button" type="button" data-log-activity="${activity.id}">기록</button></article>`).join('') : '<div class="growth-empty">성장 설정에서 첫 활동을 만들어보세요.</div>';
  const logRow = (log) => `<div class="growth-log"><span>✦</span><div><strong>${escapeHtml(log.title)}</strong><p>${rewardSummary(log.rewards)} · 캐릭터 +${log.lifeXp} XP</p></div><time>${relativeLogTime(log.loggedAt)}</time><button class="delete-growth-log" type="button" data-delete-growth-log="${log.id}" title="성장 기록 삭제" aria-label="${escapeHtml(log.title)} 성장 기록 삭제">×</button></div>`;
  const todayKey = seoulDayKey();
  growthLogList.innerHTML = state.growth.logs.length ? state.growth.logs.slice(0, 6).map((log) => logRow(log)).join('') : '<div class="growth-empty">첫 활동을 기록하면 성장 이야기가 쌓여요.</div>';
  const todayLogs = state.growth.logs.filter((log) => seoulDayKey(log.loggedAt) === todayKey);
  todayActivityLogList.innerHTML = todayLogs.length ? todayLogs.map((log) => logRow(log)).join('') : '<div class="growth-empty">오늘 기록한 활동이 없어요. 작은 행동 하나를 기록해볼까요?</div>';
  domainSettingsList.innerHTML = state.growth.domains.map((domain) => { const skillCount = state.growth.skills.filter((skill) => skill.domainId === domain.id).length; return `<article class="setting-card"><span class="setting-icon domain-${domain.color}">${escapeHtml(domain.icon || '✦')}</span><div><h4>${escapeHtml(domain.name)}</h4><p>연결된 스킬 ${skillCount}개</p></div><div class="setting-actions"><button class="text-button" type="button" data-edit-domain="${domain.id}">수정</button><button class="text-button danger-button" type="button" data-delete-domain="${domain.id}">삭제</button></div></article>`; }).join('');
  skillSettingsList.innerHTML = state.growth.skills.length ? state.growth.skills.map((skill) => { const domain = growthDomain(skill.domainId); return `<article class="setting-card"><span class="setting-icon domain-${domain?.color || 'sand'}">${escapeHtml(domain?.icon || '✦')}</span><div><h4>${escapeHtml(skill.name)}</h4><p>${escapeHtml(domain?.name || '소속 영역 없음')} · ${skill.xp || 0} XP</p></div><div class="setting-actions"><button class="text-button" type="button" data-edit-skill="${skill.id}">수정</button><button class="text-button danger-button" type="button" data-delete-skill="${skill.id}">삭제</button></div></article>`; }).join('') : '<div class="growth-empty">스킬을 추가해보세요.</div>';
  activitySettingsList.innerHTML = state.growth.activities.length ? state.growth.activities.map((activity) => `<article class="setting-card activity-setting-card"><span class="setting-icon">✦</span><div><h4>${escapeHtml(activity.name)}</h4><p>캐릭터 +${activity.lifeXp} XP · ${rewardSummary(activity.rewards)}</p></div><div class="setting-actions"><button class="text-button" type="button" data-edit-activity="${activity.id}">수정</button><button class="text-button danger-button" type="button" data-delete-activity="${activity.id}">삭제</button></div></article>`).join('') : '<div class="growth-empty">활동을 추가해보세요.</div>';
}
function populateSkillOptions(selectedId = '') { $('#skillDomain').innerHTML = state.growth.domains.map((domain) => `<option value="${domain.id}" ${domain.id === selectedId ? 'selected' : ''}>${escapeHtml(domain.name)}</option>`).join(''); }
function rewardRow(reward = {}) { const options = state.growth.skills.map((skill) => { const domain = growthDomain(skill.domainId); return `<option value="${skill.id}" ${skill.id === reward.skillId ? 'selected' : ''}>${escapeHtml(domain?.name || '')} › ${escapeHtml(skill.name)}</option>`; }).join(''); return `<div class="reward-row"><select class="reward-skill">${options}</select><input class="reward-xp" type="number" min="0" step="1" value="${reward.xp ?? 10}" /><button class="text-button danger-button" type="button" data-remove-reward>×</button></div>`; }
function renderRewardRows(rewards = []) { $('#activityRewardList').innerHTML = rewards.length ? rewards.map((reward) => rewardRow(reward)).join('') : '<div class="reward-empty">아직 연결된 스킬이 없어요.</div>'; }
function openDomainDialog(id = null) { editingDomainId = id; const domain = id ? growthDomain(id) : null; $('#domainForm').reset(); $('#domainDialogEyebrow').textContent = domain ? 'EDIT DOMAIN' : 'NEW DOMAIN'; $('#domainDialogTitle').textContent = domain ? '영역을 다듬어보세요.' : '새 영역을 만들어요.'; if (domain) { $('#domainName').value = domain.name; $('#domainIcon').value = domain.icon || ''; $('#domainColor').value = domain.color || 'lime'; } $('#domainDialog').showModal(); $('#domainName').focus(); }
function openSkillDialog(id = null) { editingSkillId = id; const skill = id ? growthSkill(id) : null; $('#skillForm').reset(); populateSkillOptions(skill?.domainId); $('#skillDialogEyebrow').textContent = skill ? 'EDIT SKILL' : 'NEW SKILL'; $('#skillDialogTitle').textContent = skill ? '스킬을 다듬어보세요.' : '새 스킬을 만들어요.'; if (skill) $('#skillName').value = skill.name; $('#skillDialog').showModal(); $('#skillName').focus(); }
function openActivityDialog(id = null) { editingActivityId = id; const activity = id ? state.growth.activities.find((item) => item.id === id) : null; $('#activityForm').reset(); $('#activityDialogEyebrow').textContent = activity ? 'EDIT ACTIVITY' : 'NEW ACTIVITY'; $('#activityDialogTitle').textContent = activity ? '활동 보상을 다듬어보세요.' : '새 활동을 만들어요.'; if (activity) { $('#activityName').value = activity.name; $('#activityLifeXp').value = activity.lifeXp; } renderRewardRows(activity?.rewards || []); $('#activityDialog').showModal(); $('#activityName').focus(); }
function openProfileDialog() { const profile = state.growth.profile; $('#profileForm').reset(); $('#profileName').value = profile.name || ''; $('#profileBio').value = profile.bio || ''; if (/^https?:\/\//.test(profile.image || '')) $('#profileImageUrl').value = profile.image; $('#removeProfileImageOption').hidden = !profile.image; profileDialog.showModal(); $('#profileName').focus(); }
function updateAuthUI(message = '') { if (signedInUser) { authStatus.textContent = signedInUser.email || '동기화됨'; authButton.textContent = '로그아웃'; } else { authStatus.textContent = message || '로컬 모드'; authButton.textContent = '로그인 · 동기화'; } }
async function saveCloudState() { if (!supabaseClient || !signedInUser) return; const { error } = await supabaseClient.from('life_app_states').upsert({ user_id: signedInUser.id, data: state, updated_at: new Date().toISOString() }); if (error) { console.error(error); updateAuthUI('동기화 오류'); } else updateAuthUI('동기화됨'); }
async function loadCloudState() { if (!supabaseClient || !signedInUser) return; updateAuthUI('동기화 중…'); const { data, error } = await supabaseClient.from('life_app_states').select('data').eq('user_id', signedInUser.id).maybeSingle(); if (error) { console.error(error); updateAuthUI('설정 필요'); return; } if (data?.data && Object.keys(data.data).length) { isLoadingCloudState = true; state = data.data; normalizeState(); localStorage.setItem(storageKey, JSON.stringify(state)); render(); isLoadingCloudState = false; } else await saveCloudState(); updateAuthUI('동기화됨'); }
async function applySession(session) { signedInUser = session?.user || null; updateAuthUI(); if (signedInUser) await loadCloudState(); }
async function initializeCloudSync() { if (!supabaseClient) { updateAuthUI('연결 불가'); return; } const { data } = await supabaseClient.auth.getSession(); await applySession(data.session); supabaseClient.auth.onAuthStateChange((_event, session) => { if ((session?.user?.id || null) !== (signedInUser?.id || null)) setTimeout(() => applySession(session), 0); }); }
function render() {
  visionInput.value = state.vision || '';
  $('#visionCount').textContent = visionInput.value.length;
  if (!state.images.length) {
    board.className = 'vision-board empty-board';
    board.innerHTML = '<div class="empty-state"><span class="empty-icon">⌁</span><h3>나의 비전보드</h3><p>영감을 주는 사진을 추가해<br />미래의 모습을 눈앞에 펼쳐보세요.</p><label class="upload-button ghost" for="imageInput">사진 선택하기</label></div>';
  } else {
    board.className = 'vision-board';
    board.innerHTML = state.images.map((src, index) => `<div class="board-item" data-board-image="${index}" draggable="true"><img src="${src}" alt="비전보드 이미지 ${index + 1}"><button class="remove-image" data-image="${index}" title="사진 제거">×</button></div>`).join('');
  }
  goalList.innerHTML = state.goals.map((goal, index) => `<article class="goal-card goal-tone-${goal.colorIndex} ${hasMetric(goal) ? 'has-progress' : ''}" data-edit-goal="${index}" draggable="true" tabindex="0" role="button" aria-label="${escapeHtml(goal.title)} 수정 및 순서 변경"><span class="drag-handle" aria-hidden="true" title="드래그해 순서 변경">⠿</span><span class="goal-area">${areas[goal.area]}</span><h3>${escapeHtml(goal.title)}</h3>${goal.note ? `<p>${escapeHtml(goal.note)}</p>` : ''}${metricMarkup(goal)}<div class="goal-footer"><span class="goal-date">${formatDate(goal.date)}</span></div><button class="delete-goal" data-goal="${index}" title="목표 삭제">×</button></article>`).join('');
  noGoals.hidden = state.goals.length > 0;
  $('#achievementsSection').hidden = state.achievements.length === 0;
  achievementList.innerHTML = state.achievements.map((achievement) => { const date = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(achievement.achievedAt)); const detail = achievement.type === 'milestone' ? `${escapeHtml(achievement.parentGoalTitle)} · 중간 레벨 · ${date}` : `${formatNumber(achievement.targetValue)}${escapeHtml(achievement.unit)} 달성 · ${date}`; return `<article class="achievement-card goal-tone-${achievement.colorIndex}"><span class="achievement-icon">✦</span><div><span class="goal-area">${areas[achievement.area] || '나의 삶'}</span><h3>${escapeHtml(achievement.title)}</h3><p>${detail}</p></div></article>`; }).join('');
  libraryList.innerHTML = Object.entries(bookStatuses).map(([status, label]) => { const books = state.books.filter((book) => book.status === status); return `<section class="library-shelf"><div class="shelf-heading"><h3>${label}</h3><span>${books.length}</span></div><div class="book-gallery">${books.length ? books.map((book) => `<article class="book-card" data-edit-book="${book.id}" tabindex="0" role="button" aria-label="${escapeHtml(book.title)} 수정"><div class="book-cover">${book.cover ? `<img src="${book.cover}" alt="${escapeHtml(book.title)} 표지">` : `<span>${escapeHtml(book.title)}</span>`}</div><h4>${escapeHtml(book.title)}</h4><p>${escapeHtml(book.author || '저자 미입력')}</p><button class="delete-book" data-book="${book.id}" title="책 삭제" aria-label="${escapeHtml(book.title)} 삭제">×</button></article>`).join('') : `<div class="empty-shelf">아직 등록한 책이 없어요.</div>`}</div></section>`; }).join('');
  renderAccounting();
  renderToday();
  renderGrowth();
}

visionInput.addEventListener('input', () => { state.vision = visionInput.value; $('#visionCount').textContent = state.vision.length; persist(); });
$('#imageInput').addEventListener('change', async (event) => {
  const files = [...event.target.files].filter(file => file.type.startsWith('image/')).slice(0, 12 - state.images.length);
  for (const file of files) state.images.push(await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); }));
  persist(); render(); event.target.value = '';
});
board.addEventListener('click', (event) => { const button = event.target.closest('[data-image]'); if (button) { state.images.splice(Number(button.dataset.image), 1); persist(); render(); return; } const imageItem = event.target.closest('[data-board-image]'); if (!imageItem) return; $('#imageDialogPreview').src = state.images[Number(imageItem.dataset.boardImage)]; imageDialog.showModal(); });
$('#closeImageDialog').addEventListener('click', () => imageDialog.close());
imageDialog.addEventListener('click', (event) => { if (event.target === imageDialog) imageDialog.close(); });
board.addEventListener('dragstart', (event) => { const item = event.target.closest('[data-board-image]'); if (!item) return; draggedImageIndex = Number(item.dataset.boardImage); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(draggedImageIndex)); requestAnimationFrame(() => item.classList.add('is-dragging-image')); });
board.addEventListener('dragover', (event) => { const item = event.target.closest('[data-board-image]'); if (!item || draggedImageIndex === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; board.querySelectorAll('.drag-over-image').forEach((image) => image.classList.remove('drag-over-image')); if (Number(item.dataset.boardImage) !== draggedImageIndex) item.classList.add('drag-over-image'); });
board.addEventListener('drop', (event) => { const item = event.target.closest('[data-board-image]'); if (!item || draggedImageIndex === null) return; event.preventDefault(); const destination = Number(item.dataset.boardImage); if (destination !== draggedImageIndex) { const [movedImage] = state.images.splice(draggedImageIndex, 1); state.images.splice(destination, 0, movedImage); persist(); render(); } });
board.addEventListener('dragend', () => { draggedImageIndex = null; board.querySelectorAll('.is-dragging-image, .drag-over-image').forEach((image) => image.classList.remove('is-dragging-image', 'drag-over-image')); });
function openGoalDialog(index = null) {
  editingGoalIndex = index;
  const isEditing = index !== null;
  $('#dialogEyebrow').textContent = isEditing ? 'EDIT LONG-TERM GOAL' : 'NEW LONG-TERM GOAL';
  $('#dialogTitle').textContent = isEditing ? '목표를 다듬어보세요.' : '어떤 목표를 향하나요?';
  $('#saveGoalButton').textContent = isEditing ? '수정 저장' : '목표 저장';
  if (isEditing) { const goal = state.goals[index]; $('#goalTitle').value = goal.title; $('#goalArea').value = goal.area; $('#goalDate').value = goal.date; $('#goalNote').value = goal.note; $('#goalStartValue').value = goal.startValue ?? ''; $('#goalCurrentValue').value = goal.currentValue ?? ''; $('#goalTargetValue').value = goal.targetValue ?? ''; $('#goalUnit').value = goal.unit ?? ''; $('#goalMilestone').value = goal.milestone ?? ''; $('#goalRecordMilestones').checked = Boolean(goal.recordMilestones); }
  else $('#goalForm').reset();
  dialog.showModal(); $('#goalTitle').focus();
}
$('#addGoalButton').addEventListener('click', () => openGoalDialog());
$('#cancelGoalButton').addEventListener('click', () => dialog.close());
$('.close-button').addEventListener('click', () => dialog.close());
$('#goalForm').addEventListener('submit', (event) => { event.preventDefault(); const title = $('#goalTitle').value.trim(); if (!title) return; const toNumber = (id) => { const value = $(id).value; return value === '' ? null : Number(value); }; const targetValue = toNumber('#goalTargetValue'); const startValue = toNumber('#goalStartValue'); const currentValue = toNumber('#goalCurrentValue'); const milestone = toNumber('#goalMilestone'); if (targetValue !== null && targetValue <= 0) { $('#goalTargetValue').focus(); return; } const previousGoal = editingGoalIndex === null ? null : state.goals[editingGoalIndex]; const goal = { title, area: $('#goalArea').value, date: $('#goalDate').value, note: $('#goalNote').value.trim(), startValue, currentValue, targetValue, unit: $('#goalUnit').value.trim(), milestone, recordMilestones: $('#goalRecordMilestones').checked, colorIndex: previousGoal ? previousGoal.colorIndex : state.goals.length % paletteSize, id: previousGoal ? previousGoal.id : createGoalId() }; if (editingGoalIndex === null) state.goals.push(goal); else state.goals[editingGoalIndex] = goal; recordMilestoneAchievements(goal); recordAchievement(goal); persist(); render(); dialog.close(); });
goalList.addEventListener('click', (event) => { const button = event.target.closest('[data-goal]'); if (button) { const index = Number(button.dataset.goal); if (!confirm(`“${state.goals[index].title}” 목표를 삭제할까요?\n삭제하면 되돌릴 수 없어요.`)) return; state.goals.splice(index, 1); persist(); render(); return; } if (justDragged) { justDragged = false; return; } const card = event.target.closest('[data-edit-goal]'); if (card) openGoalDialog(Number(card.dataset.editGoal)); });
goalList.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-edit-goal]')) { event.preventDefault(); openGoalDialog(Number(event.target.dataset.editGoal)); } });
goalList.addEventListener('dragstart', (event) => { const card = event.target.closest('[data-edit-goal]'); if (!card) return; draggedGoalIndex = Number(card.dataset.editGoal); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(draggedGoalIndex)); requestAnimationFrame(() => card.classList.add('is-dragging')); });
goalList.addEventListener('dragover', (event) => { const card = event.target.closest('[data-edit-goal]'); if (!card || draggedGoalIndex === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; goalList.querySelectorAll('.drag-over').forEach((item) => item.classList.remove('drag-over')); if (Number(card.dataset.editGoal) !== draggedGoalIndex) card.classList.add('drag-over'); });
goalList.addEventListener('drop', (event) => { const card = event.target.closest('[data-edit-goal]'); if (!card || draggedGoalIndex === null) return; event.preventDefault(); const destination = Number(card.dataset.editGoal); if (destination !== draggedGoalIndex) { const [movedGoal] = state.goals.splice(draggedGoalIndex, 1); state.goals.splice(destination, 0, movedGoal); persist(); justDragged = true; render(); } });
goalList.addEventListener('dragend', () => { draggedGoalIndex = null; goalList.querySelectorAll('.is-dragging, .drag-over').forEach((item) => item.classList.remove('is-dragging', 'drag-over')); });
const bookDialog = $('#bookDialog');
function openBookDialog(bookId = null) {
  editingBookId = bookId;
  const book = bookId ? state.books.find((item) => item.id === bookId) : null;
  const isEditing = Boolean(book);
  $('#bookForm').reset();
  $('#bookDialogEyebrow').textContent = isEditing ? 'EDIT BOOK' : 'NEW BOOK';
  $('#bookDialogTitle').textContent = isEditing ? '책 정보를 다듬어보세요.' : '서재에 책을 추가해요.';
  $('#saveBookButton').textContent = isEditing ? '수정 저장' : '책 저장';
  $('#removeCoverOption').hidden = !isEditing || !book.cover;
  if (isEditing) { $('#bookTitle').value = book.title; $('#bookAuthor').value = book.author || ''; $('#bookStatus').value = book.status; if (/^https?:\/\//.test(book.cover)) $('#bookCoverUrl').value = book.cover; }
  bookDialog.showModal(); $('#bookTitle').focus();
}
$('#addBookButton').addEventListener('click', () => openBookDialog());
$('#cancelBookButton').addEventListener('click', () => bookDialog.close());
$('#closeBookButton').addEventListener('click', () => bookDialog.close());
$('#bookForm').addEventListener('submit', async (event) => { event.preventDefault(); const title = $('#bookTitle').value.trim(); if (!title) return; const coverFile = $('#bookCover').files[0]; const coverUrl = $('#bookCoverUrl').value.trim(); const existingBook = editingBookId ? state.books.find((book) => book.id === editingBookId) : null; if (coverFile && coverFile.size > 1.5 * 1024 * 1024) { alert('표지 이미지는 1.5MB 이하로 선택해주세요.'); return; } if (coverUrl) { try { const parsedUrl = new URL(coverUrl); if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error(); } catch { alert('http 또는 https로 시작하는 이미지 URL을 입력해주세요.'); $('#bookCoverUrl').focus(); return; } } const cover = coverFile ? await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(coverFile); }) : coverUrl || ($('#bookRemoveCover').checked ? '' : existingBook?.cover || ''); const book = { id: existingBook?.id || createGoalId(), title, author: $('#bookAuthor').value.trim(), status: $('#bookStatus').value, cover }; if (existingBook) state.books[state.books.findIndex((item) => item.id === existingBook.id)] = book; else state.books.push(book); persist(); render(); bookDialog.close(); });
libraryList.addEventListener('click', (event) => { const button = event.target.closest('[data-book]'); if (button) { const index = state.books.findIndex((book) => book.id === button.dataset.book); if (index < 0 || !confirm(`“${state.books[index].title}”을(를) 서재에서 삭제할까요?`)) return; state.books.splice(index, 1); persist(); render(); return; } const card = event.target.closest('[data-edit-book]'); if (card) openBookDialog(card.dataset.editBook); });
libraryList.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-edit-book]')) { event.preventDefault(); openBookDialog(event.target.dataset.editBook); } });
balanceMonth.addEventListener('change', loadBalanceMonth);
balanceForm.addEventListener('input', updateBalanceSummary);
balanceForm.addEventListener('submit', (event) => { event.preventDefault(); const values = getBalanceValues(); const snapshot = { month: balanceMonth.value, ...values, note: $('#balanceNote').value.trim(), savedAt: new Date().toISOString() }; const index = state.businessSnapshots.findIndex((item) => item.month === snapshot.month); if (index >= 0) state.businessSnapshots[index] = snapshot; else state.businessSnapshots.push(snapshot); persist(); updateBalanceSummary(); alert(`${snapshot.month} 사업 현황을 저장했어요.`); });
document.querySelectorAll('[data-character-tab]').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('[data-character-tab]').forEach((item) => item.classList.toggle('is-active', item === tab)); document.querySelectorAll('[data-character-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.characterPanel === tab.dataset.characterTab)); }));
characterSummary.addEventListener('click', (event) => { if (event.target.closest('#editProfileButton')) openProfileDialog(); });
growthActivityList.addEventListener('click', (event) => { const button = event.target.closest('[data-log-activity]'); if (!button) return; const activity = state.growth.activities.find((item) => item.id === button.dataset.logActivity); if (!activity) return; const rewards = activity.rewards.map((reward) => ({ ...reward, skillName: growthSkill(reward.skillId)?.name || '삭제된 스킬' })); rewards.forEach((reward) => { const skill = growthSkill(reward.skillId); if (skill) skill.xp = (skill.xp || 0) + (Number(reward.xp) || 0); }); state.growth.logs.unshift({ id: createGoalId(), title: activity.name, lifeXp: Number(activity.lifeXp) || 0, rewards, loggedAt: new Date().toISOString() }); persist(); render(); showGrowthToast(activity); });
function deleteGrowthLog(logId) { const index = state.growth.logs.findIndex((log) => log.id === logId); if (index < 0) return; const log = state.growth.logs[index]; if (!confirm(`“${log.title}” 성장 기록을 삭제할까요?\n이 기록으로 얻은 경험치도 함께 되돌려집니다.`)) return; log.rewards.forEach((reward) => { const skill = growthSkill(reward.skillId); if (skill) skill.xp = Math.max(0, (skill.xp || 0) - (Number(reward.xp) || 0)); }); state.growth.logs.splice(index, 1); persist(); render(); }
[growthLogList, todayActivityLogList].forEach((list) => list.addEventListener('click', (event) => { const button = event.target.closest('[data-delete-growth-log]'); if (button) deleteGrowthLog(button.dataset.deleteGrowthLog); }));
$('#addDomainButton').addEventListener('click', () => openDomainDialog());
$('#addSkillButton').addEventListener('click', () => { if (!state.growth.domains.length) { alert('먼저 영역을 하나 만들어주세요.'); return; } openSkillDialog(); });
$('#addActivityButton').addEventListener('click', () => { if (!state.growth.skills.length) { alert('먼저 연결할 스킬을 하나 만들어주세요.'); return; } openActivityDialog(); });
domainSettingsList.addEventListener('click', (event) => { const edit = event.target.closest('[data-edit-domain]'); const remove = event.target.closest('[data-delete-domain]'); if (edit) openDomainDialog(edit.dataset.editDomain); if (remove) { const id = remove.dataset.deleteDomain; if (state.growth.skills.some((skill) => skill.domainId === id)) { alert('이 영역에 연결된 스킬이 있어요. 스킬을 다른 영역으로 옮기거나 삭제한 뒤 다시 시도해주세요.'); return; } if (!confirm('이 영역을 삭제할까요?')) return; state.growth.domains = state.growth.domains.filter((domain) => domain.id !== id); persist(); render(); } });
skillSettingsList.addEventListener('click', (event) => { const edit = event.target.closest('[data-edit-skill]'); const remove = event.target.closest('[data-delete-skill]'); if (edit) openSkillDialog(edit.dataset.editSkill); if (remove) { const id = remove.dataset.deleteSkill; if (!confirm('이 스킬을 삭제할까요?\n과거 활동 기록은 유지되지만, 이 스킬의 현재 XP는 사라집니다.')) return; state.growth.skills = state.growth.skills.filter((skill) => skill.id !== id); state.growth.activities.forEach((activity) => { activity.rewards = activity.rewards.filter((reward) => reward.skillId !== id); }); persist(); render(); } });
activitySettingsList.addEventListener('click', (event) => { const edit = event.target.closest('[data-edit-activity]'); const remove = event.target.closest('[data-delete-activity]'); if (edit) openActivityDialog(edit.dataset.editActivity); if (remove) { const id = remove.dataset.deleteActivity; if (!confirm('이 활동 템플릿을 삭제할까요?\n이미 기록한 활동은 유지됩니다.')) return; state.growth.activities = state.growth.activities.filter((activity) => activity.id !== id); persist(); render(); } });
document.addEventListener('click', (event) => { const close = event.target.closest('[data-close-dialog]'); if (close) $(`#${close.dataset.closeDialog}`).close(); });
$('#domainForm').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#domainName').value.trim(); if (!name) return; const domain = { id: editingDomainId || createGoalId(), name, icon: $('#domainIcon').value.trim() || '✦', color: $('#domainColor').value }; const index = state.growth.domains.findIndex((item) => item.id === editingDomainId); if (index >= 0) state.growth.domains[index] = domain; else state.growth.domains.push(domain); persist(); render(); $('#domainDialog').close(); });
$('#skillForm').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#skillName').value.trim(); if (!name) return; const existing = growthSkill(editingSkillId); const skill = { id: existing?.id || createGoalId(), name, domainId: $('#skillDomain').value, xp: existing?.xp || 0 }; const index = state.growth.skills.findIndex((item) => item.id === editingSkillId); if (index >= 0) state.growth.skills[index] = skill; else state.growth.skills.push(skill); persist(); render(); $('#skillDialog').close(); });
$('#addRewardButton').addEventListener('click', () => { const container = $('#activityRewardList'); if (container.querySelector('.reward-empty')) container.innerHTML = ''; container.insertAdjacentHTML('beforeend', rewardRow()); });
$('#activityRewardList').addEventListener('click', (event) => { if (event.target.closest('[data-remove-reward]')) event.target.closest('.reward-row').remove(); });
$('#activityForm').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#activityName').value.trim(); if (!name) return; const rewards = [...$('#activityRewardList').querySelectorAll('.reward-row')].map((row) => ({ skillId: row.querySelector('.reward-skill').value, xp: Number(row.querySelector('.reward-xp').value) || 0 })).filter((reward) => reward.skillId); const existing = state.growth.activities.find((item) => item.id === editingActivityId); const activity = { id: existing?.id || createGoalId(), name, lifeXp: Number($('#activityLifeXp').value) || 0, rewards }; const index = state.growth.activities.findIndex((item) => item.id === editingActivityId); if (index >= 0) state.growth.activities[index] = activity; else state.growth.activities.push(activity); persist(); render(); $('#activityDialog').close(); });
$('#profileForm').addEventListener('submit', async (event) => { event.preventDefault(); const name = $('#profileName').value.trim(); if (!name) return; const imageFile = $('#profileImageFile').files[0]; const imageUrl = $('#profileImageUrl').value.trim(); if (imageFile && imageFile.size > 1 * 1024 * 1024) { alert('프로필 사진은 1MB 이하로 선택해주세요.'); return; } if (imageUrl) { try { const parsedUrl = new URL(imageUrl); if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error(); } catch { alert('http 또는 https로 시작하는 이미지 URL을 입력해주세요.'); $('#profileImageUrl').focus(); return; } } const image = imageFile ? await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(imageFile); }) : imageUrl || ($('#removeProfileImage').checked ? '' : state.growth.profile.image || ''); state.growth.profile = { name, bio: $('#profileBio').value.trim(), image }; persist(); render(); profileDialog.close(); });
authButton.addEventListener('click', async () => { if (!supabaseClient) { alert('클라우드 연결을 불러오지 못했어요. 인터넷 연결을 확인해주세요.'); return; } if (signedInUser) { await supabaseClient.auth.signOut(); return; } $('#authForm').reset(); $('#authMessage').textContent = ''; authDialog.showModal(); $('#authEmail').focus(); });
async function submitAuth(mode) { if (!supabaseClient) return; const email = $('#authEmail').value.trim(); const password = $('#authPassword').value; if (!email || !password) return; const message = $('#authMessage'); message.textContent = '처리 중…'; const result = mode === 'signup' ? await supabaseClient.auth.signUp({ email, password }) : await supabaseClient.auth.signInWithPassword({ email, password }); if (result.error) { message.textContent = result.error.message; return; } if (mode === 'signup' && !result.data.session) { message.textContent = '인증 이메일을 보냈어요. 메일의 링크를 열어 계정을 확인해주세요.'; return; } message.textContent = ''; authDialog.close(); await applySession(result.data.session); }
$('#authForm').addEventListener('submit', async (event) => { event.preventDefault(); await submitAuth('signin'); });
$('#signUpButton').addEventListener('click', async () => { await submitAuth('signup'); });
$('#resetButton').addEventListener('click', () => { if (!confirm('입력한 비전, 사진, 목표, 업적, 책, 사업 기록을 모두 지울까요?')) return; state = { vision: '', images: [], goals: [], achievements: [], books: [], businessSnapshots: [], growth: createDefaultGrowth() }; persist(); render(); });
function setActiveView(view, writeHash = true) { const allowedViews = ['today', 'character', 'goals', 'business', 'library']; const activeView = allowedViews.includes(view) ? view : 'today'; document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === activeView)); document.querySelectorAll('.main-nav [data-nav-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.navView === activeView)); localStorage.setItem('my-life-active-view', activeView); if (writeHash && location.hash !== `#${activeView}`) location.hash = activeView; window.scrollTo({ top: 0, behavior: 'smooth' }); }
document.addEventListener('click', (event) => { const navigation = event.target.closest('[data-nav-view]'); if (!navigation) return; setActiveView(navigation.dataset.navView); });
window.addEventListener('hashchange', () => setActiveView(location.hash.slice(1), false));
$('#today').textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
let addedAchievementOnLoad = false;
state.goals.forEach((goal) => { if (recordMilestoneAchievements(goal)) addedAchievementOnLoad = true; if (recordAchievement(goal)) addedAchievementOnLoad = true; });
if (addedAchievementOnLoad) persist();
render();
setActiveView(location.hash.slice(1) || localStorage.getItem('my-life-active-view') || 'today', false);
initializeCloudSync();
