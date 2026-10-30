import { generateId, escHtml, sanitizeCsvCell, getTodayString, formatDate, getWeekMonday, dayAbbr, getWeekdayDates, parseTicketNum, validateHudPayload, evaluateMidnightRollover } from './utils.js';
import * as api from './api.js';
import { store } from './state.js';
import * as timersModule from './timers.js';
import { M3_THEMES, applyM3ThemeToDocument } from './m3-color.js';

const invoke = (cmd, args) => window.__TAURI__?.core?.invoke(cmd, args) ?? Promise.resolve();
const listen = (event, handler) => window.__TAURI__?.event?.listen(event, handler) ?? Promise.resolve(() => {});
const emit = (event, payload) => window.__TAURI__?.event?.emit(event, payload) ?? Promise.resolve();

// ---- State ----
let settings             = {};
let sheets               = {};
let timers               = {};
let currentDate          = '';
let projectMode          = false;
let detailedMode           = false;
let activeDescTimerId    = null;
let isCleanSlateMode     = false;    // Clean Slate Isolation Mode state

let rowCounter      = 0;
let dataChangeTimer = null;

const FALLBACK_THEMES = [
  { id: 'midnight', name: 'Midnight', seed: '#3b7cf5', isDark: true,  isOled: false, colors: ['#0e1225', '#b9c3ff', '#ffb4a4'] },
  { id: 'obsidian', name: 'Obsidian', seed: '#9d5cff', isDark: true,  isOled: false, colors: ['#0f0814', '#dab9ff', '#ffb68e'] },
  { id: 'aurora',   name: 'Aurora',   seed: '#00d4ff', isDark: true,  isOled: false, colors: ['#0c1518', '#3cd7ff', '#c0c3f0'] },
  { id: 'ember',    name: 'Ember',    seed: '#ff6630', isDark: true,  isOled: false, colors: ['#19120e', '#ffb59a', '#cbc99b'] },
  { id: 'forest',   name: 'Forest',   seed: '#44d980', isDark: true,  isOled: false, colors: ['#0e1510', '#4de086', '#88d2dc'] },
  { id: 'rose',     name: 'Rose',     seed: '#e066cc', isDark: true,  isOled: false, colors: ['#171216', '#ffabee', '#f4b8af'] },
  { id: 'steel',    name: 'Steel',    seed: '#8899cc', isDark: true,  isOled: false, colors: ['#121319', '#b3c5ff', '#ebb8d5'] },
  { id: 'void',     name: 'Void',     seed: '#a0a0a0', isDark: true,  isOled: true,  colors: ['#000000', '#c6c6c6', '#c6c6c6'] },
  { id: 'neon',     name: 'Neon',     seed: '#00ffcc', isDark: true,  isOled: false, colors: ['#0c1512', '#00e0b3', '#8dd0e8'] },
  { id: 'light',    name: 'Light',    seed: '#5b6af0', isDark: false, isOled: false, colors: ['#faf9ff', '#3551d2', '#824f61'] },
];
const THEMES = (typeof M3_THEMES !== 'undefined' && Array.isArray(M3_THEMES) && M3_THEMES.length) ? M3_THEMES : FALLBACK_THEMES;



// ---- Init ----
async function init() {
  try {
  // Wire up event listeners BEFORE loading data
  setupStaticListeners();
  setupEventListeners();

  const loadedSettings = await invoke('load_settings');
  store.settings = loadedSettings || {};
  settings = store.settings;
  const sheetsResult = await invoke('load_sheets');

  // Handle emergency mode (Decision 1c-ii)
  let pendingEmergencyInfo = null;
  if (sheetsResult.ok === false) {
    store.isEmergencyMode = true;
    pendingEmergencyInfo = sheetsResult;
    // Still load settings (they may be readable even in emergency mode)
    // and render a read-only view of whatever we have
    sheets = {};
    store.sheets = sheets;
  } else {
    sheets = sheetsResult.data || {};
    store.sheets = sheets;

    // Warn if corrupt data was quarantined
    if (sheetsResult.warning === 'CORRUPT_DATA_QUARANTINED') {
      showCorruptDataWarning(sheetsResult.quarantinedTo);
    }
  }

  const loadedTimers = await invoke('load_timers');
  store.timers = loadedTimers || {};
  timers = store.timers;

  currentDate = getTodayString();
  store.currentDate = currentDate;
  document.getElementById('selectedDate').value = currentDate;

  const installedAt = settings.installedAt || Date.now();
  if (!settings.installedAt) {
    settings.installedAt = installedAt;
    if (!store.isEmergencyMode) {
      store.settings = settings;
      invoke('save_settings', { settings }).catch(err => console.error(err));
    }
  }

  let activeTheme = settings.theme || 'midnight';
  if (settings.autoRotateTheme !== false) {
    const W = Math.floor((Date.now() - installedAt) / (1000 * 3600 * 24 * 7));
    const baseOffset = settings.themeBaseOffset || 0;
    activeTheme = THEMES[(baseOffset + W) % THEMES.length].id;
  }

  applyTheme(activeTheme, false);
  renderThemeGrid();
  applySettingsToUI();
  initPomodoroFromSettings();

  projectMode = settings.projectMode || false;
  store.projectMode = projectMode;
  document.getElementById('projectModeToggle').checked = projectMode;
  document.getElementById('settingProjectMode').checked = projectMode;
  applyProjectMode();

  detailedMode = settings.detailedMode || false;
  store.detailedMode = detailedMode;
  document.getElementById('detailedModeToggle').checked = detailedMode;
  document.getElementById('settingDetailedMode').checked = detailedMode;
  applyDetailedMode();

  loadSheetForDate(currentDate);
  if (pendingEmergencyInfo) {
    enterEmergencyMode(pendingEmergencyInfo);
  }
  restoreTimers();
  setupHoursWarning();
  renderWeeklyCompletion();
  setupKeyboardShortcuts();

  document.getElementById('selectedDate').addEventListener('change', (e) => {
    if (!e.target.value) {
      e.target.value = currentDate;
      return;
    }
    saveCurrentSheet();
    currentDate = e.target.value;
    store.currentDate = currentDate;
    loadSheetForDate(currentDate);
    renderWeeklyCompletion();
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

  // Midnight rollover detection
  let lastKnownToday = getTodayString();
  setInterval(() => {
    const realToday = getTodayString();
    const rollover = evaluateMidnightRollover(lastKnownToday, realToday, currentDate);
    if (rollover.dayChanged) {
      lastKnownToday = rollover.nextKnownToday;

      // Recalculate weekly theme rotation on day change
      if (settings.autoRotateTheme !== false) {
        const W = Math.floor((Date.now() - installedAt) / (1000 * 3600 * 24 * 7));
        const baseOffset = settings.themeBaseOffset || 0;
        const activeTheme = THEMES[(baseOffset + W) % THEMES.length].id;
        applyTheme(activeTheme, false);
        renderThemeGrid();
      }

      // If user was viewing the old "today", move them to the new today automatically
      if (rollover.shouldMoveCurrentDate && !store.isEmergencyMode) {
        saveCurrentSheet();
        currentDate = realToday;
        store.currentDate = currentDate;
        document.getElementById('selectedDate').value = currentDate;
        loadSheetForDate(currentDate);
        renderWeeklyCompletion();
      }
    }
  }, 60000);
  } catch (err) {
    console.error('Init failed:', err);
    document.body.innerHTML = `<div style="padding: 2rem; color: #ff5555; font-family: monospace;"><h2>Init Failed</h2><p>${escHtml(err.message || String(err))}</p></div>`;
  }
}

// ── Emergency mode UI ─────────────────────────────────────────────────────────

function enterEmergencyMode(info) {
  store.isEmergencyMode = true;
  const banner = document.getElementById('emergencyModeBanner');
  if (banner) {
    banner.classList.remove('hidden');
    const msgEl = banner.querySelector('.emergency-text');
    if (msgEl) {
      if (info.code === 'DECRYPT_FAILED') {
        msgEl.textContent = `Read-only mode: failed to decrypt your data. ` +
          `No data has been lost. Reason: ${info.reason || 'Unknown error'}`;
      } else {
        msgEl.textContent = info.encryptedDataExists
          ? `Read-only mode: your timesheet data is encrypted but the OS keychain is unavailable. ` +
            `No data has been lost. Contact your IT administrator to restore keychain access.`
          : `Read-only mode: the OS keychain is unavailable. ` +
            `Data cannot be saved until the keychain is restored.`;
      }
    }
  }

  // Disable all save-related UI
  document.querySelectorAll(
    '.btn-primary, .stepper-btn, .task-input, .hours-input, .ticket-input, .desc-btn, .ot-toggle, .timer-btn, .timer-stop-btn, .row-menu-btn, .row-checkbox, #selectAllCheck, #selectedDate, #cleanSlateBtn, #deleteSelectedBtn'
  ).forEach(el => {
    el.disabled = true;
    el.title = 'Read-only: keychain unavailable or data write-protected';
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
  
  const cleanSlateBtn = document.getElementById('cleanSlateBtn');
  if (cleanSlateBtn) cleanSlateBtn.addEventListener('click', () => toggleCleanSlateMode());
  const exitCleanSlateBtn = document.getElementById('exitCleanSlateBtn');
  if (exitCleanSlateBtn) exitCleanSlateBtn.addEventListener('click', () => toggleCleanSlateMode());
  
  document.getElementById('cleanSlateTaskSelect')?.addEventListener('change', () => onCleanSlateTaskSelectChange());
  document.getElementById('cleanSlateCustomInput')?.addEventListener('input', () => syncCleanSlateTaskEditToRow());
  document.getElementById('cleanSlateProjectSelect')?.addEventListener('change', () => syncCleanSlateTaskEditToRow());
  document.getElementById('cleanSlateStartPauseBtn')?.addEventListener('click', () => cleanSlateToggleTimer());
  document.getElementById('cleanSlateRingWrap')?.addEventListener('click', () => cleanSlateToggleTimer());
  document.getElementById('cleanSlateLogBtn')?.addEventListener('click', () => cleanSlateLogFocus());
  document.getElementById('pomoResetBtn')?.addEventListener('click', () => onPomodoroReset());
  document.getElementById('pomoSkipBtn')?.addEventListener('click', () => onPomodoroSkip());
  document.getElementById('pomoConfigToggleBtn')?.addEventListener('click', () => togglePomodoroConfigPanel());

  document.querySelectorAll('.pomo-phase-tab').forEach(tab => {
    tab.addEventListener('click', () => onPomodoroPhaseTabClick(tab.dataset.pomoPhase));
  });
  document.querySelectorAll('.pomo-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => applyPomodoroPreset(chip.dataset.pomoPreset));
  });
  ['pomoWorkMinsInput', 'pomoShortBreakMinsInput', 'pomoLongBreakMinsInput', 'pomoCyclesInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => onPomodoroConfigInputChanged());
  });
  ['pomoAutoStartBreaks', 'pomoAutoStartWork', 'pomoAutoLogWork', 'pomoSoundEnabled'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => onPomodoroConfigInputChanged());
  });

  // Project / Detailed mode toggles
  document.getElementById('projectModeToggle').addEventListener('change', () => toggleProjectMode());
  document.getElementById('detailedModeToggle').addEventListener('change', () => toggleDetailedMode());

  // Select all checkbox
  document.getElementById('selectAllCheck').addEventListener('change', (e) => toggleSelectAll(e.target));

  // Date Range Timesheet Viewer listeners
  document.getElementById('rangeFromDate')?.addEventListener('change', () => renderDateRangeTimesheets());
  document.getElementById('rangeToDate')?.addEventListener('change', () => renderDateRangeTimesheets());
  document.getElementById('rangeThisWeekBtn')?.addEventListener('click', () => setRangePreset('this-week'));
  document.getElementById('rangeThisMonthBtn')?.addEventListener('click', () => setRangePreset('this-month'));

  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => saveSettings());
  document.getElementById('settingProjectMode').addEventListener('change', () => syncProjectModeFromSettings());
  document.getElementById('settingDetailedMode').addEventListener('change', () => syncDetailedModeFromSettings());

  // M3 Dynamic Color controls
  const schemeModeEl = document.getElementById('settingSchemeMode');
  if (schemeModeEl) {
    schemeModeEl.addEventListener('change', (e) => {
      settings.schemeMode = e.target.value;
      applyTheme(currentActiveTheme, false);
    });
  }
  const customSeedToggleEl = document.getElementById('settingCustomSeedToggle');
  if (customSeedToggleEl) {
    customSeedToggleEl.addEventListener('change', (e) => {
      settings.customSeedEnabled = e.target.checked;
      applyTheme(currentActiveTheme, false);
    });
  }
  const customSeedColorEl = document.getElementById('settingCustomSeedColor');
  if (customSeedColorEl) {
    customSeedColorEl.addEventListener('input', (e) => {
      settings.customSeedColor = e.target.value;
      if (settings.customSeedEnabled) {
        applyTheme(currentActiveTheme, false);
      }
    });
  }

  // Description modal
  document.getElementById('descModal').addEventListener('click', (e) => closeDescModal(e));
  document.getElementById('descCopyBtn').addEventListener('click', () => copyDescription());
  document.getElementById('descCloseBtn').addEventListener('click', () => closeDescModal());
}

