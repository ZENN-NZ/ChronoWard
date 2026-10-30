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

export function calculateRoundedHours(elapsedMs, increment) {
  const totalHoursRaw = elapsedMs / 1000 / 3600;
  const rawInc = parseFloat(increment);
  const inc = (!isNaN(rawInc) && rawInc > 0) ? rawInc : 0.5;
  return Math.round((Math.ceil(totalHoursRaw / inc) * inc) * 100) / 100;
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
    const roundedHours = calculateRoundedHours(t.elapsed, store.settings?.hourIncrement);
    const tr = document.querySelector(`[data-timer-id="${timerId}"]`)?.closest('tr');
    if (tr) {
      const input = tr.querySelector('.hours-input');
      const existing = parseFloat(input.value) || 0;
      const clamped = Math.min(24, Math.max(0, existing + roundedHours));
      input.value = parseFloat(clamped.toFixed(3));
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

// ============================================================================
// Pomodoro Focus Timer State Machine (Pure + Testable)
// ============================================================================

export const POMODORO_PHASES = {
  work: { id: 'work', label: 'Focus', badge: '🍅 FOCUS SESSION', defaultMinutes: 25 },
  shortBreak: { id: 'shortBreak', label: 'Short Break', badge: '☕ SHORT BREAK', defaultMinutes: 5 },
  longBreak: { id: 'longBreak', label: 'Long Break', badge: '🌿 LONG BREAK', defaultMinutes: 15 },
};

export const POMODORO_PRESETS = {
  classic: {
    id: 'classic',
    name: 'Classic (25/5/15)',
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
  },
  deep: {
    id: 'deep',
    name: 'Deep Work (50/10/25)',
    workMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 25,
    sessionsBeforeLongBreak: 3,
  },
  sprint: {
    id: 'sprint',
    name: 'ADHD Sprint (15/3/10)',
    workMinutes: 15,
    shortBreakMinutes: 3,
    longBreakMinutes: 10,
    sessionsBeforeLongBreak: 4,
  },
};

function clampInt(val, min, max, fallback) {
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizePomodoroConfig(raw = {}) {
  return {
    workMinutes: clampInt(raw.workMinutes, 1, 180, 25),
    shortBreakMinutes: clampInt(raw.shortBreakMinutes, 1, 60, 5),
    longBreakMinutes: clampInt(raw.longBreakMinutes, 1, 90, 15),
    sessionsBeforeLongBreak: clampInt(raw.sessionsBeforeLongBreak, 1, 12, 4),
    autoStartBreaks: Boolean(raw.autoStartBreaks ?? false),
    autoStartWork: Boolean(raw.autoStartWork ?? false),
    autoLogWork: raw.autoLogWork !== undefined ? Boolean(raw.autoLogWork) : true,
    soundEnabled: raw.soundEnabled !== undefined ? Boolean(raw.soundEnabled) : true,
  };
}

export function getPhaseDurationSecs(phase, config = {}) {
  const cfg = normalizePomodoroConfig(config);
  if (phase === 'shortBreak') return cfg.shortBreakMinutes * 60;
  if (phase === 'longBreak') return cfg.longBreakMinutes * 60;
  return cfg.workMinutes * 60;
}

export function createPomodoroState(config = {}) {
  const cfg = normalizePomodoroConfig(config);
  const durationSecs = getPhaseDurationSecs('work', cfg);
  return {
    phase: 'work',
    running: false,
    durationSecs,
    remainingSecs: durationSecs,
    remainingAtStart: durationSecs,
    startedAt: null,
    loggedWorkSecsInPhase: 0,
    currentSession: 1,
    completedSessions: 0,
    totalFocusSecsToday: 0,
    config: cfg,
  };
}

export function getPomodoroRemainingSecs(pomo, now = Date.now()) {
  if (!pomo) return 0;
  if (pomo.running && typeof pomo.startedAt === 'number') {
    const elapsedSinceStart = Math.max(0, Math.floor((now - pomo.startedAt) / 1000));
    const baseRemaining = pomo.remainingAtStart ?? pomo.remainingSecs ?? pomo.durationSecs ?? 0;
    return Math.max(0, baseRemaining - elapsedSinceStart);
  }
  return Math.max(0, Math.floor(pomo.remainingSecs ?? 0));
}

export function getPomodoroUnloggedWorkSecs(pomo, now = Date.now()) {
  if (!pomo || pomo.phase !== 'work') return 0;
  const remaining = getPomodoroRemainingSecs(pomo, now);
  const elapsedInPhase = Math.max(0, (pomo.durationSecs || 0) - remaining);
  return Math.max(0, elapsedInPhase - (pomo.loggedWorkSecsInPhase || 0));
}

export function formatPomodoroTime(totalSecs) {
  const secs = Math.max(0, Math.floor(Number(totalSecs) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function calculatePomodoroRingOffset(remainingSecs, durationSecs, circumference = 326.72) {
  const total = Number(durationSecs) || 0;
  const rem = Math.max(0, Math.min(total, Number(remainingSecs) || 0));
  if (total <= 0) return circumference;
  const progress = (total - rem) / total;
  return Math.round(circumference * (1 - progress) * 100) / 100;
}

export function startPausePomodoro(pomo, now = Date.now()) {
  if (!pomo) return createPomodoroState();
  if (pomo.running) {
    pomo.remainingSecs = getPomodoroRemainingSecs(pomo, now);
    pomo.remainingAtStart = pomo.remainingSecs;
    pomo.running = false;
    pomo.startedAt = null;
  } else {
    if (pomo.remainingSecs <= 0) {
      pomo.durationSecs = getPhaseDurationSecs(pomo.phase, pomo.config);
      pomo.remainingSecs = pomo.durationSecs;
      pomo.loggedWorkSecsInPhase = 0;
    }
    pomo.remainingAtStart = pomo.remainingSecs;
    pomo.startedAt = now;
    pomo.running = true;
  }
  return pomo;
}

export function resetPomodoroPhase(pomo) {
  if (!pomo) return createPomodoroState();
  const durationSecs = getPhaseDurationSecs(pomo.phase, pomo.config);
  pomo.running = false;
  pomo.startedAt = null;
  pomo.durationSecs = durationSecs;
  pomo.remainingSecs = durationSecs;
  pomo.remainingAtStart = durationSecs;
  pomo.loggedWorkSecsInPhase = 0;
  return pomo;
}

export function switchPomodoroPhase(pomo, targetPhase) {
  if (!pomo) return createPomodoroState();
  const validPhase = POMODORO_PHASES[targetPhase] ? targetPhase : 'work';
  const durationSecs = getPhaseDurationSecs(validPhase, pomo.config);
  pomo.phase = validPhase;
  pomo.running = false;
  pomo.startedAt = null;
  pomo.durationSecs = durationSecs;
  pomo.remainingSecs = durationSecs;
  pomo.remainingAtStart = durationSecs;
  pomo.loggedWorkSecsInPhase = 0;
  return pomo;
}

export function advancePomodoroPhase(pomo, completed = true, now = Date.now()) {
  if (!pomo) pomo = createPomodoroState();
  const finishedPhase = pomo.phase;
  let unloggedWorkSecs = 0;

  if (finishedPhase === 'work') {
    if (completed) {
      unloggedWorkSecs = Math.max(0, pomo.durationSecs - (pomo.loggedWorkSecsInPhase || 0));
      pomo.completedSessions = (pomo.completedSessions || 0) + 1;
      pomo.totalFocusSecsToday = (pomo.totalFocusSecsToday || 0) + unloggedWorkSecs;
    } else {
      unloggedWorkSecs = getPomodoroUnloggedWorkSecs(pomo, now);
    }

    const isLongBreak = pomo.currentSession >= pomo.config.sessionsBeforeLongBreak;
    const nextPhase = isLongBreak ? 'longBreak' : 'shortBreak';
    const nextDuration = getPhaseDurationSecs(nextPhase, pomo.config);

    pomo.phase = nextPhase;
    pomo.durationSecs = nextDuration;
    pomo.remainingSecs = nextDuration;
    pomo.remainingAtStart = nextDuration;
    pomo.loggedWorkSecsInPhase = 0;

    if (completed && pomo.config.autoStartBreaks) {
      pomo.running = true;
      pomo.startedAt = now;
    } else {
      pomo.running = false;
      pomo.startedAt = null;
    }
  } else {
    if (finishedPhase === 'longBreak' || pomo.currentSession >= pomo.config.sessionsBeforeLongBreak) {
      pomo.currentSession = 1;
    } else {
      pomo.currentSession = (pomo.currentSession || 1) + 1;
    }

    const nextDuration = getPhaseDurationSecs('work', pomo.config);
    pomo.phase = 'work';
    pomo.durationSecs = nextDuration;
    pomo.remainingSecs = nextDuration;
    pomo.remainingAtStart = nextDuration;
    pomo.loggedWorkSecsInPhase = 0;

    if (completed && pomo.config.autoStartWork) {
      pomo.running = true;
      pomo.startedAt = now;
    } else {
      pomo.running = false;
      pomo.startedAt = null;
    }
  }

  return {
    state: pomo,
    finishedPhase,
    unloggedWorkSecs,
    nextPhase: pomo.phase,
  };
}

export function updatePomodoroConfig(pomo, newConfig = {}) {
  if (!pomo) return createPomodoroState(newConfig);
  const wasUntouched = !pomo.running && pomo.remainingSecs === pomo.durationSecs;
  pomo.config = normalizePomodoroConfig({ ...pomo.config, ...newConfig });
  pomo.currentSession = Math.min(
    Math.max(1, pomo.currentSession || 1),
    pomo.config.sessionsBeforeLongBreak
  );
  if (wasUntouched) {
    const newDuration = getPhaseDurationSecs(pomo.phase, pomo.config);
    pomo.durationSecs = newDuration;
    pomo.remainingSecs = newDuration;
    pomo.remainingAtStart = newDuration;
  }
  return pomo;
}
