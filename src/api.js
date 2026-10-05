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

  await listen('hud-entry-added', (event) => {
    store.emit('hud-entry-added', event.payload);
    if (onToast) onToast('⚡ Quick log entry added');
  });
}
