const secretInput = document.getElementById('admin-secret');
const loadBtn = document.getElementById('load-btn');
const entriesEl = document.getElementById('entries');
const messageEl = document.getElementById('message');

let currentSecret = '';

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

async function loadEntries() {
  currentSecret = secretInput.value.trim();
  if (!currentSecret) {
    showMessage('Please enter the admin secret.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/entries', {
      headers: { 'X-Admin-Secret': currentSecret },
    });
    if (!res.ok) throw new Error('Unauthorized or failed to load');
    const entries = await res.json();
    renderEntries(entries);
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function renderEntries(entries) {
  if (!entries.length) {
    entriesEl.innerHTML = '<p>No entries found.</p>';
    return;
  }

  entriesEl.innerHTML = entries
    .map(
      (entry) => `
    <div class="entry" data-id="${entry.id}">
      <div class="meta">
        <span class="name">${escapeHtml(entry.name)}</span>
        <span>${new Date(entry.created_at).toLocaleString()}</span>
      </div>
      <p>${escapeHtml(entry.message)}</p>
      <div><span class="status ${entry.status}">${entry.status}</span></div>
      <div class="actions">
        <button class="success" data-action="approve">Approve</button>
        <button class="warning" data-action="reject">Reject</button>
        <button class="danger" data-action="delete">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

async function moderate(id, action) {
  let url = `/api/admin/entries/${id}/${action}`;
  let method = 'POST';
  if (action === 'delete') {
    url = `/api/admin/entries/${id}`;
    method = 'DELETE';
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { 'X-Admin-Secret': currentSecret },
    });
    if (!res.ok) throw new Error('Action failed');
    showMessage(`Entry ${action}d.`, 'success');
    loadEntries();
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

loadBtn.addEventListener('click', loadEntries);

entriesEl.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const entryEl = button.closest('.entry');
  const id = entryEl?.dataset.id;
  const action = button.dataset.action;
  if (id && action) {
    moderate(id, action);
  }
});