// ── Event listeners (centralized via api.js & store) ───────────────────────

async function setupEventListeners() {
  store.on('check-hours-warning', () => {
    checkHoursWarning();
  });

  store.on('emergency-mode', (payload) => {
    enterEmergencyMode(payload);
  });

  store.on('settings-changed', (newSettings) => {
    settings = newSettings || {};
  });

  store.on('timers-changed', (newTimers) => {
    timers = newTimers || {};
  });

  store.on('hud-entry-added', async (payload) => {
    if (store.isEmergencyMode) {
      emit('hud-entry-failed', { error: 'Read-only mode' });
      return;
    }

    const validation = validateHudPayload(payload);
    if (!validation.isValid) {
      emit('hud-entry-failed', { error: validation.error });
      return;
    }
    const safeRow = validation.safeRow;

    if (currentDate === payload.date) {
      addRow(safeRow);
      onDataChange();
      const ok = await saveCurrentSheet();
      if (ok) {
        emit('hud-entry-saved', { date: payload.date });
      } else {
        emit('hud-entry-failed', { error: lastSaveError || 'Failed to save timesheet' });
      }
    } else {
      if (!sheets[payload.date]) sheets[payload.date] = [];
      sheets[payload.date].push(safeRow);
      store.sheets = sheets;
      const ok = await flushSheetsToDisk();
      if (ok) {
        renderWeeklyCompletion();
        emit('hud-entry-saved', { date: payload.date });
      } else {
        emit('hud-entry-failed', { error: lastSaveError || 'Failed to save timesheet' });
      }
    }
  });

  await api.setupIPCListeners(store, showToast);
}

// ---- Weekly completion helpers ----

// Compute total hours for a given date from sheets data
function getDayHours(dateStr) {
  const rows = sheets[dateStr] || [];
  let total = 0;
  rows.forEach(r => {
    total += r.hours || 0;
  });
  return total;
}

// Render the weekly completion banner in the footer
function renderWeeklyCompletion() {
  const container = document.getElementById('weeklyDays');
  const wrapper   = document.getElementById('weeklyCompletion');
  if (!container || !wrapper) return;

  const minHours  = settings.minHoursWarning ?? 7.5;

  // Get all weekday dates for the week containing currentDate (Mon-Fri)
  const weekdayDates = getWeekdayDates(currentDate);

  // Build chips for all 5 weekday dates
  const chips = [];

  weekdayDates.forEach(dateStr => {
    // For the currently active date, read from the DOM directly so chips update as hours are typed.
    // For other dates in the week, read from sheets.
    let hours;
    if (dateStr === currentDate) {
      hours = 0;
      document.querySelectorAll('#timesheetBody tr').forEach(tr => {
        hours += parseFloat(tr.querySelector('.hours-input')?.value) || 0;
      });
    } else {
      hours = getDayHours(dateStr);
    }
    const isComplete = hours >= minHours;

    const abbr = dayAbbr(dateStr);
    // Only turn green (completed class) if complete/filled out.
    // Otherwise keep it neutral (no completed or incomplete class).
    const cls = isComplete ? 'completed' : '';
    const chip = document.createElement('span');
    chip.className = `weekly-day-chip ${cls}`.trim();
    chip.innerHTML = `<span>${abbr}</span><span class="chip-status"></span>`;
    chip.title = `${abbr} ${dateStr}: ${hours.toFixed(1)}h / ${minHours}h`;

    // Add active styling or visual cue if this chip represents the currently active/selected date
    if (dateStr === currentDate) {
      chip.style.borderColor = 'var(--accent)';
      chip.style.boxShadow = '0 0 6px var(--accent-glow)';
      chip.style.fontWeight = 'bold';
    }

    chips.push(chip);
  });

  container.innerHTML = '';
  chips.forEach(c => container.appendChild(c));

  // Show the wrapper
  wrapper.classList.remove('hidden');
}

// ---- Theme ----
let currentActiveTheme = 'midnight';

