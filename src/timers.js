// ============================
// ChronoWard — timers.js
// Decoupled Timer Management Loop
// ============================

import { saveTimers } from './api.js';

export const activeTimerIntervals = {};

export function updateTimerBtnState(timerId, running) {
  const btn = document.querySelector(`.timer-btn[data-timer-id="${timerId}"]`);
  if (!btn) return;
  btn.classList.toggle('running', running);
  btn.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
}

export function updateTimerDisplay(timerId, store, updateCleanSlateView) {
  const timers = store.timers;
  const t = timers[timerId];
  if (!t) return;
  let elapsed = t.elapsed || 0;
  if (t.running && t.startedAt) elapsed += Date.now() - t.startedAt;
  const secs = Math.floor(elapsed / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const display = document.getElementById(`timer-display-${timerId}`);
  if (display) {
    display.textContent = timeStr;
  }
  if (updateCleanSlateView) {
    updateCleanSlateView(timerId, secs, timeStr);
  }
}

export function clearTimerInterval(timerId) {
  if (activeTimerIntervals[timerId]) {
    clearInterval(activeTimerIntervals[timerId]);
    delete activeTimerIntervals[timerId];
  }
}

export function toggleTimer(timerId, store, updateCleanSlateView) {
  const timers = store.timers;
  if (!timers[timerId]) {
    timers[timerId] = { elapsed: 0, running: false, startedAt: null };
  }
  const t = timers[timerId];
  if (t.running) {
    t.elapsed += Date.now() - t.startedAt;
    t.running = false;
    t.startedAt = null;
    clearTimerInterval(timerId);
    updateTimerBtnState(timerId, false);
    const stopBtn = document.getElementById(`timer-stop-${timerId}`);
    if (stopBtn) stopBtn.classList.remove('hidden');
  } else {
    t.running = true;
    t.startedAt = Date.now();
    if (!activeTimerIntervals[timerId]) {
      activeTimerIntervals[timerId] = setInterval(() => updateTimerDisplay(timerId, store, updateCleanSlateView), 1000);
    }
    updateTimerBtnState(timerId, true);
    const stopBtn = document.getElementById(`timer-stop-${timerId}`);
    if (stopBtn) stopBtn.classList.add('hidden');
  }
  store.timers = timers;
  if (!store.isEmergencyMode) {
    saveTimers(timers).catch(console.error);
  }
}

export function stopTimer(timerId, silent, store, callbacks = {}) {
  clearTimerInterval(timerId);

  const timers = store.timers;
  const t = timers[timerId];
  if (!t) return;
  if (t.running) {
    t.elapsed += Date.now() - t.startedAt;
    t.running = false;
    t.startedAt = null;
  }
  if (!silent) {
    const totalHoursRaw = t.elapsed / 1000 / 3600;
    const rawInc = parseFloat(store.settings?.hourIncrement);
    const inc = (!isNaN(rawInc) && rawInc > 0) ? rawInc : 0.5;
    const roundedHours = Math.round((Math.ceil(totalHoursRaw / inc) * inc) * 100) / 100;
    const tr = document.querySelector(`[data-timer-id="${timerId}"]`)?.closest('tr');
    if (tr) {
      const input = tr.querySelector('.hours-input');
      const existing = parseFloat(input.value) || 0;
      input.value = parseFloat((existing + roundedHours).toFixed(3));
    }
  }
  delete timers[timerId];
  store.timers = timers;
  if (!store.isEmergencyMode) {
    saveTimers(timers).catch(console.error);
  }
  const display = document.getElementById(`timer-display-${timerId}`);
  if (display) display.textContent = '00:00:00';
  const stopBtn = document.getElementById(`timer-stop-${timerId}`);
  if (stopBtn) stopBtn.classList.add('hidden');
  updateTimerBtnState(timerId, false);

  if (!silent) {
    if (callbacks.onDataChange) callbacks.onDataChange();
    if (callbacks.saveCurrentSheet) callbacks.saveCurrentSheet();
  }
}

export function restoreTimers(store, updateCleanSlateView) {
  const timers = store.timers;
  Object.entries(timers).forEach(([timerId, t]) => {
    if (t.running) {
      if (!activeTimerIntervals[timerId]) {
        activeTimerIntervals[timerId] = setInterval(() => updateTimerDisplay(timerId, store, updateCleanSlateView), 1000);
      }
      updateTimerBtnState(timerId, true);
      const stopBtn = document.getElementById(`timer-stop-${timerId}`);
      if (stopBtn) stopBtn.classList.add('hidden');
    } else if (t.elapsed > 0) {
      updateTimerDisplay(timerId, store, updateCleanSlateView);
      const stopBtn = document.getElementById(`timer-stop-${timerId}`);
      if (stopBtn) stopBtn.classList.remove('hidden');
    }
  });
}
