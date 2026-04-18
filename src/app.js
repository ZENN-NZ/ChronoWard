// ============================
// ChronoWard — app.js (Tauri)
// ============================
// IPC layer: window.electronAPI → Tauri invoke/listen
// Uses window.__TAURI__ globals injected by withGlobalTauri: true
// No bundler or ES module imports needed.

const { invoke }        = window.__TAURI__.core;
const { listen, emit }  = window.__TAURI__.event;

// ---- State ----
let settings             = {};
let sheets               = {};
let timers               = {};
let activeTimerIntervals = {};
let currentDate          = '';
let projectMode          = false;
let detailedMode           = false;
let activeDescTimerId    = null;
let isEmergencyMode      = false;    // NEW: set true if keychain unavailable

let rowCounter      = 0;
let dataChangeTimer = null;

const THEMES = [
  { id: 'midnight', name: 'Midnight', colors: ['#0d0e14', '#7c6df8', '#252636'] },
  { id: 'obsidian', name: 'Obsidian', colors: ['#090a0f', '#5b6af0', '#1e1f2e'] },
  { id: 'aurora',   name: 'Aurora',   colors: ['#0a0e1a', '#00d4ff', '#1c2840'] },
  { id: 'ember',    name: 'Ember',    colors: ['#0f0c0a', '#ff6630', '#2e221e'] },
  { id: 'forest',   name: 'Forest',   colors: ['#080f0a', '#44d980', '#1a2e1e'] },
  { id: 'rose',     name: 'Rose',     colors: ['#0f080e', '#e066cc', '#2e1a2e'] },
  { id: 'steel',    name: 'Steel',    colors: ['#0a0c10', '#8899cc', '#222630'] },
  { id: 'void',     name: 'Void',     colors: ['#000000', '#ffffff', '#181818'] },
  { id: 'neon',     name: 'Neon',     colors: ['#050510', '#00ffcc', '#1a1a3a'] },
  { id: 'light',    name: 'Light',    colors: ['#f5f6fa', '#5b6af0', '#d8dae8'] },
];

// ---- UUID helper ----
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ---- Init ----
async function init() {
  // Wire up event listeners BEFORE loading data
  setupStaticListeners();
  setupEventListeners();

  settings = await invoke('load_settings');
  const sheetsResult = await invoke('load_sheets');

  // Handle emergency mode (Decision 1c-ii)
  if (sheetsResult.ok === false && sheetsResult.code === 'EMERGENCY_MODE') {
    enterEmergencyMode(sheetsResult);
    // Still load settings (they may be readable even in emergency mode)
    // and render a read-only view of whatever we have
    sheets = {};
  } else {
    sheets = sheetsResult.data || {};

    // Warn if corrupt data was quarantined
    if (sheetsResult.warning === 'CORRUPT_DATA_QUARANTINED') {
      showCorruptDataWarning(sheetsResult.quarantinedTo);
    }
  }

  timers = await invoke('load_timers');

  currentDate = getTodayString();
  document.getElementById('selectedDate').value = currentDate;

  applyTheme(settings.theme || 'midnight');
  renderThemeGrid();
  applySettingsToUI();

  projectMode = settings.projectMode || false;
  document.getElementById('projectModeToggle').checked = projectMode;
  document.getElementById('settingProjectMode').checked = projectMode;
  applyProjectMode();

  detailedMode = settings.detailedMode || false;
  document.getElementById('detailedModeToggle').checked = detailedMode;
  document.getElementById('settingDetailedMode').checked = detailedMode;
  applyDetailedMode();

  loadSheetForDate(currentDate);
  restoreTimers();
  setupHoursWarning();
  setupKeyboardShortcuts();

  document.getElementById('selectedDate').addEventListener('change', (e) => {
    saveCurrentSheet();
    currentDate = e.target.value;
    loadSheetForDate(currentDate);
  });

  document.addEventListener('mousemove', () => { window.lastActivity = Date.now(); });
  document.addEventListener('keydown',   () => { window.lastActivity = Date.now(); });
  document.addEventListener('click',     () => closeAllMenus());
  window.lastActivity = Date.now();

  // Tell main process we're ready — triggers emergency-mode event if needed
  await emit('renderer-ready');

  // Idle detection: if window has been unfocused for >1 min, minimize to tray
  setInterval(() => {
    if (document.hidden && Date.now() - window.lastActivity > 60 * 1000) {
      window.lastActivity = Date.now();
      invoke('minimize_to_tray').catch(() => {});
    }
  }, 10000);
}

// ── Emergency mode UI ─────────────────────────────────────────────────────────

function enterEmergencyMode(info) {
  isEmergencyMode = true;
  const banner = document.getElementById('emergencyModeBanner');
  if (banner) {
    banner.classList.remove('hidden');
    const msgEl = banner.querySelector('.emergency-text');
    if (msgEl) {
      msgEl.textContent = info.encryptedDataExists
        ? `Read-only mode: your timesheet data is encrypted but the OS keychain is unavailable. ` +
          `No data has been lost. Contact your IT administrator to restore keychain access.`
        : `Read-only mode: the OS keychain is unavailable. ` +
          `Data cannot be saved until the keychain is restored.`;
    }
  }

  // Disable all save-related UI
  document.querySelectorAll(
    '.btn-primary, .stepper-btn, .task-input, .hours-input, .ot-toggle, .timer-btn, .timer-stop-btn'
  ).forEach(el => {
    el.disabled = true;
    el.title = 'Read-only: keychain unavailable';
  });
}