function applyTheme(themeId, shouldSave = true) {
  if (!THEMES.find(t => t.id === themeId)) return;
  currentActiveTheme = themeId;

  const customSeedEnabled = Boolean(settings.customSeedEnabled);
  const customSeedColor = settings.customSeedColor || '#6750a4';
  const schemeMode = settings.schemeMode || 'auto';

  const m3Options = {
    customSeed: customSeedEnabled ? customSeedColor : null,
    seed: customSeedEnabled ? customSeedColor : undefined,
    schemeMode: schemeMode,
  };
  if (schemeMode === 'dark') m3Options.isDark = true;
  if (schemeMode === 'light') m3Options.isDark = false;

  if (typeof applyM3ThemeToDocument === 'function') {
    applyM3ThemeToDocument(themeId, m3Options, document);
  } else {
    document.body.className = `theme-${themeId}`;
  }

  // Broadcast theme update to any secondary windows (like Quick Capture HUD)
  emit('theme-updated', {
    themeId,
    customSeedEnabled,
    customSeedColor,
    schemeMode,
  }).catch(() => {});

  if (shouldSave) {
    const installedAt = settings.installedAt || Date.now();
    const W = Math.floor((Date.now() - installedAt) / (1000 * 3600 * 24 * 7));
    const K = THEMES.findIndex(t => t.id === themeId);
    let baseOffset = (K - W) % THEMES.length;
    if (baseOffset < 0) baseOffset += THEMES.length;

    settings.theme = themeId;
    settings.themeBaseOffset = baseOffset;
    if (!store.isEmergencyMode) {
      store.settings = settings;
      invoke('save_settings', { settings }).catch(err => console.error('save_settings failed:', err));
    }
  }

  document.querySelectorAll('.theme-swatch').forEach(el => {
    const isActive = el.dataset.theme === themeId;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
}

function selectTheme(themeId) {
  if (settings.customSeedEnabled) {
    settings.customSeedEnabled = false;
    const customSeedToggleEl = document.getElementById('settingCustomSeedToggle');
    if (customSeedToggleEl) customSeedToggleEl.checked = false;
  }
  applyTheme(themeId, true);
}

function renderThemeGrid() {
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const activeId = currentActiveTheme || settings.theme || 'midnight';
  THEMES.forEach(theme => {
    const isActive = activeId === theme.id;
    const swatch = document.createElement('div');
    swatch.className = `theme-swatch${isActive ? ' active' : ''}`;
    swatch.dataset.theme = theme.id;
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-checked', isActive ? 'true' : 'false');
    swatch.setAttribute('aria-label', `${theme.name} theme`);
    swatch.setAttribute('tabindex', '0');
    swatch.addEventListener('click', () => selectTheme(theme.id));
    swatch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectTheme(theme.id);
      }
    });

    // Rich M3 3-tone HCT preview: Surface container base + Primary pill + Tertiary accent dot
    const preview = document.createElement('div');
    preview.className = 'swatch-preview';
    preview.style.cssText = `
      background: ${theme.colors[0]};
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: inset 0 1px 1px rgba(255,255,255,0.06);
    `;

    // Primary tonal pill
    const primaryPill = document.createElement('div');
    primaryPill.className = 'swatch-primary-pill';
    primaryPill.title = 'Primary Tonal Accent';
    primaryPill.style.cssText = `
      width: 20px;
      height: 12px;
      border-radius: 9999px;
      background: ${theme.colors[1]};
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    `;

    // Tertiary accent dot
    const tertiaryDot = document.createElement('div');
    tertiaryDot.className = 'swatch-tertiary-dot';
    tertiaryDot.title = 'Tertiary Accent Tone';
    tertiaryDot.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${theme.colors[2]};
      box-shadow: 0 1px 2px rgba(0,0,0,0.25);
    `;

    preview.appendChild(primaryPill);
    preview.appendChild(tertiaryDot);

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
  document.getElementById('settingIncrement').value       = settings.hourIncrement   || 0.5;
  document.getElementById('settingMinHours').value        = settings.minHoursWarning ?? 7.5;
  document.getElementById('settingWarningTime').value     = settings.warningTime     || '16:30';
  document.getElementById('settingAutoStart').checked     = settings.autoStart ?? true;
  document.getElementById('settingOverlayPosition').value = settings.overlayPosition || 'top-right';
  const autoRotateEl = document.getElementById('settingAutoRotateTheme');
  if (autoRotateEl) autoRotateEl.checked = settings.autoRotateTheme !== false;
  const ft = settings.focusTimes || ['11:00', '14:00', '16:00'];
  document.getElementById('focusTime1').value = ft[0] || '11:00';
  document.getElementById('focusTime2').value = ft[1] || '14:00';
  document.getElementById('focusTime3').value = ft[2] || '16:00';
  const schemeModeEl = document.getElementById('settingSchemeMode');
  if (schemeModeEl) schemeModeEl.value = settings.schemeMode || 'auto';
  const customSeedToggleEl = document.getElementById('settingCustomSeedToggle');
  if (customSeedToggleEl) customSeedToggleEl.checked = Boolean(settings.customSeedEnabled);
  const customSeedColorEl = document.getElementById('settingCustomSeedColor');
  if (customSeedColorEl) customSeedColorEl.value = settings.customSeedColor || '#6750a4';
}

async function saveSettings() {
  if (store.isEmergencyMode) { showToast('⚠ Read-only mode — settings cannot be saved'); return; }

  settings.theme           = settings.theme || 'midnight';
  settings.hourIncrement   = parseFloat(document.getElementById('settingIncrement').value)   || 0.5;
  const parsedMinHours     = parseFloat(document.getElementById('settingMinHours').value);
  settings.minHoursWarning = !isNaN(parsedMinHours) ? Math.min(24, Math.max(0, parsedMinHours)) : 7.5;
  settings.warningTime     = document.getElementById('settingWarningTime').value             || '16:30';
  settings.overlayPosition = document.getElementById('settingOverlayPosition').value         || 'top-right';
  const autoRotateEl = document.getElementById('settingAutoRotateTheme');
  if (autoRotateEl) settings.autoRotateTheme = autoRotateEl.checked;
  settings.focusTimes      = [
    document.getElementById('focusTime1').value || '11:00',
    document.getElementById('focusTime2').value || '14:00',
    document.getElementById('focusTime3').value || '16:00',
  ];
  settings.autoStart = document.getElementById('settingAutoStart').checked;
  const schemeModeEl = document.getElementById('settingSchemeMode');
  if (schemeModeEl) settings.schemeMode = schemeModeEl.value;
  const customSeedToggleEl = document.getElementById('settingCustomSeedToggle');
  if (customSeedToggleEl) settings.customSeedEnabled = customSeedToggleEl.checked;
  const customSeedColorEl = document.getElementById('settingCustomSeedColor');
  if (customSeedColorEl) settings.customSeedColor = customSeedColorEl.value;
  settings.projectMode = document.getElementById('settingProjectMode').checked;
  projectMode = settings.projectMode;
  document.getElementById('projectModeToggle').checked = projectMode;
  applyProjectMode();

  settings.detailedMode = document.getElementById('settingDetailedMode').checked;
  detailedMode = settings.detailedMode;
  document.getElementById('detailedModeToggle').checked = detailedMode;
  applyDetailedMode();

  store.settings = settings;
  try {
    await invoke('save_settings', { settings });
    applyTheme(settings.theme || currentActiveTheme, false);
    showToast('Settings saved ✓');
  } catch (err) {
    console.error('save_settings failed:', err);
    showToast(`⚠ Failed to save settings: ${err}`, 5000);
    return;
  }
  checkHoursWarning();
  renderWeeklyCompletion();
}

function syncProjectModeFromSettings() {
  projectMode = document.getElementById('settingProjectMode').checked;
  document.getElementById('projectModeToggle').checked = projectMode;
  applyProjectMode();
}

// ---- View switching ----
function switchView(viewId) {
  if (!['timesheet', 'timesheets-view', 'settings'].includes(viewId)) return;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
  document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
  if (viewId === 'settings') renderThemeGrid();
  if (viewId === 'timesheet') renderWeeklyCompletion();
  if (viewId === 'timesheets-view') initDateRangeViewer();
}

// ---- Project Mode ----
function toggleProjectMode() {
  projectMode = document.getElementById('projectModeToggle').checked;
  document.getElementById('settingProjectMode').checked = projectMode;
  settings.projectMode = projectMode;
  applyProjectMode();
  if (!store.isEmergencyMode) invoke('save_settings', { settings }).catch(err => console.error('save_settings failed:', err));
}

function applyProjectMode() {
  store.projectMode = projectMode;
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
  if (!store.isEmergencyMode) invoke('save_settings', { settings }).catch(err => console.error('save_settings failed:', err));
}

function applyDetailedMode() {
  store.detailedMode = detailedMode;
  document.getElementById('detailedColHeader').classList.toggle('hidden', !detailedMode);
  document.getElementById('descColHeader').classList.toggle('hidden', !detailedMode);
  document.querySelectorAll('.ticket-col-cell').forEach(c => c.classList.toggle('hidden', !detailedMode));
  document.querySelectorAll('.desc-col-cell').forEach(c => c.classList.toggle('hidden', !detailedMode));
  const tmToggle = document.getElementById('detailedModeSidebarToggle') || document.getElementById('detailedModeHeaderToggle');
  if (tmToggle) tmToggle.style.display = '';
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
  const textarea = document.getElementById('descModalTextarea');
  textarea.readOnly = false;
  textarea.value = desc;
  document.getElementById('descModal').classList.remove('hidden');
  setTimeout(() => textarea.focus(), 50);
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
  checkHoursWarning();
  restoreTimers();
}

let isSaving = false;
let savePending = false;
let pendingSaveWaiters = [];
let lastSaveError = null;

async function flushSheetsToDisk() {
  if (store.isEmergencyMode) {
    lastSaveError = 'Read-only mode';
    return false;
  }

  if (isSaving) {
    savePending = true;
    return new Promise(resolve => {
      pendingSaveWaiters.push(resolve);
    });
  }

  isSaving = true;
  let ok = false;
  try {
    do {
      savePending = false;
      await invoke('save_sheets', { sheets });
      ok = true;
      lastSaveError = null;
    } while (savePending && !store.isEmergencyMode);
  } catch (err) {
    ok = false;
    lastSaveError = typeof err === 'string' ? err : (err?.message || String(err));
    console.error('save_sheets failed:', err);
    showToast(`⚠ Save failed: ${lastSaveError}`, 5000);
    if (lastSaveError.includes('WRITE_BLOCKED_EMERGENCY_MODE')) {
      enterEmergencyMode({ encryptedDataExists: true });
    }
  } finally {
    isSaving = false;
    const waiters = pendingSaveWaiters.splice(0);
    waiters.forEach(resolve => resolve(ok));
  }
  return ok;
}

async function saveCurrentSheet() {
  if (store.isEmergencyMode) return false;
  sheets[currentDate] = collectRows();
  store.sheets = sheets;
  return await flushSheetsToDisk();
}

function collectRows() {
  const rows = [];
  document.querySelectorAll('#timesheetBody tr').forEach(tr => {
    let hours = parseFloat(tr.querySelector('.hours-input')?.value) || 0;
    hours = Math.max(0, Math.min(24, hours));
    
    const task = tr.querySelector('.task-input')?.value || '';
    const ticketNum = tr.querySelector('.ticket-input')?.value || '';
    const description = tr.querySelector('.desc-btn')?.dataset.desc || '';
    const timerId = tr.dataset.timerId;
    const hasActiveOrPausedTimer = Boolean(
      timerId && timers[timerId] && (timers[timerId].running || timers[timerId].elapsed > 0)
    );
    
    // Skip entirely blank rows unless a timer is active/paused on this row
    if (hours === 0 && !task.trim() && !ticketNum.trim() && !description.trim() && !hasActiveOrPausedTimer) {
      return;
    }
    
    rows.push({
      timerId,
      task,
      hours,
      ot:          tr.querySelector('.ot-toggle')?.classList.contains('active') || false,
      ticketNum,
      description,
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
  hoursInput.addEventListener('blur', () => {
    let clamped = parseFloat(hoursInput.value) || 0;
    clamped = Math.min(24, Math.max(0, clamped));
    hoursInput.value = clamped;
    onDataChange();
    saveCurrentSheet();
  });
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
  ticketInput.maxLength = 25;
  ticketInput.setAttribute('aria-label', 'Ticket number');
  const validateTicket = (input) => {
    const { isValid } = parseTicketNum(input.value);
    input.classList.toggle('ticket-invalid', !isValid);
  };
  validateTicket(ticketInput);
  ticketInput.addEventListener('input', () => {
    validateTicket(ticketInput);
    onDataChangeDebounced();
  });
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
  if (store.isEmergencyMode) {
    tr.querySelectorAll('input, button').forEach(el => {
      el.disabled = true;
      el.title = 'Read-only: keychain unavailable or data write-protected';
    });
  }
  return tr;
}



function onDataChangeDebounced() {
  clearTimeout(dataChangeTimer);
  dataChangeTimer = setTimeout(() => { updateTotals(); checkHoursWarning(); renderWeeklyCompletion(); }, 150);
}
function onDataChange() { updateTotals(); checkHoursWarning(); renderWeeklyCompletion(); }

function stepHours(timerId, dir) {
  const tr = document.querySelector(`[data-timer-id="${timerId}"]`)?.closest('tr');
  if (!tr) return;
  const input = tr.querySelector('.hours-input');
  const rawInc = parseFloat(settings.hourIncrement);
  const inc    = (!isNaN(rawInc) && rawInc > 0) ? rawInc : 0.5;
  let val      = parseFloat(input.value) || 0;
  val = Math.min(24, Math.max(0, Math.round((val + dir * inc) / inc) * inc));
  val = Math.round(val * 100) / 100;
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
    const hours = Math.round((parseFloat(tr.querySelector('.hours-input')?.value) || 0) * 100) / 100;
    const ot    = tr.querySelector('.ot-toggle')?.classList.contains('active');
    if (ot) overtime += hours;
    else    regular  += hours;
  });
  regular  = Math.round(regular * 100) / 100;
  overtime = Math.round(overtime * 100) / 100;
  const total = Math.round((regular + overtime) * 100) / 100;
  document.getElementById('regularHours').textContent      = regular.toFixed(1) + 'h';
  document.getElementById('overtimeHours').textContent     = overtime.toFixed(1) + 'h';
  document.getElementById('footerTotal').textContent       = total.toFixed(1) + 'h';
  const totalDisplay = document.getElementById('totalHoursDisplay');
  if (totalDisplay) totalDisplay.textContent = total.toFixed(1) + 'h';
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

// ---- Timers (decoupled via timers.js) ----
function toggleTimer(timerId) {
  timersModule.toggleTimer(timerId, store, updateCleanSlateView);
}

function stopTimer(timerId, silent = false) {
  timersModule.stopTimer(timerId, silent, store, { onDataChange, saveCurrentSheet });
}

function updateTimerDisplay(timerId) {
  timersModule.updateTimerDisplay(timerId, store, updateCleanSlateView);
}

let cleanSlateActiveTimerId = 'new';
let pomodoroState = timersModule.createPomodoroState();
let pomodoroIntervalId = null;

function getPomodoroConfigFromSettings() {
  return {
    workMinutes: settings.pomoWorkMinutes ?? 25,
    shortBreakMinutes: settings.pomoShortBreakMinutes ?? 5,
    longBreakMinutes: settings.pomoLongBreakMinutes ?? 15,
    sessionsBeforeLongBreak: settings.pomoSessionsBeforeLongBreak ?? 4,
    autoStartBreaks: settings.pomoAutoStartBreaks ?? false,
    autoStartWork: settings.pomoAutoStartWork ?? false,
    autoLogWork: settings.pomoAutoLogWork !== undefined ? settings.pomoAutoLogWork : true,
    soundEnabled: settings.pomoSoundEnabled !== undefined ? settings.pomoSoundEnabled : true,
  };
}

function initPomodoroFromSettings() {
  const cfg = getPomodoroConfigFromSettings();
  timersModule.updatePomodoroConfig(pomodoroState, cfg);
  syncPomodoroConfigInputsFromState();
  renderPomodoroUI();
}

function syncPomodoroConfigInputsFromState() {
  const cfg = pomodoroState.config;
  const workEl = document.getElementById('pomoWorkMinsInput');
  const shortEl = document.getElementById('pomoShortBreakMinsInput');
  const longEl = document.getElementById('pomoLongBreakMinsInput');
  const cyclesEl = document.getElementById('pomoCyclesInput');
  const autoBreaksEl = document.getElementById('pomoAutoStartBreaks');
  const autoWorkEl = document.getElementById('pomoAutoStartWork');
  const autoLogEl = document.getElementById('pomoAutoLogWork');
  const soundEl = document.getElementById('pomoSoundEnabled');

  if (workEl) workEl.value = cfg.workMinutes;
  if (shortEl) shortEl.value = cfg.shortBreakMinutes;
  if (longEl) longEl.value = cfg.longBreakMinutes;
  if (cyclesEl) cyclesEl.value = cfg.sessionsBeforeLongBreak;
  if (autoBreaksEl) autoBreaksEl.checked = cfg.autoStartBreaks;
  if (autoWorkEl) autoWorkEl.checked = cfg.autoStartWork;
  if (autoLogEl) autoLogEl.checked = cfg.autoLogWork;
  if (soundEl) soundEl.checked = cfg.soundEnabled;

  document.querySelectorAll('.pomo-preset-chip').forEach(chip => {
    const preset = timersModule.POMODORO_PRESETS[chip.dataset.pomoPreset];
    const isMatch = preset &&
      preset.workMinutes === cfg.workMinutes &&
      preset.shortBreakMinutes === cfg.shortBreakMinutes &&
      preset.longBreakMinutes === cfg.longBreakMinutes &&
      preset.sessionsBeforeLongBreak === cfg.sessionsBeforeLongBreak;
    chip.classList.toggle('active', Boolean(isMatch));
  });
}

function persistPomodoroConfigToSettings() {
  const cfg = pomodoroState.config;
  settings.pomoWorkMinutes = cfg.workMinutes;
  settings.pomoShortBreakMinutes = cfg.shortBreakMinutes;
  settings.pomoLongBreakMinutes = cfg.longBreakMinutes;
  settings.pomoSessionsBeforeLongBreak = cfg.sessionsBeforeLongBreak;
  settings.pomoAutoStartBreaks = cfg.autoStartBreaks;
  settings.pomoAutoStartWork = cfg.autoStartWork;
  settings.pomoAutoLogWork = cfg.autoLogWork;
  settings.pomoSoundEnabled = cfg.soundEnabled;

  if (!store.isEmergencyMode) {
    store.settings = settings;
    invoke('save_settings', { settings }).catch(err => console.error('save_settings failed:', err));
  }
}

function togglePomodoroConfigPanel() {
  const panel = document.getElementById('pomoConfigPanel');
  const btn = document.getElementById('pomoConfigToggleBtn');
  if (!panel) return;
  const isHidden = panel.classList.toggle('hidden');
  btn?.classList.toggle('active', !isHidden);
}

function applyPomodoroPreset(presetId) {
  const preset = timersModule.POMODORO_PRESETS[presetId];
  if (!preset) return;
  timersModule.updatePomodoroConfig(pomodoroState, {
    workMinutes: preset.workMinutes,
    shortBreakMinutes: preset.shortBreakMinutes,
    longBreakMinutes: preset.longBreakMinutes,
    sessionsBeforeLongBreak: preset.sessionsBeforeLongBreak,
  });
  syncPomodoroConfigInputsFromState();
  persistPomodoroConfigToSettings();
  renderPomodoroUI();
  showToast(`🍅 Applied ${preset.name} preset`);
}

function onPomodoroConfigInputChanged() {
  const newCfg = {
    workMinutes: parseInt(document.getElementById('pomoWorkMinsInput')?.value, 10) || 25,
    shortBreakMinutes: parseInt(document.getElementById('pomoShortBreakMinsInput')?.value, 10) || 5,
    longBreakMinutes: parseInt(document.getElementById('pomoLongBreakMinsInput')?.value, 10) || 15,
    sessionsBeforeLongBreak: parseInt(document.getElementById('pomoCyclesInput')?.value, 10) || 4,
    autoStartBreaks: Boolean(document.getElementById('pomoAutoStartBreaks')?.checked),
    autoStartWork: Boolean(document.getElementById('pomoAutoStartWork')?.checked),
    autoLogWork: Boolean(document.getElementById('pomoAutoLogWork')?.checked),
    soundEnabled: Boolean(document.getElementById('pomoSoundEnabled')?.checked),
  };
  timersModule.updatePomodoroConfig(pomodoroState, newCfg);
  syncPomodoroConfigInputsFromState();
  persistPomodoroConfigToSettings();
  renderPomodoroUI();
}

function playPomodoroChime(type = 'workComplete') {
  if (!pomodoroState.config.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = type === 'workComplete'
      ? [523.25, 659.25, 783.99, 1046.50] // C5 -> E5 -> G5 -> C6
      : [659.25, 880.00];                  // E5 -> A5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + i * 0.13 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.13 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.36);
    });
    setTimeout(() => {
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // Ignore if Web Audio API is unavailable
  }
}

function startPomodoroTicker() {
  if (pomodoroIntervalId) clearInterval(pomodoroIntervalId);
  pomodoroIntervalId = setInterval(() => tickPomodoro(), 250);
}

function stopPomodoroTicker() {
  if (pomodoroIntervalId) {
    clearInterval(pomodoroIntervalId);
    pomodoroIntervalId = null;
  }
}

function tickPomodoro() {
  const remaining = timersModule.getPomodoroRemainingSecs(pomodoroState, Date.now());
  if (remaining <= 0 && pomodoroState.running) {
    onPomodoroPhaseComplete();
    return;
  }
  renderPomodoroUI(remaining);
}

function onPomodoroPhaseComplete() {
  const result = timersModule.advancePomodoroPhase(pomodoroState, true, Date.now());
  playPomodoroChime(result.finishedPhase === 'work' ? 'workComplete' : 'breakComplete');

  if (result.finishedPhase === 'work') {
    let loggedHoursMsg = '';
    if (pomodoroState.config.autoLogWork && result.unloggedWorkSecs > 0 && !store.isEmergencyMode) {
      const loggedH = logPomodoroSecondsToSheet(result.unloggedWorkSecs, true);
      if (loggedH > 0) loggedHoursMsg = ` (+${loggedH}h logged to sheet)`;
    }
    const nextBreakLabel = result.nextPhase === 'longBreak'
      ? `${pomodoroState.config.longBreakMinutes}m Long Break`
      : `${pomodoroState.config.shortBreakMinutes}m Short Break`;
    showToast(`🍅 Focus session complete${loggedHoursMsg}! Next: ${nextBreakLabel}`, 4500);
  } else {
    showToast(`⚡ Break finished! Ready for Focus Session #${pomodoroState.currentSession}.`, 4000);
  }

  if (pomodoroState.running) {
    startPomodoroTicker();
  } else {
    stopPomodoroTicker();
  }
  renderPomodoroUI();
}

