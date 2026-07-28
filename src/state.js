// ============================
// ChronoWard — state.js
// Central Reactive State Store
// ============================

class StateStore extends EventTarget {
  constructor() {
    super();
    this._state = {
      settings: {},
      sheets: {},
      timers: {},
      currentDate: '',
      projectMode: false,
      detailedMode: false,
      isEmergencyMode: false,
      isCleanSlateMode: false,
      activeDescTimerId: null,
    };
  }

  get state() {
    return this._state;
  }

  get settings() { return this._state.settings; }
  set settings(val) {
    this._state.settings = val || {};
    this.emit('settings-changed', this._state.settings);
  }

  get sheets() { return this._state.sheets; }
  set sheets(val) {
    this._state.sheets = val || {};
    this.emit('sheets-changed', this._state.sheets);
  }

  get timers() { return this._state.timers; }
  set timers(val) {
    this._state.timers = val || {};
    this.emit('timers-changed', this._state.timers);
  }

  get currentDate() { return this._state.currentDate; }
  set currentDate(val) {
    this._state.currentDate = val;
    this.emit('date-changed', val);
  }

  get projectMode() { return this._state.projectMode; }
  set projectMode(val) {
    this._state.projectMode = Boolean(val);
    this.emit('project-mode-changed', this._state.projectMode);
  }

  get detailedMode() { return this._state.detailedMode; }
  set detailedMode(val) {
    this._state.detailedMode = Boolean(val);
    this.emit('detailed-mode-changed', this._state.detailedMode);
  }

  get isEmergencyMode() { return this._state.isEmergencyMode; }
  set isEmergencyMode(val) {
    this._state.isEmergencyMode = Boolean(val);
    this.emit('emergency-mode-changed', this._state.isEmergencyMode);
  }

  get isCleanSlateMode() { return this._state.isCleanSlateMode; }
  set isCleanSlateMode(val) {
    this._state.isCleanSlateMode = Boolean(val);
    this.emit('clean-slate-mode-changed', this._state.isCleanSlateMode);
  }

  on(eventName, callback) {
    const handler = (e) => callback(e.detail);
    this.addEventListener(eventName, handler);
    return () => this.removeEventListener(eventName, handler);
  }

  emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

export const store = new StateStore();