function showCorruptDataWarning(quarantinedPath) {
  showToast(`⚠ Corrupt data found and quarantined to: ${quarantinedPath}`, 8000);
}

// ── Static DOM event listeners (replaces inline onclick/onchange) ─────────────

function setupStaticListeners() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Timesheet header buttons
  document.getElementById('addRowBtn').addEventListener('click', () => addRow());
  document.getElementById('exportBtn').addEventListener('click', () => exportCSV());
  document.getElementById('deleteSelectedBtn').addEventListener('click', () => deleteCheckedRows());

  // Project / Detailed mode toggles
  document.getElementById('projectModeToggle').addEventListener('change', () => toggleProjectMode());
  document.getElementById('detailedModeToggle').addEventListener('change', () => toggleDetailedMode());

  // Select all checkbox
  document.getElementById('selectAllCheck').addEventListener('change', (e) => toggleSelectAll(e.target));

  // Import view
  document.getElementById('importBtn').addEventListener('click', () => importCSV());
  document.getElementById('clearImportBtn').addEventListener('click', () => clearImportedFiles());

  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => saveSettings());
  document.getElementById('settingProjectMode').addEventListener('change', () => syncProjectModeFromSettings());
  document.getElementById('settingDetailedMode').addEventListener('change', () => syncDetailedModeFromSettings());

  // Description modal
  document.getElementById('descModal').addEventListener('click', (e) => closeDescModal(e));
  document.getElementById('descCopyBtn').addEventListener('click', () => copyDescription());
  document.getElementById('descCloseBtn').addEventListener('click', () => closeDescModal());
}

// ── Event listeners (replaces electronAPI.on* pattern) ───────────────────────

async function setupEventListeners() {
  const { getCurrentWindow } = window.__TAURI__.window;
  const appWindow = getCurrentWindow();

  // Scheduler → renderer: check if hours warning should show
  await listen('check-hours-warning', () => {
    if (currentDate === getTodayString()) checkHoursWarning();
  });

  // Scheduler → renderer: focus time triggered (subtle UI indicator)
  await listen('focus-time-trigger', (event) => {
    showToast(`⏰ Focus reminder: ${event.payload}`);
  });

  // Main process → renderer: emergency mode activated
  await listen('emergency-mode', (event) => {
    enterEmergencyMode(event.payload);
  });
}

// ---- Date helpers ----
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ---- Theme ----
function applyTheme(themeId) {
  if (!THEMES.find(t => t.id === themeId)) return;
  document.body.className = `theme-${themeId}`;
  settings.theme = themeId;
  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === themeId);
  });
}