function toggleCleanSlateMode() {
  isCleanSlateMode = !isCleanSlateMode;
  store.isCleanSlateMode = isCleanSlateMode;
  const tableContainer = document.querySelector('.table-container');
  const tableFooter = document.querySelector('.table-footer');
  const weeklyCompletion = document.querySelector('.weekly-completion');
  const cleanSlateContainer = document.getElementById('cleanSlateContainer');
  const cleanSlateBtn = document.getElementById('cleanSlateBtn');

  if (isCleanSlateMode) {
    tableContainer?.classList.add('hidden');
    tableFooter?.classList.add('hidden');
    weeklyCompletion?.classList.add('hidden');
    cleanSlateContainer?.classList.remove('hidden');
    cleanSlateBtn?.classList.add('active');
    
    refreshCleanSlateTaskOptions();
    renderPomodoroUI();
  } else {
    tableContainer?.classList.remove('hidden');
    tableFooter?.classList.remove('hidden');
    weeklyCompletion?.classList.remove('hidden');
    cleanSlateContainer?.classList.add('hidden');
    cleanSlateBtn?.classList.remove('active');
    renderPomodoroUI();
  }
}

function refreshCleanSlateTaskOptions() {
  const select = document.getElementById('cleanSlateTaskSelect');
  if (!select) return;

  const previousSelected = cleanSlateActiveTimerId;
  select.innerHTML = '<option value="new">+ Focus on New Unentered Work</option>';
  
  const rows = Array.from(document.querySelectorAll('#timesheetBody tr'));
  let runningTimerId = null;
  let previousExists = false;

  rows.forEach((tr, index) => {
    const timerId = tr.dataset.timerId;
    const taskText = tr.querySelector('.task-input')?.value.trim();
    if (taskText || timerId === previousSelected) {
      const opt = document.createElement('option');
      opt.value = timerId;
      opt.textContent = `${index + 1}. ${taskText || 'Untitled Task'}`;
      select.appendChild(opt);
      if (timerId === previousSelected) previousExists = true;
    }
    if (timerId && timers[timerId]?.running) {
      runningTimerId = timerId;
    }
  });

  if (previousExists) {
    select.value = previousSelected;
    cleanSlateActiveTimerId = previousSelected;
  } else if (runningTimerId) {
    select.value = runningTimerId;
    cleanSlateActiveTimerId = runningTimerId;
  } else {
    select.value = 'new';
    cleanSlateActiveTimerId = 'new';
  }

  onCleanSlateTaskSelectChange();
}

