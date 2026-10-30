import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRoundedHours,
  POMODORO_PHASES,
  POMODORO_PRESETS,
  normalizePomodoroConfig,
  createPomodoroState,
  getPomodoroRemainingSecs,
  getPomodoroUnloggedWorkSecs,
  formatPomodoroTime,
  calculatePomodoroRingOffset,
  startPausePomodoro,
  resetPomodoroPhase,
  switchPomodoroPhase,
  advancePomodoroPhase,
  updatePomodoroConfig,
} from '../src/timers.js';

test('calculateRoundedHours rounds up to nearest increment', () => {
  // 1 hour elapsed, 0.5 increment
  assert.equal(calculateRoundedHours(3600 * 1000, 0.5), 1.0);
  
  // 1 hour 15 mins elapsed, 0.5 increment -> 1.5
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, 0.5), 1.5);

  // 1 hour 30 mins elapsed, 0.5 increment -> 1.5
  assert.equal(calculateRoundedHours((3600 + 30 * 60) * 1000, 0.5), 1.5);

  // 1 hour 31 mins elapsed, 0.5 increment -> 2.0
  assert.equal(calculateRoundedHours((3600 + 31 * 60) * 1000, 0.5), 2.0);

  // Default increment 0.5 fallback
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, null), 1.5);
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, 'invalid'), 1.5);
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, -1), 1.5);
});

test('createPomodoroState and normalizePomodoroConfig enforce bounds and defaults', () => {
  const state = createPomodoroState();
  assert.equal(state.phase, 'work');
  assert.equal(state.running, false);
  assert.equal(state.durationSecs, 25 * 60);
  assert.equal(state.remainingSecs, 25 * 60);
  assert.equal(state.currentSession, 1);
  assert.equal(state.completedSessions, 0);
  assert.equal(state.config.workMinutes, 25);
  assert.equal(state.config.shortBreakMinutes, 5);
  assert.equal(state.config.longBreakMinutes, 15);
  assert.equal(state.config.sessionsBeforeLongBreak, 4);

  const clamped = normalizePomodoroConfig({
    workMinutes: 999,
    shortBreakMinutes: 0,
    longBreakMinutes: -10,
    sessionsBeforeLongBreak: 50,
  });
  assert.equal(clamped.workMinutes, 180);
  assert.equal(clamped.shortBreakMinutes, 1);
  assert.equal(clamped.longBreakMinutes, 1);
  assert.equal(clamped.sessionsBeforeLongBreak, 12);
});

test('formatPomodoroTime and calculatePomodoroRingOffset format countdowns and SVG arc accurately', () => {
  assert.equal(formatPomodoroTime(1500), '25:00');
  assert.equal(formatPomodoroTime(65), '01:05');
  assert.equal(formatPomodoroTime(0), '00:00');
  assert.equal(formatPomodoroTime(3661), '01:01:01');

  // Full remaining time (start of session) -> offset = full circumference (326.72)
  assert.equal(calculatePomodoroRingOffset(1500, 1500, 326.72), 326.72);
  // Halfway through session -> offset = half circumference (163.36)
  assert.equal(calculatePomodoroRingOffset(750, 1500, 326.72), 163.36);
  // Completed session (0 remaining) -> offset = 0 (full ring)
  assert.equal(calculatePomodoroRingOffset(0, 1500, 326.72), 0);
});

test('startPausePomodoro and drift-free timestamp countdown math', () => {
  const pomo = createPomodoroState({ workMinutes: 25 });
  const t0 = 1_000_000;

  // Start timer at t0
  startPausePomodoro(pomo, t0);
  assert.equal(pomo.running, true);
  assert.equal(pomo.startedAt, t0);

  // 10 minutes (600s) later
  const t1 = t0 + 600 * 1000;
  assert.equal(getPomodoroRemainingSecs(pomo, t1), 900);
  assert.equal(getPomodoroUnloggedWorkSecs(pomo, t1), 600);

  // Pause at t1
  startPausePomodoro(pomo, t1);
  assert.equal(pomo.running, false);
  assert.equal(pomo.remainingSecs, 900);

  // Time passes while paused -> remaining stays 900
  const t2 = t1 + 300 * 1000;
  assert.equal(getPomodoroRemainingSecs(pomo, t2), 900);

  // Resume at t2 and run 300s more
  startPausePomodoro(pomo, t2);
  const t3 = t2 + 300 * 1000;
  assert.equal(getPomodoroRemainingSecs(pomo, t3), 600);
  assert.equal(getPomodoroUnloggedWorkSecs(pomo, t3), 900);
});

test('advancePomodoroPhase cycles through Work -> Short Break -> Long Break after N sessions', () => {
  const pomo = createPomodoroState({
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    autoStartBreaks: true,
    autoStartWork: false,
  });

  // Session 1 completes -> Short Break (auto-started)
  let res = advancePomodoroPhase(pomo, true, 2_000_000);
  assert.equal(res.finishedPhase, 'work');
  assert.equal(res.nextPhase, 'shortBreak');
  assert.equal(res.unloggedWorkSecs, 1500);
  assert.equal(pomo.completedSessions, 1);
  assert.equal(pomo.currentSession, 1);
  assert.equal(pomo.running, true);
  assert.equal(pomo.durationSecs, 300);

  // Short Break 1 completes -> Work Session 2 (autoStartWork is false)
  res = advancePomodoroPhase(pomo, true, 2_300_000);
  assert.equal(res.nextPhase, 'work');
  assert.equal(pomo.currentSession, 2);
  assert.equal(pomo.running, false);

  // Complete Sessions 2 & 3
  advancePomodoroPhase(pomo, true, 3_000_000); // -> shortBreak 2
  advancePomodoroPhase(pomo, true, 3_300_000); // -> work 3
  advancePomodoroPhase(pomo, true, 4_000_000); // -> shortBreak 3
  advancePomodoroPhase(pomo, true, 4_300_000); // -> work 4
  assert.equal(pomo.currentSession, 4);

  // Session 4 completes -> Long Break!
  res = advancePomodoroPhase(pomo, true, 5_000_000);
  assert.equal(res.nextPhase, 'longBreak');
  assert.equal(pomo.completedSessions, 4);
  assert.equal(pomo.totalFocusSecsToday, 4 * 1500);
  assert.equal(pomo.durationSecs, 15 * 60);

  // Long Break completes -> resets cycle back to Work Session 1
  res = advancePomodoroPhase(pomo, true, 6_000_000);
  assert.equal(res.nextPhase, 'work');
  assert.equal(pomo.currentSession, 1);
});

test('resetPomodoroPhase, switchPomodoroPhase, and updatePomodoroConfig', () => {
  const pomo = createPomodoroState(POMODORO_PRESETS.classic);
  startPausePomodoro(pomo, 1000);
  resetPomodoroPhase(pomo);
  assert.equal(pomo.running, false);
  assert.equal(pomo.remainingSecs, 25 * 60);

  switchPomodoroPhase(pomo, 'longBreak');
  assert.equal(pomo.phase, 'longBreak');
  assert.equal(pomo.remainingSecs, 15 * 60);

  // Updating config while untouched updates current phase duration immediately
  updatePomodoroConfig(pomo, POMODORO_PRESETS.deep);
  assert.equal(pomo.config.workMinutes, 50);
  assert.equal(pomo.config.longBreakMinutes, 25);
  assert.equal(pomo.durationSecs, 25 * 60);
  assert.equal(pomo.remainingSecs, 25 * 60);
  assert.ok(POMODORO_PHASES.work && POMODORO_PHASES.shortBreak && POMODORO_PHASES.longBreak);
});