function renderThemeGrid() {
  const grid = document.getElementById('themeGrid');
  grid.innerHTML = '';
  THEMES.forEach(theme => {
    const swatch = document.createElement('div');
    swatch.className = `theme-swatch${settings.theme === theme.id ? ' active' : ''}`;
    swatch.dataset.theme = theme.id;
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-checked', settings.theme === theme.id ? 'true' : 'false');
    swatch.setAttribute('aria-label', `${theme.name} theme`);
    swatch.setAttribute('tabindex', '0');
    swatch.onclick = () => applyTheme(theme.id);
    swatch.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') applyTheme(theme.id); };

    const preview = document.createElement('div');
    preview.className = 'swatch-preview';
    preview.style.cssText = `background:linear-gradient(135deg,${theme.colors[0]} 50%,${theme.colors[2]} 100%);position:relative;`;
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;bottom:4px;right:4px;width:8px;height:8px;border-radius:50%;background:${theme.colors[1]};`;
    preview.appendChild(dot);

    const name = document.createElement('div');
    name.className = 'swatch-name';
    name.textContent = theme.name;

    swatch.appendChild(preview);
    swatch.appendChild(name);
    grid.appendChild(swatch);
  });
}

// ---- Settings ----
function applySettingsToUI() {
  document.getElementById('settingIncrement').value   = settings.hourIncrement   || 0.5;
  document.getElementById('settingMinHours').value    = settings.minHoursWarning || 7.5;
  document.getElementById('settingWarningTime').value = settings.warningTime     || '16:30';
  document.getElementById('settingAutoStart').checked = settings.autoStart ?? true;
  const ft = settings.focusTimes || ['11:00', '14:00', '16:00'];
  document.getElementById('focusTime1').value = ft[0] || '11:00';
  document.getElementById('focusTime2').value = ft[1] || '14:00';
  document.getElementById('focusTime3').value = ft[2] || '16:00';
}

async function saveSettings() {
  if (isEmergencyMode) { showToast('⚠ Read-only mode — settings cannot be saved'); return; }

  settings.theme           = settings.theme || 'midnight';
  settings.hourIncrement   = parseFloat(document.getElementById('settingIncrement').value)   || 0.5;
  settings.minHoursWarning = parseFloat(document.getElementById('settingMinHours').value)    || 7.5;
  settings.warningTime     = document.getElementById('settingWarningTime').value             || '16:30';
  settings.focusTimes      = [
    document.getElementById('focusTime1').value || '11:00',
    document.getElementById('focusTime2').value || '14:00',
    document.getElementById('focusTime3').value || '16:00',
  ];
  settings.autoStart = document.getElementById('settingAutoStart').checked;
  settings.projectMode = document.getElementById('settingProjectMode').checked;
  projectMode = settings.projectMode;
  document.getElementById('projectModeToggle').checked = projectMode;
  applyProjectMode();

  settings.detailedMode = document.getElementById('settingDetailedMode').checked;
  detailedMode = settings.detailedMode;
  document.getElementById('detailedModeToggle').checked = detailedMode;
  applyDetailedMode();

  await invoke('save_settings', { settings });
  showToast('Settings saved ✓');
  checkHoursWarning();
}

function syncProjectModeFromSettings() {
  projectMode = document.getElementById('settingProjectMode').checked;
  document.getElementById('projectModeToggle').checked = projectMode;
  applyProjectMode();
}

// ---- View switching ----
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
  document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
  if (viewId === 'settings') renderThemeGrid();
}

// ---- Project Mode ----
function toggleProjectMode() {
  projectMode = document.getElementById('projectModeToggle').checked;
  document.getElementById('settingProjectMode').checked = projectMode;
  settings.projectMode = projectMode;
  applyProjectMode();
  if (!isEmergencyMode) invoke('save_settings', { settings });
}

function applyProjectMode() {
  const timerCol = document.getElementById('timerColHeader');
  document.querySelectorAll('.timer-col-cell').forEach(c =>
    c.classList.toggle('hidden', !projectMode)
  );
  timerCol.classList.toggle('hidden', !projectMode);
}

function toggleDetailedMode() {
  detailedMode = document.getElementById('detailedModeToggle').checked;
  document.getElementById('settingDetailedMode').checked = detailedMode;
  settings.detailedMode = detailedMode;
  applyDetailedMode();
  if (!isEmergencyMode) invoke('save_settings', { settings });
}

function applyDetailedMode() {
  document.getElementById('detailedColHeader').classList.toggle('hidden', !detailedMode);
  document.getElementById('descColHeader').classList.toggle('hidden', !detailedMode);
  document.querySelectorAll('.ticket-col-cell').forEach(c => c.classList.toggle('hidden', !detailedMode));
  document.querySelectorAll('.desc-col-cell').forEach(c => c.classList.toggle('hidden', !detailedMode));
  const tmHeader = document.getElementById('detailedModeHeaderToggle');
  if (tmHeader) tmHeader.style.display = '';
}

function syncDetailedModeFromSettings() {
  detailedMode = document.getElementById('settingDetailedMode').checked;
  document.getElementById('detailedModeToggle').checked = detailedMode;
  applyDetailedMode();
}

function openDescModal(timerId) {
  const tr = document.querySelector(`tr[data-timer-id="${timerId}"]`);
  if (!tr) return;
  activeDescTimerId = timerId;
  const btn = tr.querySelector('.desc-btn');
  const desc = btn?.dataset.desc || '';
  document.getElementById('descModalTextarea').value = desc;
  document.getElementById('descModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('descModalTextarea').focus(), 50);
}

function closeDescModal(e) {
  if (e && e.target !== document.getElementById('descModal')) return;
  saveDescModal();
  document.getElementById('descModal').classList.add('hidden');
  activeDescTimerId = null;
}

function saveDescModal() {
  if (!activeDescTimerId) return;
  const tr = document.querySelector(`tr[data-timer-id="${activeDescTimerId}"]`);
  if (!tr) return;
  const text = document.getElementById('descModalTextarea').value;
  const btn = tr.querySelector('.desc-btn');
  if (btn) {
    btn.dataset.desc = text;
    btn.textContent = text.length > 0 ? '📝' : '＋';
    btn.classList.toggle('has-desc', text.length > 0);
    btn.title = text.length > 0 ? 'Edit description' : 'Add description';
  }
  saveCurrentSheet();
}

function copyDescription() {
  const text = document.getElementById('descModalTextarea').value;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('descCopyBtn');
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = '⧉ Copy'; }, 1500);
  });
}

// ---- Sheet management ----
function loadSheetForDate(date) {
  document.getElementById('timesheetBody').innerHTML = '';
  rowCounter = 0;
  const rows = sheets[date] || [];
  if (rows.length === 0) addRow();
  else rows.forEach(r => addRow(r));
  updateTotals();
}

function saveCurrentSheet() {
  if (isEmergencyMode) return;
  sheets[currentDate] = collectRows();
  invoke('save_sheets', { sheets }).catch(err => {
    // If save fails (e.g. keychain went down mid-session), show a warning
    // but don't lose the in-memory data
    console.error('save_sheets failed:', err);
    if (err?.includes?.('WRITE_BLOCKED_EMERGENCY_MODE')) {
      enterEmergencyMode({ encryptedDataExists: true });
    }
  });
}

function collectRows() {
  const rows = [];
  document.querySelectorAll('#timesheetBody tr').forEach(tr => {
    rows.push({
      timerId:     tr.dataset.timerId,
      task:        tr.querySelector('.task-input')?.value || '',
      hours:       parseFloat(tr.querySelector('.hours-input')?.value) || 0,
      ot:          tr.querySelector('.ot-toggle')?.classList.contains('active') || false,
      ticketNum:   tr.querySelector('.ticket-input')?.value || '',
      description: tr.querySelector('.desc-btn')?.dataset.desc || '',
    });
  });
  return rows;
}

// ---- Row management ---- (unchanged from Electron version)
function addRow(data = null, insertAfterEl = null) {
  rowCounter++;
  const timerId = data?.timerId || generateId();
  const tbody   = document.getElementById('timesheetBody');
  const tr      = document.createElement('tr');

  tr.dataset.timerId = timerId;
  tr.className = 'row-new';

  const task        = data?.task        || '';
  const hours       = data?.hours       || 0;
  const ot          = data?.ot          || false;
  const otActive    = ot ? ' active' : '';
  const ticketNum   = data?.ticketNum   || '';
  const description = data?.description || '';
  const hasDesc     = description.length > 0;

  // ── col-select ──
  const tdSelect = document.createElement('td');
  tdSelect.className = 'col-select';
  const rowCheckbox = document.createElement('input');
  rowCheckbox.type = 'checkbox';
  rowCheckbox.className = 'row-checkbox';
  rowCheckbox.setAttribute('aria-label', 'Select row');
  rowCheckbox.addEventListener('change', () => onRowCheck(rowCheckbox));
  tdSelect.appendChild(rowCheckbox);
  tr.appendChild(tdSelect);

  // ── col-task ──
  const tdTask = document.createElement('td');
  tdTask.className = 'col-task';
  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.className = 'task-input';
  taskInput.placeholder = 'Describe your work…';
  taskInput.value = task;
  taskInput.setAttribute('aria-label', 'Task description');
  taskInput.addEventListener('input', () => onDataChangeDebounced());
  taskInput.addEventListener('blur', () => saveCurrentSheet());
  tdTask.appendChild(taskInput);
  tr.appendChild(tdTask);

  // ── col-hours ──
  const tdHours = document.createElement('td');
  tdHours.className = 'col-hours';
  const stepper = document.createElement('div');
  stepper.className = 'hours-stepper';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', 'Hours');
  const btnMinus = document.createElement('button');
  btnMinus.className = 'stepper-btn';
  btnMinus.setAttribute('aria-label', 'Decrease hours');
  btnMinus.textContent = '−';
  btnMinus.addEventListener('click', () => stepHours(timerId, -1));
  const hoursInput = document.createElement('input');
  hoursInput.type = 'number';
  hoursInput.className = 'hours-input';
  hoursInput.value = hours;
  hoursInput.min = 0;
  hoursInput.max = 24;
  hoursInput.step = settings.hourIncrement || 0.5;
  hoursInput.setAttribute('aria-label', 'Hours worked');
  hoursInput.addEventListener('input', () => onDataChangeDebounced());
  hoursInput.addEventListener('blur', () => saveCurrentSheet());
  const btnPlus = document.createElement('button');
  btnPlus.className = 'stepper-btn';
  btnPlus.setAttribute('aria-label', 'Increase hours');
  btnPlus.textContent = '+';
  btnPlus.addEventListener('click', () => stepHours(timerId, 1));
  stepper.appendChild(btnMinus);
  stepper.appendChild(hoursInput);
  stepper.appendChild(btnPlus);
  tdHours.appendChild(stepper);
  tr.appendChild(tdHours);

  // ── col-detailed (ticket) ──
  const tdTicket = document.createElement('td');
  tdTicket.className = 'col-detailed ticket-col-cell' + (detailedMode ? '' : ' hidden');
  const ticketInput = document.createElement('input');
  ticketInput.type = 'text';
  ticketInput.className = 'ticket-input';
  ticketInput.placeholder = 'e.g. 12345';
  ticketInput.value = ticketNum;
  ticketInput.maxLength = 11;
  ticketInput.setAttribute('aria-label', 'Ticket number');
  ticketInput.addEventListener('input', () => onDataChangeDebounced());
  ticketInput.addEventListener('blur', () => saveCurrentSheet());
  tdTicket.appendChild(ticketInput);
  tr.appendChild(tdTicket);

  // ── col-desc ──
  const tdDesc = document.createElement('td');
  tdDesc.className = 'col-desc desc-col-cell' + (detailedMode ? '' : ' hidden');
  const descBtn = document.createElement('button');
  descBtn.className = 'desc-btn' + (hasDesc ? ' has-desc' : '');
  descBtn.dataset.desc = description;
  descBtn.dataset.timerId = timerId;
  descBtn.setAttribute('aria-label', 'Open description');
  descBtn.title = hasDesc ? 'Edit description' : 'Add description';
  descBtn.textContent = hasDesc ? '📝' : '＋';
  descBtn.addEventListener('click', () => openDescModal(timerId));
  tdDesc.appendChild(descBtn);
  tr.appendChild(tdDesc);

  // ── col-timer ──
  const tdTimer = document.createElement('td');
  tdTimer.className = 'col-timer timer-col-cell' + (projectMode ? '' : ' hidden');
  const timerCell = document.createElement('div');
  timerCell.className = 'timer-cell';
  const timerBtn = document.createElement('button');
  timerBtn.className = 'timer-btn';
  timerBtn.dataset.timerId = timerId;
  timerBtn.setAttribute('aria-label', 'Start timer');
  timerBtn.addEventListener('click', () => toggleTimer(timerId));
  const timerDot = document.createElement('span');
  timerDot.className = 'timer-dot';
  timerDot.setAttribute('aria-hidden', 'true');
  const timerDisplay = document.createElement('span');
  timerDisplay.className = 'timer-display';
  timerDisplay.id = `timer-display-${timerId}`;
  timerDisplay.textContent = '00:00:00';
  timerBtn.appendChild(timerDot);
  timerBtn.appendChild(timerDisplay);
  const timerStopBtn = document.createElement('button');
  timerStopBtn.className = 'timer-stop-btn hidden';
  timerStopBtn.id = `timer-stop-${timerId}`;
  timerStopBtn.setAttribute('aria-label', 'Stop timer and log hours');
  timerStopBtn.title = 'Stop & add hours';
  timerStopBtn.textContent = '■';
  timerStopBtn.addEventListener('click', () => stopTimer(timerId));
  timerCell.appendChild(timerBtn);
  timerCell.appendChild(timerStopBtn);
  tdTimer.appendChild(timerCell);
  tr.appendChild(tdTimer);

  // ── col-ot ──
  const tdOt = document.createElement('td');
  tdOt.className = 'col-ot';
  const otBtn = document.createElement('button');
  otBtn.className = 'ot-toggle' + (ot ? ' active' : '');
  otBtn.setAttribute('role', 'switch');
  otBtn.setAttribute('aria-checked', ot);
  otBtn.setAttribute('aria-label', 'Overtime');
  otBtn.title = 'Toggle Overtime';
  otBtn.textContent = 'OT';
  otBtn.addEventListener('click', () => toggleOT(otBtn, timerId));
  tdOt.appendChild(otBtn);
  tr.appendChild(tdOt);

  // ── col-actions ──
  const tdActions = document.createElement('td');
  tdActions.className = 'col-actions';
  const menuWrap = document.createElement('div');
  menuWrap.className = 'row-menu-wrap';
  const menuBtn = document.createElement('button');
  menuBtn.className = 'row-menu-btn';
  menuBtn.setAttribute('aria-label', 'Row actions');
  menuBtn.textContent = '⋮';
  menuBtn.addEventListener('click', (e) => openRowMenu(e, timerId));
  const dropdown = document.createElement('div');
  dropdown.className = 'row-dropdown';
  dropdown.id = `row-menu-${timerId}`;
  const dupItem = document.createElement('button');
  dupItem.className = 'row-dropdown-item';
  dupItem.textContent = '⧉ Duplicate';
  dupItem.addEventListener('click', () => { duplicateRow(timerId); closeAllMenus(); });
  const delItem = document.createElement('button');
  delItem.className = 'row-dropdown-item danger';
  delItem.textContent = '🗑 Delete';
  delItem.addEventListener('click', () => { deleteRow(timerId); closeAllMenus(); });
  dropdown.appendChild(dupItem);
  dropdown.appendChild(delItem);
  menuWrap.appendChild(menuBtn);
  menuWrap.appendChild(dropdown);
  tdActions.appendChild(menuWrap);
  tr.appendChild(tdActions);

  if (ot) tr.classList.add('ot-row');
  if (insertAfterEl) insertAfterEl.after(tr);
  else tbody.appendChild(tr);

  if (timers[timerId]) updateTimerDisplay(timerId);
  return tr;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function onDataChangeDebounced() {
  clearTimeout(dataChangeTimer);
  dataChangeTimer = setTimeout(() => { updateTotals(); checkHoursWarning(); }, 150);
}
function onDataChange() { updateTotals(); checkHoursWarning(); }

function stepHours(timerId, dir) {
  const tr = document.querySelector(`[data-timer-id="${timerId}"]`)?.closest('tr');
  if (!tr) return;
  const input = tr.querySelector('.hours-input');
  const inc   = parseFloat(settings.hourIncrement) || 0.5;
  let val     = parseFloat(input.value) || 0;
  val = Math.max(0, Math.round((val + dir * inc) / inc) * inc);
  input.value = parseFloat(val.toFixed(2));
  onDataChange();
  saveCurrentSheet();
}

function toggleOT(btn, timerId) {
  const isActive = btn.classList.toggle('active');
  btn.setAttribute('aria-checked', isActive);
  const tr = btn.closest('tr');
  if (tr) tr.classList.toggle('ot-row', isActive);
  onDataChange();
  saveCurrentSheet();
}

// ---- Totals ----
function updateTotals() {
  let regular = 0, overtime = 0;
  document.querySelectorAll('#timesheetBody tr').forEach(tr => {
    const hours = parseFloat(tr.querySelector('.hours-input')?.value) || 0;
    const ot    = tr.querySelector('.ot-toggle')?.classList.contains('active');
    if (ot) overtime += hours;
    else    regular  += hours;
  });
  const total = regular + overtime;
  document.getElementById('regularHours').textContent      = regular.toFixed(1) + 'h';
  document.getElementById('overtimeHours').textContent     = overtime.toFixed(1) + 'h';
  document.getElementById('footerTotal').textContent       = total.toFixed(1) + 'h';
  document.getElementById('totalHoursDisplay').textContent = total.toFixed(1) + 'h';
  emit('hours-updated', { total }).catch(() => {});
  return total;
}

// ---- Selection & Delete ---- (unchanged)
function toggleSelectAll(checkbox) {
  document.querySelectorAll('#timesheetBody .row-checkbox').forEach(cb => {
    cb.checked = checkbox.checked;
    cb.closest('tr')?.classList.toggle('selected', checkbox.checked);
  });
  updateSelectionBar();
}

function onRowCheck(checkbox) {
  checkbox.closest('tr')?.classList.toggle('selected', checkbox.checked);
  const all     = document.querySelectorAll('#timesheetBody .row-checkbox');
  const checked = document.querySelectorAll('#timesheetBody .row-checkbox:checked');
  const selectAllCheck = document.getElementById('selectAllCheck');
  selectAllCheck.indeterminate = checked.length > 0 && checked.length < all.length;
  selectAllCheck.checked = checked.length === all.length && all.length > 0;
  updateSelectionBar();
}

function updateSelectionBar() {
  const checked = document.querySelectorAll('#timesheetBody .row-checkbox:checked');
  const total   = document.querySelectorAll('#timesheetBody .row-checkbox');
  const bar     = document.getElementById('selectionActions');
  const countEl = document.getElementById('selectionCount');
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  if (checked.length === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const isAll = checked.length === total.length;
  countEl.textContent   = isAll ? `All ${checked.length} selected` : `${checked.length} selected`;
  deleteBtn.textContent = isAll ? `🗑 Delete All (${checked.length})` : `🗑 Delete (${checked.length})`;
}

function deleteCheckedRows() {
  document.querySelectorAll('#timesheetBody .row-checkbox:checked').forEach(cb => {
    const tr = cb.closest('tr');
    if (tr) {
      const tid = tr.dataset.timerId;
      if (tid) stopTimer(tid, true);
      tr.remove();
    }
  });
  const selectAllCheck = document.getElementById('selectAllCheck');
  selectAllCheck.checked = false;
  selectAllCheck.indeterminate = false;
  document.getElementById('selectionActions').classList.add('hidden');
  onDataChange();
  saveCurrentSheet();
}

// ---- Row context menu ---- (unchanged)
function openRowMenu(e, timerId) {
  e.stopPropagation();
  const menu = document.getElementById(`row-menu-${timerId}`);
  const btn  = e.currentTarget;
  const isOpen = menu.classList.contains('open');
  closeAllMenus();
  if (!isOpen) { menu.classList.add('open'); btn.classList.add('open'); }
}
function closeAllMenus() {
  document.querySelectorAll('.row-dropdown.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.row-menu-btn.open').forEach(b => b.classList.remove('open'));
}
function deleteRow(timerId) {
  const tr = document.querySelector(`tr[data-timer-id="${timerId}"]`);
  if (!tr) return;
  stopTimer(timerId, true);
  tr.remove();
  onDataChange();
  saveCurrentSheet();
}
function duplicateRow(timerId) {
  const tr = document.querySelector(`tr[data-timer-id="${timerId}"]`);
  if (!tr) return;
  const data = {
    task:        tr.querySelector('.task-input')?.value || '',
    hours:       parseFloat(tr.querySelector('.hours-input')?.value) || 0,
    ot:          tr.querySelector('.ot-toggle')?.classList.contains('active') || false,
    ticketNum:   tr.querySelector('.ticket-input')?.value || '',
    description: tr.querySelector('.desc-btn')?.dataset.desc || '',
  };
  addRow(data, tr);
  onDataChange();
  saveCurrentSheet();
}

// ---- Timers ---- (unchanged logic, save via invoke)
function toggleTimer(timerId) {
  if (!timers[timerId]) timers[timerId] = { elapsed: 0, running: false, startedAt: null };
  const t = timers[timerId];
  if (t.running) {
    t.elapsed  += Date.now() - t.startedAt;
    t.running   = false;
    t.startedAt = null;
    clearInterval(activeTimerIntervals[timerId]);
    delete activeTimerIntervals[timerId];
    updateTimerBtnState(timerId, false);
    const stopBtn = document.getElementById(`timer-stop-${timerId}`);
    if (stopBtn) stopBtn.classList.remove('hidden');
  } else {
    t.running   = true;
    t.startedAt = Date.now();
    activeTimerIntervals[timerId] = setInterval(() => updateTimerDisplay(timerId), 1000);
    updateTimerBtnState(timerId, true);
    const stopBtn = document.getElementById(`timer-stop-${timerId}`);
    if (stopBtn) stopBtn.classList.add('hidden');
  }
  if (!isEmergencyMode) invoke('save_timers', { timers }).catch(console.error);
}

function stopTimer(timerId, silent = false) {
  const t = timers[timerId];
  if (!t) return;
  if (t.running) {
    t.elapsed  += Date.now() - t.startedAt;
    t.running   = false;
    t.startedAt = null;
    clearInterval(activeTimerIntervals[timerId]);
    delete activeTimerIntervals[timerId];
  }
  if (!silent) {
    const totalHoursRaw = t.elapsed / 1000 / 3600;
    const roundedHours  = Math.ceil(totalHoursRaw * 2) / 2;
    const tr = document.querySelector(`[data-timer-id="${timerId}"]`)?.closest('tr');
    if (tr) {
      const input   = tr.querySelector('.hours-input');
      const existing = parseFloat(input.value) || 0;
      input.value   = (existing + roundedHours).toFixed(1);
    }
  }
  delete timers[timerId];
  if (!isEmergencyMode) invoke('save_timers', { timers }).catch(console.error);
  const display = document.getElementById(`timer-display-${timerId}`);
  if (display) display.textContent = '00:00:00';
  const stopBtn = document.getElementById(`timer-stop-${timerId}`);
  if (stopBtn) stopBtn.classList.add('hidden');
  updateTimerBtnState(timerId, false);
  if (!silent) { onDataChange(); saveCurrentSheet(); }
}

function updateTimerDisplay(timerId) {
  const t = timers[timerId];
  if (!t) return;
  let elapsed = t.elapsed;
  if (t.running && t.startedAt) elapsed += Date.now() - t.startedAt;
  const secs = Math.floor(elapsed / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const display = document.getElementById(`timer-display-${timerId}`);
  if (display) {
    display.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
}

function updateTimerBtnState(timerId, running) {
  const btn = document.querySelector(`.timer-btn[data-timer-id="${timerId}"]`);
  if (!btn) return;
  btn.classList.toggle('running', running);
  btn.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
}

function restoreTimers() {
  Object.entries(timers).forEach(([timerId, t]) => {
    if (t.running) {
      activeTimerIntervals[timerId] = setInterval(() => updateTimerDisplay(timerId), 1000);
      updateTimerBtnState(timerId, true);
      const stopBtn = document.getElementById(`timer-stop-${timerId}`);
      if (stopBtn) stopBtn.classList.add('hidden');
    } else if (t.elapsed > 0) {
      updateTimerDisplay(timerId);
      const stopBtn = document.getElementById(`timer-stop-${timerId}`);
      if (stopBtn) stopBtn.classList.remove('hidden');
    }
  });
}

// ---- Export CSV ----
async function exportCSV() {
  saveCurrentSheet();
  const rows    = collectRows();
  const [y, m, d] = currentDate.split('-');
  const dateStr = `${d}-${m}-${y}`;

  const hasTicket = rows.some(r => (r.ticketNum || '').trim().length > 0);
  const hasDesc   = rows.some(r => (r.description || '').trim().length > 0);

  // Dynamic header creation based on data presence
  let headers = ['Task', 'Hours', 'Overtime'];
  if (hasTicket) headers.push('Ticket #');
  if (hasDesc)   headers.push('Description');

  const lines = [headers.join(',')];
  rows.forEach(r => {
    // Initialize the row structure matching the header count/order
    const cols = [];
    cols.push(`"${(r.task || '').replace(/"/g, '""')}"`);
    cols.push(r.hours);
    cols.push(r.ot ? 'Yes' : 'No');

    // Dynamically add ticket and description columns in the correct order
    if (hasTicket) {
      cols.push(`"${(r.ticketNum || '').replace(/"/g, '""')}"`);
    }
    if (hasDesc) {
      cols.push(`"${(r.description || '').replace(/"/g, '""')}"`);
    }
    lines.push(cols.join(','));
  });

  const result = await invoke('export_csv', {
    payload: { content: lines.join('\n'), date: dateStr }
  });
  if (result.success) showToast(`Exported ✓`);
}