function onCleanSlateTaskSelectChange() {
  const select = document.getElementById('cleanSlateTaskSelect');
  const customInput = document.getElementById('cleanSlateCustomInput');
  const projectSelect = document.getElementById('cleanSlateProjectSelect');
  const val = select?.value || 'new';

  cleanSlateActiveTimerId = val;

  if (val === 'new') {
    if (customInput && !pomodoroState.running) {
      customInput.placeholder = 'What are you focusing on right now?...';
    }
  } else {
    const tr = document.querySelector(`tr[data-timer-id="${val}"]`);
    if (tr) {
      const rawText = tr.querySelector('.task-input')?.value || '';
      const match = rawText.match(/^\[(.*?)\]\s*(.*)$/);
      if (match) {
        if (projectSelect) projectSelect.value = match[1] || 'General';
        if (customInput) customInput.value = match[2] || rawText;
      } else {
        if (customInput) customInput.value = rawText;
      }
    }
  }
  renderPomodoroUI();
}

function syncCleanSlateTaskEditToRow() {
  if (cleanSlateActiveTimerId === 'new') return;
  const tr = document.querySelector(`tr[data-timer-id="${cleanSlateActiveTimerId}"]`);
  if (!tr) return;
  const customInput = document.getElementById('cleanSlateCustomInput');
  const projectSelect = document.getElementById('cleanSlateProjectSelect');
  const taskDesc = customInput?.value.trim() || 'Focus Session';
  const proj = projectSelect?.value || 'General';
  const taskInput = tr.querySelector('.task-input');
  if (taskInput) {
    taskInput.value = `[${proj}] ${taskDesc}`;
    onDataChangeDebounced();
    saveCurrentSheet();
  }
}

