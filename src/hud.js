const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;

const taskInput = document.getElementById('taskInput');
const projectSelect = document.getElementById('projectSelect');
const ticketInput = document.getElementById('ticketInput');
const hoursInput = document.getElementById('hoursInput');
const commitBtn = document.getElementById('commitBtn');
const statusMessage = document.getElementById('statusMessage');

let isSubmitting = false;

function generateRowId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function isValidTicket(val) {
  if (!val) return true;
  const match = val.match(/^(.*?)(\d*)$/);
  const prefix = match ? match[1] : val;
  const id = match ? match[2] : '';
  return prefix.length <= 12 && id.length <= 12;
}

ticketInput.addEventListener('input', () => {
  const val = ticketInput.value.trim();
  ticketInput.classList.toggle('ticket-invalid', !isValidTicket(val));
});

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function commitLog() {
  if (isSubmitting) return;

  const task = taskInput.value.trim();
  const project = projectSelect.value;
  const ticketNum = ticketInput.value.trim().toUpperCase();
  let hours = parseFloat(hoursInput.value) || 0;
  hours = Math.max(0, Math.min(24, hours)); // M6: Clamp hours

  if (!task) {
    statusMessage.textContent = 'Please enter a task description';
    statusMessage.style.color = '#f87171';
    taskInput.focus();
    return;
  }

  if (!isValidTicket(ticketNum)) {
    ticketInput.classList.add('ticket-invalid');
    statusMessage.textContent = 'Invalid ticket # (max 12 prefix chars + 12 digits)';
    statusMessage.style.color = '#f87171';
    ticketInput.focus();
    return;
  }

  statusMessage.textContent = 'Saving...';
  statusMessage.style.color = '#38bdf8';
  isSubmitting = true;

  try {
    const todayStr = getTodayString();
    const taskText = project ? `[${project}] ${task}` : task;
    const newRow = {
      timerId: generateRowId(),
      task: taskText,
      hours: hours,
      ot: false,
      ticketNum: ticketNum,
      description: ''
    };

    // R-M4: await listener registration before emitting and clean up on timeout
    let resolveAck, rejectAck;
    const ackPromise = new Promise((resolve, reject) => {
      resolveAck = resolve;
      rejectAck = reject;
    });

    let timeoutId;
    let unsubscribeSuccess;
    let unsubscribeError;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (unsubscribeSuccess) { unsubscribeSuccess(); unsubscribeSuccess = null; }
      if (unsubscribeError) { unsubscribeError(); unsubscribeError = null; }
    };

    [unsubscribeSuccess, unsubscribeError] = await Promise.all([
      listen('hud-entry-saved', (evt) => {
        if (evt.payload && evt.payload.date === todayStr) {
          cleanup();
          resolveAck();
        }
      }),
      listen('hud-entry-failed', (evt) => {
        cleanup();
        rejectAck(new Error(evt.payload?.error || 'Save failed'));
      }),
    ]);

    timeoutId = setTimeout(() => {
      cleanup();
      rejectAck(new Error('Timeout waiting for save acknowledgement'));
    }, 5000);

    await emit('hud-entry-added', { date: todayStr, row: newRow });
    await ackPromise;

    // Reset & dismiss
    taskInput.value = '';
    ticketInput.value = '';
    ticketInput.classList.remove('ticket-invalid');
    projectSelect.value = '';
    hoursInput.value = 0;
    statusMessage.textContent = 'Logged!';
    statusMessage.style.color = '#38bdf8';
    setTimeout(async () => {
      await invoke('hide_hud_cmd');
      statusMessage.textContent = 'Ready';
      isSubmitting = false;
    }, 300);

  } catch (err) {
    isSubmitting = false;
    console.error('HUD Commit Error:', err);
    const errMsg = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
    statusMessage.textContent = `Failed: ${errMsg}`;
    statusMessage.style.color = '#f87171';
  }
}

commitBtn.addEventListener('click', commitLog);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target !== commitBtn) {
    commitLog();
  } else if (e.key === 'Escape') {
    invoke('hide_hud_cmd').catch(console.error);
  }
});

listen('hud-opened', async () => {
  taskInput.value = '';
  ticketInput.value = '';
  ticketInput.classList.remove('ticket-invalid');
  projectSelect.value = '';
  statusMessage.textContent = 'Ready';
  statusMessage.style.color = '#38bdf8';
  setTimeout(() => taskInput.focus(), 50);

  try {
    const settings = await invoke('load_settings');
    if (settings && settings.hourIncrement) {
      hoursInput.step = settings.hourIncrement;
    }
  } catch (err) {
    console.error('Failed to load settings in HUD:', err);
  }
  hoursInput.value = 0;
});