// ---- Import CSV ----
async function importCSV() {
  const files = await invoke('import_csv');
  if (!files || files.length === 0) return;

  const container = document.getElementById('importedFiles');
  container.innerHTML = '';
  document.getElementById('clearImportBtn').classList.remove('hidden');

  files.forEach(file => {
    const rows      = parseCSV(file.content);
    const hasTicket = rows.some(r => (r.ticketNum || '').trim().length > 0);
    const hasDesc   = rows.some(r => (r.description || '').trim().length > 0);

    const card = document.createElement('div');
    card.className = 'imported-file-card';

    const header = document.createElement('div');
    header.className = 'file-card-header';
    const iconSpan  = document.createElement('span'); iconSpan.textContent = '📄';
    const nameSpan  = document.createElement('span'); nameSpan.className = 'file-card-name'; nameSpan.textContent = file.name;
    const countSpan = document.createElement('span'); countSpan.style.cssText = 'font-size:11px;color:var(--text-3)'; countSpan.textContent = `${rows.length} rows`;
    header.appendChild(iconSpan); header.appendChild(nameSpan); header.appendChild(countSpan);

    const table = document.createElement('table');
    table.className = 'imported-table';
    const thead = document.createElement('thead');
    let thHTML = '<tr><th>Task</th><th>Hours</th><th>OT</th>';
    if (hasTicket) thHTML += '<th>Ticket #</th>';
    if (hasDesc)   thHTML += '<th>Description</th>';
    thHTML += '<th>Copy</th></tr>';
    thead.innerHTML = thHTML;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');

      const tdTask  = document.createElement('td'); tdTask.textContent = row.task || '';
      const tdHours = document.createElement('td'); tdHours.style.fontFamily = 'var(--font-mono)'; tdHours.textContent = row.hours || 0;
      const tdOT    = document.createElement('td'); tdOT.textContent = row.ot || 'No';
      tr.appendChild(tdTask); tr.appendChild(tdHours); tr.appendChild(tdOT);

      if (hasTicket) {
        const tdTicket = document.createElement('td');
        tdTicket.style.fontFamily = 'var(--font-mono)';
        tdTicket.textContent = row.ticketNum || '';
        tr.appendChild(tdTicket);
      }

      if (hasDesc) {
        const tdDesc = document.createElement('td');
        if ((row.description || '').trim().length > 0) {
          const descBtn = document.createElement('button');
          descBtn.className = 'copy-task-btn';
          descBtn.textContent = '📝 View';
          descBtn.addEventListener('click', () => {
            activeDescTimerId = null;
            document.getElementById('descModalTextarea').value = row.description;
            document.getElementById('descModal').classList.remove('hidden');
          });
          tdDesc.appendChild(descBtn);
        }
        tr.appendChild(tdDesc);
      }

      const tdCopy = document.createElement('td');
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-task-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => copyTaskText(copyBtn, row.task || ''));
      tdCopy.appendChild(copyBtn);
      tr.appendChild(tdCopy);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    card.appendChild(header);
    card.appendChild(table);
    container.appendChild(card);
  });
}