function ensureActiveFocusTaskRow() {
  const select = document.getElementById('cleanSlateTaskSelect');
  const customInput = document.getElementById('cleanSlateCustomInput');
  const projectSelect = document.getElementById('cleanSlateProjectSelect');
  const val = select?.value || 'new';

  if (val !== 'new') {
    const existingTr = document.querySelector(`tr[data-timer-id="${val}"]`);
    if (existingTr) return existingTr;
  }

  const taskDesc = customInput?.value.trim() || 'Focus Session';
  const proj = projectSelect?.value || 'General';
  const formattedTask = `[${proj}] ${taskDesc}`;

  // Reuse a single empty row if today's sheet only has the default blank row
  const allRows = Array.from(document.querySelectorAll('#timesheetBody tr'));
  let targetTr = null;
  if (allRows.length === 1) {
    const firstTr = allRows[0];
    const firstTask = firstTr.querySelector('.task-input')?.value.trim() || '';
    const firstHours = parseFloat(firstTr.querySelector('.hours-input')?.value) || 0;
    if (!firstTask && firstHours === 0) {
      const input = firstTr.querySelector('.task-input');
      if (input) input.value = formattedTask;
      targetTr = firstTr;
    }
  }
  if (!targetTr) {
    targetTr = addRow({ task: formattedTask, hours: 0, ot: false });
  }

  const timerId = targetTr.dataset.timerId;
  cleanSlateActiveTimerId = timerId;
  onDataChange();
  saveCurrentSheet();
  refreshCleanSlateTaskOptions();
  return targetTr;
}

function cleanSlateToggleTimer() {
  if (store.isEmergencyMode) return;

  const wasRunning = pomodoroState.running;
  if (!wasRunning && pomodoroState.phase === 'work') {
    const select = document.getElementById('cleanSlateTaskSelect');
    if ((select?.value || 'new') === 'new') {
      ensureActiveFocusTaskRow();
    }
  }

  timersModule.startPausePomodoro(pomodoroState, Date.now());
  if (pomodoroState.running) {
    startPomodoroTicker();
    const phaseLabel = timersModule.POMODORO_PHASES[pomodoroState.phase]?.label || 'Focus';
    showToast(`▶ ${phaseLabel} timer running`);
  } else {
    stopPomodoroTicker();
    showToast(`⏸ Timer paused`);
  }
  renderPomodoroUI();
}

function onPomodoroReset() {
  timersModule.resetPomodoroPhase(pomodoroState);
  stopPomodoroTicker();
  renderPomodoroUI();
  showToast('↺ Pomodoro phase reset');
}

function onPomodoroSkip() {
  const result = timersModule.advancePomodoroPhase(pomodoroState, false, Date.now());
  stopPomodoroTicker();
  renderPomodoroUI();
  const nextLabel = timersModule.POMODORO_PHASES[result.nextPhase]?.label || 'Next Phase';
  showToast(`⏭ Skipped to ${nextLabel}`);
}

function onPomodoroPhaseTabClick(targetPhase) {
  if (!targetPhase || targetPhase === pomodoroState.phase) return;
  timersModule.switchPomodoroPhase(pomodoroState, targetPhase);
  stopPomodoroTicker();
  renderPomodoroUI();
}

function logPomodoroSecondsToSheet(focusSecs, isAuto = false) {
  if (store.isEmergencyMode) return 0;
  const secs = Math.max(0, Number(focusSecs) || 0);
  if (secs <= 0) return 0;

  const tr = ensureActiveFocusTaskRow();
  if (!tr) return 0;

  const roundedHours = timersModule.calculateRoundedHours(secs * 1000, settings.hourIncrement);
  const input = tr.querySelector('.hours-input');
  if (input) {
    const existing = parseFloat(input.value) || 0;
    const clamped = Math.min(24, Math.max(0, Math.round((existing + roundedHours) * 100) / 100));
    input.value = parseFloat(clamped.toFixed(2));
  }
  onDataChange();
  saveCurrentSheet();
  if (!isAuto) {
    const mins = Math.max(1, Math.round(secs / 60));
    showToast(`✓ Logged ${roundedHours}h (${mins}m focus) to sheet`);
  }
  return roundedHours;
}

function cleanSlateLogFocus() {
  if (store.isEmergencyMode) return;
  const now = Date.now();
  const unloggedSecs = timersModule.getPomodoroUnloggedWorkSecs(pomodoroState, now);

  if (pomodoroState.phase === 'work' && unloggedSecs > 0) {
    pomodoroState.loggedWorkSecsInPhase = (pomodoroState.loggedWorkSecsInPhase || 0) + unloggedSecs;
    pomodoroState.totalFocusSecsToday = (pomodoroState.totalFocusSecsToday || 0) + unloggedSecs;
    logPomodoroSecondsToSheet(unloggedSecs, false);
    renderPomodoroUI();
  } else {
    // Log one full configured Focus block if clicked before starting or during break
    const blockSecs = pomodoroState.config.workMinutes * 60;
    pomodoroState.totalFocusSecsToday = (pomodoroState.totalFocusSecsToday || 0) + blockSecs;
    logPomodoroSecondsToSheet(blockSecs, false);
    renderPomodoroUI();
  }
}

