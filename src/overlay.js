const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let warningActive = false;
let shrinkTimer = null;

const SHRINK_DELAY_MS = 5000;

function updatePosition(pos) {
  if (typeof pos === 'string' && pos.length > 0) {
    document.body.dataset.position = pos;
  }
}

function resetShrinkTimer() {
  if (shrinkTimer) clearTimeout(shrinkTimer);
  if (!warningActive) {
    shrinkTimer = setTimeout(() => {
      if (!warningActive) {
        document.body.classList.add('compact');
      }
    }, SHRINK_DELAY_MS);
  }
}

function updateWarningState(active) {
  warningActive = active;
  if (warningActive) {
    if (shrinkTimer) clearTimeout(shrinkTimer);
    document.body.classList.remove('compact');
  } else {
    resetShrinkTimer();
  }
}

const btn = document.getElementById('btn');
btn.addEventListener('click', () => {
  invoke('show_window').catch(console.error);
});

btn.addEventListener('mouseenter', () => {
  if (shrinkTimer) clearTimeout(shrinkTimer);
  document.body.classList.remove('compact');
});

btn.addEventListener('mouseleave', () => {
  if (!warningActive) {
    resetShrinkTimer();
  }
});

// Listen for Tauri IPC events
listen('overlay-shown', () => {
  invoke('is_warning_active').then(active => {
    updateWarningState(active);
  }).catch(() => {
    if (!warningActive) resetShrinkTimer();
  });
});

listen('warning-state-changed', (event) => {
  const active = typeof event.payload === 'object' && event.payload !== null 
    ? !!event.payload.active 
    : !!event.payload;
  updateWarningState(active);
});

listen('overlay-position-changed', (event) => {
  const pos = typeof event.payload === 'string' 
    ? event.payload 
    : (event.payload && event.payload.position);
  updatePosition(pos);
});

// Initial load check
invoke('is_warning_active').then(active => {
  updateWarningState(active);
}).catch(() => {
  resetShrinkTimer();
});
