const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;

const taskInput = document.getElementById('taskInput');
const projectSelect = document.getElementById('projectSelect');
const ticketInput = document.getElementById('ticketInput');
const hoursInput = document.getElementById('hoursInput');
const commitBtn = document.getElementById('commitBtn');
const statusMessage = document.getElementById('statusMessage');

let isSubmitting = false;

ticketInput.addEventListener('input', () => {
  const val = ticketInput.value.trim();
  const match = val.match(/^(.*?)(\d*)$/);
  const prefix = match ? match[1] : val;
  const id = match ? match[2] : '';
  const isValid = prefix.length <= 12 && id.length <= 12;
  ticketInput.classList.toggle('ticket-invalid', !isValid);
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

  statusMessage.textContent = 'Saving...';
  statusMessage.style.color = '#38bdf8';
  isSubmitting = true;

  try {
    const todayStr = getTodayString();
    const taskText = project ? `[${project}] ${task}` : task;
    const newRow = {
      timerId: 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      task: taskText,
      hours: hours,
      ot: false,
      ticketNum: ticketNum,
      description: ''
    };

    // M9: wait for acknowledgement
    let unsubscribeSuccess;
    let unsubscribeError;

    const ackPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for save acknowledgement")), 5000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        if (unsubscribeSuccess) unsubscribeSuccess();
        if (unsubscribeError) unsubscribeError();
      };

      listen('hud-entry-saved', (evt) => {
        if (evt.payload && evt.payload.date === todayStr) {
          cleanup();
          resolve();
        }
      }).then(unsub => { unsubscribeSuccess = unsub; });

      listen('hud-entry-failed', (evt) => {
        cleanup();
        reject(new Error(evt.payload?.error || "Save failed"));
      }).then(unsub => { unsubscribeError = unsub; });
    });

    await emit('hud-entry-added', { date: todayStr, row: newRow });
    await ackPromise;

    // Reset & dismiss
    taskInput.value = '';
    ticketInput.value = '';
    projectSelect.value = '';
    hoursInput.value = 0;
    statusMessage.textContent = 'Logged!';
    statusMessage.style.color = '#38bdf8'; // Ensure color is reset to success color
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
  if (e.key === 'Enter') {
    commitLog();
  } else if (e.key === 'Escape') {
    invoke('hide_hud_cmd').catch(console.error);
  }
});

listen('hud-opened', async () => {
  taskInput.value = '';
  ticketInput.value = '';
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