function renderPomodoroUI(overrideRemainingSecs = null) {
  const remaining = overrideRemainingSecs !== null
    ? overrideRemainingSecs
    : timersModule.getPomodoroRemainingSecs(pomodoroState, Date.now());
  const timeStr = timersModule.formatPomodoroTime(remaining);
  const cfg = pomodoroState.config;
  const phaseInfo = timersModule.POMODORO_PHASES[pomodoroState.phase] || timersModule.POMODORO_PHASES.work;

  // Card phase attribute for M3 phase-specific accent styling
  const pomoCard = document.getElementById('pomoCard');
  if (pomoCard) {
    pomoCard.setAttribute('data-pomo-phase', pomodoroState.phase);
    pomoCard.classList.toggle('is-running', pomodoroState.running);
  }

  // Header tag & cycle badge
  const phaseTag = document.getElementById('cleanSlatePhaseTag');
  if (phaseTag) phaseTag.textContent = phaseInfo.badge;

  const cycleBadge = document.getElementById('pomoCycleBadge');
  if (cycleBadge) {
    cycleBadge.textContent = `Session ${pomodoroState.currentSession} of ${cfg.sessionsBeforeLongBreak}`;
  }

  // Phase tabs
  const tabWorkMins = document.getElementById('pomoTabWorkMins');
  const tabShortMins = document.getElementById('pomoTabShortMins');
  const tabLongMins = document.getElementById('pomoTabLongMins');
  if (tabWorkMins) tabWorkMins.textContent = `${cfg.workMinutes}m`;
  if (tabShortMins) tabShortMins.textContent = `${cfg.shortBreakMinutes}m`;
  if (tabLongMins) tabLongMins.textContent = `${cfg.longBreakMinutes}m`;

  document.querySelectorAll('.pomo-phase-tab').forEach(tab => {
    const isActive = tab.dataset.pomoPhase === pomodoroState.phase;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Ring countdown text & sublabel
  const timerText = document.getElementById('cleanSlateTimerText');
  if (timerText) timerText.textContent = timeStr;

  const sublabel = document.getElementById('pomoPhaseSublabel');
  if (sublabel) {
    if (pomodoroState.running) {
      sublabel.textContent = pomodoroState.phase === 'work'
        ? `FOCUSING • #${pomodoroState.currentSession}`
        : phaseInfo.label.toUpperCase();
    } else if (remaining < pomodoroState.durationSecs && remaining > 0) {
      sublabel.textContent = 'PAUSED';
    } else {
      sublabel.textContent = pomodoroState.phase === 'work'
        ? 'READY TO FOCUS'
        : `READY • ${phaseInfo.label.toUpperCase()}`;
    }
  }

  // Expressive SVG Progress Ring
  updateSpatialRingOffset(remaining, pomodoroState.durationSecs);

  // Start / Pause button label
  const startBtn = document.getElementById('cleanSlateStartPauseBtn');
  if (startBtn) {
    if (pomodoroState.running) {
      startBtn.textContent = `⏸ Pause ${phaseInfo.label}`;
    } else if (remaining < pomodoroState.durationSecs && remaining > 0) {
      startBtn.textContent = `▶ Resume ${phaseInfo.label}`;
    } else {
      startBtn.textContent = `▶ Start ${phaseInfo.label}`;
    }
  }

  // Session dots
  const dotsContainer = document.getElementById('pomoSessionDots');
  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    for (let i = 1; i <= cfg.sessionsBeforeLongBreak; i++) {
      const dot = document.createElement('span');
      const isCompletedInCycle = i < pomodoroState.currentSession ||
        (i === pomodoroState.currentSession && pomodoroState.phase !== 'work');
      const isCurrent = i === pomodoroState.currentSession && pomodoroState.phase === 'work';
      dot.className = `pomo-session-dot${isCompletedInCycle ? ' completed' : ''}${isCurrent ? ' current' : ''}`;
      dot.title = `Session ${i} of ${cfg.sessionsBeforeLongBreak}`;
      dotsContainer.appendChild(dot);
    }
  }

  // Footer statistics
  const completedEl = document.getElementById('pomoCompletedCount');
  if (completedEl) completedEl.textContent = String(pomodoroState.completedSessions || 0);

  const totalFocusEl = document.getElementById('pomoTotalFocusTime');
  if (totalFocusEl) {
    const unlogged = timersModule.getPomodoroUnloggedWorkSecs(pomodoroState, Date.now());
    const totalMins = Math.floor(((pomodoroState.totalFocusSecsToday || 0) + unlogged) / 60);
    if (totalMins >= 60) {
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      totalFocusEl.textContent = m > 0 ? `${h}h ${m}m` : `${h}h`;
    } else {
      totalFocusEl.textContent = `${totalMins}m`;
    }
  }

  const nextPhaseEl = document.getElementById('pomoNextPhaseLabel');
  if (nextPhaseEl) {
    if (pomodoroState.phase === 'work') {
      const isLongNext = pomodoroState.currentSession >= cfg.sessionsBeforeLongBreak;
      nextPhaseEl.textContent = isLongNext
        ? `Next: ${cfg.longBreakMinutes}m Long Break`
        : `Next: ${cfg.shortBreakMinutes}m Short Break`;
    } else {
      nextPhaseEl.textContent = `Next: ${cfg.workMinutes}m Focus`;
    }
  }

  // Update sidebar Pomodoro button with live countdown when running or paused mid-phase
  const cleanSlateBtn = document.getElementById('cleanSlateBtn');
  if (cleanSlateBtn) {
    const icon = pomodoroState.phase === 'work' ? '🍅' : (pomodoroState.phase === 'shortBreak' ? '☕' : '🌿');
    if (pomodoroState.running || remaining < pomodoroState.durationSecs) {
      cleanSlateBtn.innerHTML = `<span>${icon} ${timeStr}</span>`;
    } else {
      cleanSlateBtn.innerHTML = `<span>🍅 Pomodoro</span>`;
    }
  }
}

function updateCleanSlateView(_timerId, _secs, _timeStr) {
  if (isCleanSlateMode) {
    renderPomodoroUI();
  }
}

function updateSpatialRingOffset(remainingSecs, durationSecs = pomodoroState.durationSecs) {
  const spatialRingProgress = document.getElementById('spatialRingProgress');
  if (spatialRingProgress) {
    const offset = timersModule.calculatePomodoroRingOffset(remainingSecs, durationSecs, 326.72);
    spatialRingProgress.style.strokeDashoffset = offset;
  }
}



function restoreTimers() {
  timersModule.restoreTimers(store, updateCleanSlateView);
}



async function exportCSV() {
  saveCurrentSheet();
  const rows    = collectRows();
  const [y, m, d] = currentDate.split('-');
  const dateStr = `${y}-${m}-${d}`;

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
    cols.push(sanitizeCsvCell(r.task));
    cols.push(r.hours);
    cols.push(r.ot ? 'Yes' : 'No');

    // Dynamically add ticket and description columns in the correct order
    if (hasTicket) {
      cols.push(sanitizeCsvCell(r.ticketNum));
    }
    if (hasDesc) {
      cols.push(sanitizeCsvCell(r.description));
    }
    lines.push(cols.join(','));
  });

  const contentWithBOM = '\uFEFF' + lines.join('\r\n');
  const result = await invoke('export_csv', {
    payload: { content: contentWithBOM, date: dateStr }
  });
  if (result.success) showToast(`Exported ✓`);
}

// ---- Date Range Timesheet Viewer ----
function initDateRangeViewer() {
  const fromEl = document.getElementById('rangeFromDate');
  const toEl = document.getElementById('rangeToDate');
  if (!fromEl || !toEl) return;

  const today = new Date();
  const monday = getMondayDate(today);
  const sunday = getSundayDate(today);

  if (!fromEl.value) fromEl.value = formatDateForInput(monday);
  if (!toEl.value) toEl.value = formatDateForInput(sunday);

  renderDateRangeTimesheets();
}

function getMondayDate(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function getSundayDate(d) {
  const monday = getMondayDate(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function formatDateForInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function setRangePreset(preset) {
  const fromEl = document.getElementById('rangeFromDate');
  const toEl = document.getElementById('rangeToDate');
  const today = new Date();

  if (preset === 'this-week') {
    fromEl.value = formatDateForInput(getMondayDate(today));
    toEl.value = formatDateForInput(getSundayDate(today));
  } else if (preset === 'this-month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    fromEl.value = formatDateForInput(firstDay);
    toEl.value = formatDateForInput(lastDay);
  }
  renderDateRangeTimesheets();
}

function renderDateRangeTimesheets() {
  const fromStr = document.getElementById('rangeFromDate')?.value;
  const toStr = document.getElementById('rangeToDate')?.value;
  const container = document.getElementById('rangeResultsContainer');
  if (!container) return;

  if (!fromStr || !toStr) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🗓️</span>
        <p>Select a date range to view timesheets</p>
      </div>`;
    return;
  }

  const fromDate = new Date(fromStr + 'T00:00:00');
  const toDate = new Date(toStr + 'T23:59:59');

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    container.innerHTML = `<div class="empty-state"><p>Invalid date range selected.</p></div>`;
    return;
  }

  if (fromDate > toDate) {
    container.innerHTML = `<div class="empty-state"><p>Start date must be on or before end date.</p></div>`;
    return;
  }

  // Prevent browser hangs on massive ranges
  if ((toDate - fromDate) / (1000 * 60 * 60 * 24) > 366) {
    container.innerHTML = `<div class="empty-state"><p>Date range too large. Maximum is 366 days.</p></div>`;
    return;
  }

  let totalHours = 0;
  let totalOT = 0;
  let daysCount = 0;
  const activeDays = [];

  // Iterate dates
  const curr = new Date(fromDate);
  while (curr <= toDate) {
    const dateStr = formatDateForInput(curr);
    const dayRows = (sheets[dateStr] || []).filter(r => (r.task || '').trim().length > 0 || r.hours > 0);
    if (dayRows.length > 0) {
      let dayReg = 0;
      let dayOT = 0;
      dayRows.forEach(r => {
        const h = parseFloat(r.hours) || 0;
        if (r.ot) dayOT += h;
        else dayReg += h;
      });
      totalHours += (dayReg + dayOT);
      totalOT += dayOT;
      daysCount++;
      activeDays.push({
        dateStr,
        dateObj: new Date(curr),
        rows: dayRows,
        regHours: dayReg,
        otHours: dayOT,
        totalHours: dayReg + dayOT
      });
    }
    curr.setDate(curr.getDate() + 1);
  }

  if (activeDays.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🗓️</span>
        <p>No timesheets logged between ${escHtml(fromStr)} and ${escHtml(toStr)}</p>
      </div>`;
    return;
  }

  let html = `
    <div class="range-summary-banner">
      <div class="range-summary-stat">
        <span class="range-stat-label">Days Logged</span>
        <span class="range-stat-val">${daysCount} days</span>
      </div>
      <div class="range-summary-stat">
        <span class="range-stat-label">Regular Hours</span>
        <span class="range-stat-val">${(totalHours - totalOT).toFixed(1)}h</span>
      </div>
      <div class="range-summary-stat">
        <span class="range-stat-label">Overtime Hours</span>
        <span class="range-stat-val" style="color:var(--ot);">${totalOT.toFixed(1)}h</span>
      </div>
      <div class="range-summary-stat">
        <span class="range-stat-label">Total Range Hours</span>
        <span class="range-stat-val">${totalHours.toFixed(1)}h</span>
      </div>
    </div>`;

  activeDays.forEach(day => {
    const dayName = day.dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    html += `
      <div class="range-day-card">
        <div class="range-day-header">
          <div class="range-day-title">
            <span>📅 ${dayName}</span>
          </div>
          <div class="range-day-badges">
            <span class="range-badge total">${day.totalHours.toFixed(1)}h Total</span>
            ${day.otHours > 0 ? `<span class="range-badge ot">${day.otHours.toFixed(1)}h OT</span>` : ''}
            <button class="btn-secondary jump-to-date-btn" data-date="${day.dateStr}" style="padding: 3px 8px; font-size: 11px; margin-left: 6px;">
              Edit Date ↵
            </button>
          </div>
        </div>

        <table class="range-day-table">
          <thead>
            <tr>
              <th>Task</th>
              <th style="width:70px;">Hours</th>
              <th style="width:50px;">OT</th>
              <th style="width:100px;">Ticket #</th>
              <th style="width:90px;text-align:center;">Description</th>
              <th style="width:65px;text-align:center;">Action</th>
            </tr>
          </thead>
          <tbody>`;

    day.rows.forEach(r => {
      const hasDesc = (r.description || '').trim().length > 0;
      html += `
        <tr>
          <td style="font-weight:500;">${escHtml(r.task || '')}</td>
          <td style="font-family:var(--font-mono);">${Number(r.hours || 0)}</td>
          <td>${r.ot ? '<span style="color:var(--ot);font-weight:600;">Yes</span>' : 'No'}</td>
          <td style="font-family:var(--font-mono);">${escHtml(r.ticketNum || '')}</td>
          <td style="text-align:center;">
            ${hasDesc ? `<button class="desc-btn has-desc open-range-desc-btn" data-desc="${escHtml(r.description)}" title="View Description" style="margin: 0 auto;">📝</button>` : '<span style="color:var(--text-3); font-size:11px;">—</span>'}
          </td>
          <td style="text-align:center;">
            <button class="btn-secondary range-copy-task-btn" data-task="${escHtml(r.task || '')}" style="padding: 3px 8px; font-size: 11px;">Copy</button>
          </td>
        </tr>`;
    });

    html += `
          </tbody>
        </table>
      </div>`;
  });

  container.innerHTML = html;

  // Bind Jump to Date buttons
  container.querySelectorAll('.jump-to-date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      currentDate = date;
      store.currentDate = currentDate;
      document.getElementById('selectedDate').value = date;
      loadSheetForDate(date);
      switchView('timesheet');
    });
  });

  // Bind Description View buttons
  container.querySelectorAll('.open-range-desc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDescTimerId = null;
      const textarea = document.getElementById('descModalTextarea');
      textarea.readOnly = true;
      textarea.value = btn.dataset.desc || '';
      document.getElementById('descModal').classList.remove('hidden');
      setTimeout(() => textarea.focus(), 50);
    });
  });

  // Bind Copy Task buttons
  container.querySelectorAll('.range-copy-task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskText = btn.dataset.task || '';
      navigator.clipboard.writeText(taskText).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  });
}