function clearImportedFiles() {
  const container = document.getElementById('importedFiles');
  container.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">📂</span>
      <p>No files imported yet</p>
      <p class="empty-sub">Click "Import Files" to load CSV timesheets</p>
    </div>
  `;
  document.getElementById('clearImportBtn').classList.add('hidden');
}

function showImportedDesc(btn, text) {
  document.getElementById('descModalTextarea').value = text;
  document.getElementById('descModal').classList.remove('hidden');
  // read-only context — save on close won't write back since activeDescTimerId is null
  activeDescTimerId = null;
}

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuote && next === '"') {
        currentField += '"';
        i++; // Skip next quote
      } else {
        inQuote = !inQuote;
      }
    } else if (c === ',' && !inQuote) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((c === '\n' || c === '\r') && !inQuote) {
      if (c === '\r' && next === '\n') i++;
      currentRow.push(currentField);
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += c;
    }
  }
  // Flush remaining data
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  return rows.slice(1).map(cols => {
    const row = {};
    headers.forEach((h, i) => {
      const val = (cols[i] || '').trim().replace(/^"|"$/g, '');
      if      (h === 'task')                                               row.task        = val;
      else if (h === 'hours')                                              row.hours       = parseFloat(val) || 0;
      else if (h === 'overtime' || h === 'ot')                             row.ot          = val;
      else if (h === 'ticket #' || h === 'ticket number' || h === 'ticket') row.ticketNum  = val;
      else if (h === 'description' || h === 'desc')                        row.description = val;
    });
    return row;
  });
}

function copyTaskText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
  });
}

// ---- Hours Warning ----
function setupHoursWarning() {
  // check-hours-warning is now wired via listen() in setupEventListeners()
  setInterval(() => {
    if (currentDate === getTodayString()) checkHoursWarning();
  }, 60000);
}

function checkHoursWarning() {
  if (currentDate !== getTodayString()) return;
  const now = new Date();
  const [wh, wm]    = (settings.warningTime || '16:30').split(':').map(Number);
  const warningMins = wh * 60 + wm;
  const currentMins = now.getHours() * 60 + now.getMinutes();
  if (currentMins < warningMins) { hideBanner(); return; }
  const total    = updateTotals();
  const minHours = settings.minHoursWarning || 7.5;
  if (total < minHours) {
    showBanner(total, minHours);
    invoke('set_always_on_top', { value: true }).catch(() => {});
  } else {
    hideBanner();
    invoke('set_always_on_top', { value: false }).catch(() => {});
  }
}

function showBanner(current, required) {
  const banner  = document.getElementById('hoursWarningBanner');
  const reqText = banner.querySelector('.banner-text');
  if (reqText) {
    reqText.innerHTML = `You need to log at least <strong>${required}hrs</strong> before end of day — currently at <strong id="bannerCurrentHours">${current.toFixed(1)}</strong>h`;
  }
  banner.classList.remove('hidden');
  emit('warning-active').catch(() => {});
}

function hideBanner() {
  document.getElementById('hoursWarningBanner').classList.add('hidden');
  invoke('set_always_on_top', { value: false }).catch(() => {});
}

// ---- Keyboard shortcuts ----
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      addRow();
    }
    
    if (e.key === 'Escape') {
      const modal = document.getElementById('descModal');
      if (!modal.classList.contains('hidden')) {
        saveDescModal();
        modal.classList.add('hidden');
        activeDescTimerId = null;
      }
    }
  });
}

// ---- Toast ----
function showToast(msg, duration = 2500) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:9999;
      background:var(--bg-3);border:1px solid var(--border);
      border-radius:8px;padding:10px 16px;
      font-family:var(--font-mono);font-size:12px;color:var(--text);
      box-shadow:0 4px 20px rgba(0,0,0,0.4);
      transition:opacity 0.3s;opacity:0;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);