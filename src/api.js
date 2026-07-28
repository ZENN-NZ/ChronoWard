// ============================
// ChronoWard — api.js
// Tauri IPC Wrapper Layer
// ============================

const getTauri = () => window.__TAURI__ || { core: {}, event: {} };

export async function loadSettings() {
  const { invoke } = getTauri().core;
  return await invoke('load_settings');
}

export async function saveSettings(settings) {
  const { invoke } = getTauri().core;
  return await invoke('save_settings', { settings });
}

export async function loadSheets() {
  const { invoke } = getTauri().core;
  return await invoke('load_sheets');
}

export async function saveSheets(sheets) {
  const { invoke } = getTauri().core;
  return await invoke('save_sheets', { sheets });
}

export async function loadTimers() {
  const { invoke } = getTauri().core;
  return await invoke('load_timers');
}

export async function saveTimers(timers) {
  const { invoke } = getTauri().core;
  return await invoke('save_timers', { timers });
}

export async function exportCSVFile(filename, content) {
  const { invoke } = getTauri().core;
  return await invoke('export_csv', { filename, content });
}

export async function minimizeToTray() {
  const { invoke } = getTauri().core;
  return await invoke('minimize_to_tray').catch(() => {});
}

export async function setAlwaysOnTop(value) {
  const { invoke } = getTauri().core;
  return await invoke('set_always_on_top', { value }).catch(() => {});
}

export async function setWarningActive(active) {
  const { invoke } = getTauri().core;
  return await invoke('set_warning_active', { active }).catch(() => {});
}

export async function listenEvent(event, callback) {
  const { listen } = getTauri().event;
  if (listen) {
    return await listen(event, callback);
  }
}

export async function setupIPCListeners(store, onToast) {
  const { listen } = getTauri().event;
  if (!listen) return;

  await listen('check-hours-warning', () => {
    store.emit('check-hours-warning');
  });

  await listen('focus-time-trigger', (event) => {
    if (onToast) onToast(`⏰ Focus reminder: ${event.payload}`);
  });

  await listen('emergency-mode', (event) => {
    store.isEmergencyMode = true;
    store.emit('emergency-mode', event.payload);
  });

  await listen('hud-entry-added', async () => {
    const sheetsResult = await loadSheets();
    if (sheetsResult && sheetsResult.data) {
      store.sheets = sheetsResult.data;
      store.emit('hud-entry-added');
    }
    if (onToast) onToast('⚡ Quick log entry added');
  });
}