// ---- Hours Warning ----
let isWarningBannerActive = false;

function setupHoursWarning() {
  // check-hours-warning is wired via listen() in setupEventListeners() from the Rust scheduler.
  // Duplicate interval removed.
}

function checkHoursWarning() {
  if (currentDate !== getTodayString()) {
    hideBanner(); // M3: hide banner when leaving today
    return;
  }
  const now = new Date();
  const [wh, wm]    = (settings.warningTime || '16:30').split(':').map(Number);
  const warningMins = wh * 60 + wm;
  const currentMins = now.getHours() * 60 + now.getMinutes();
  if (currentMins < warningMins) { hideBanner(); return; }
  const total    = updateTotals();
  const minHours = settings.minHoursWarning ?? 7.5;
  if (total < minHours) {
    showBanner(total, minHours);
  } else {
    hideBanner();
  }
}

function showBanner(current, required) {
  const banner  = document.getElementById('hoursWarningBanner');
  const reqText = banner.querySelector('.banner-text');
  if (reqText) {
    reqText.innerHTML = `Daily tracking status: <strong id="bannerCurrentHours">${current.toFixed(1)}</strong>h logged towards <strong id="bannerTargetHours">${required}</strong>h target`;
  }
  banner.classList.remove('hidden');
  
  if (!isWarningBannerActive) {
    isWarningBannerActive = true;
    invoke('set_warning_active', { active: true }).catch(() => {});
    emit('warning-active').catch(() => {});
  }
}

function hideBanner() {
  document.getElementById('hoursWarningBanner').classList.add('hidden');
  if (isWarningBannerActive) {
    isWarningBannerActive = false;
    invoke('set_warning_active', { active: false }).catch(() => {});
  }
  invoke('set_always_on_top', { value: false }).catch(() => {});
}

// ---- Keyboard shortcuts & Modal ----
function toggleShortcutsModal(show) {
  const modal = document.getElementById('shortcutsModal');
  if (!modal) return;
  const isHidden = modal.classList.contains('hidden');
  const shouldShow = typeof show === 'boolean' ? show : isHidden;
  modal.classList.toggle('hidden', !shouldShow);
  if (shouldShow) {
    const closeBtn = document.getElementById('shortcutsCloseBtn');
    if (closeBtn) closeBtn.focus();
  }
}

function shiftSelectedDate(days) {
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  saveCurrentSheet();
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  currentDate = formatDate(d);
  store.currentDate = currentDate;
  document.getElementById('selectedDate').value = currentDate;
  loadSheetForDate(currentDate);
  renderWeeklyCompletion();
}

function jumpToToday() {
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  saveCurrentSheet();
  currentDate = getTodayString();
  store.currentDate = currentDate;
  document.getElementById('selectedDate').value = currentDate;
  loadSheetForDate(currentDate);
  renderWeeklyCompletion();
}

function setupKeyboardShortcuts() {
  const shortcutsBtn = document.getElementById('shortcutsBtn');
  if (shortcutsBtn) {
    shortcutsBtn.addEventListener('click', () => toggleShortcutsModal(true));
  }
  const shortcutsCloseBtn = document.getElementById('shortcutsCloseBtn');
  if (shortcutsCloseBtn) {
    shortcutsCloseBtn.addEventListener('click', () => toggleShortcutsModal(false));
  }
  const shortcutsModal = document.getElementById('shortcutsModal');
  if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) toggleShortcutsModal(false);
    });
  }

  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const isCtrl = e.ctrlKey || e.metaKey;

    // Escape -> Close Modals (takes priority before input check)
    if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
      const shortcutsModal = document.getElementById('shortcutsModal');
      if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        toggleShortcutsModal(false);
        return;
      }
      const descModal = document.getElementById('descModal');
      if (descModal && !descModal.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        saveDescModal();
        descModal.classList.add('hidden');
        activeDescTimerId = null;
        return;
      }
    }

    // ? -> Open Shortcuts Modal (when not typing in input)
    if (e.key === '?' && !isInput && !isCtrl && !e.altKey) {
      e.preventDefault();
      toggleShortcutsModal();
      return;
    }

    // Ctrl + 1 / 2 / 3 -> Switch Views
    if (isCtrl && !e.shiftKey && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      const views = ['timesheet', 'timesheets-view', 'settings'];
      switchView(views[parseInt(e.key) - 1]);
      return;
    }

    // Ctrl + N -> Add Row
    if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (document.getElementById('view-timesheet').classList.contains('active')) {
        addRow();
      }
      return;
    }

    // Ctrl + E -> Export CSV
    if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      exportCSV();
      return;
    }

    // Ctrl + S -> Force Save Sheet
    if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (store.isEmergencyMode) {
        showToast('⚠ Read-only mode — timesheet cannot be saved');
        return;
      }
      saveCurrentSheet().then(ok => {
        if (ok) showToast('Timesheet saved to disk');
      });
      return;
    }

    // Ctrl + Shift + D -> Toggle Detailed Mode
    if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const toggle = document.getElementById('detailedModeToggle');
      if (toggle) toggle.click();
      return;
    }

    // Ctrl + Shift + P -> Toggle Project Mode
    if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      const toggle = document.getElementById('projectModeToggle');
      if (toggle) toggle.click();
      return;
    }

    // Alt + Left / Right / T -> Date Navigation
    if (e.altKey && !isCtrl) {
      if (e.key === 'ArrowLeft' || e.key === 'Left' || e.code === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        shiftSelectedDate(-1);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'Right' || e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        shiftSelectedDate(1);
        return;
      }
      if (e.key.toLowerCase() === 't' || e.code === 'KeyT') {
        e.preventDefault();
        e.stopPropagation();
        jumpToToday();
        return;
      }
    }
  });
}

// ---- Toast (M3 Snackbar) ----
function showToast(msg, duration = 2500) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      background: var(--md-sys-color-inverse-surface, var(--bg-3));
      color: var(--md-sys-color-inverse-on-surface, var(--text));
      border: 1px solid var(--md-sys-color-outline-variant, rgba(255, 255, 255, 0.12));
      border-radius: 12px;
      padding: 12px 18px;
      font-family: var(--font-sans, system-ui, sans-serif);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.015em;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.32);
      transition: opacity 0.25s cubic-bezier(0.05, 0.7, 0.1, 1.0), transform 0.25s cubic-bezier(0.05, 0.7, 0.1, 1.0);
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, duration);
}

// ---- Start ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
