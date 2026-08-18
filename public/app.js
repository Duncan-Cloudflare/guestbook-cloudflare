const form = document.getElementById('guestbook-form');
const messageEl = document.getElementById('message');
const entriesEl = document.getElementById('entries');

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

async function loadEntries() {
  try {
    const res = await fetch('/api/entries');
    if (!res.ok) throw new Error('Failed to load entries');
    const entries = await res.json();
    renderEntries(entries);
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function renderEntries(entries) {
  if (!entries.length) {
    entriesEl.innerHTML = '<p>No messages yet. Be the first!</p>';
    return;
  }

  entriesEl.innerHTML = entries
    .map(
      (entry) => `
    <div class="entry">
      <div class="meta">
        <span class="name">${escapeHtml(entry.name)}</span>
        <span>${new Date(entry.created_at).toLocaleString()}</span>
      </div>
      <p>${escapeHtml(entry.message)}</p>
    </div>
  `
    )
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Submission failed');
    showMessage('Thanks! Your message is pending moderation.', 'success');
    form.reset();
    // Refresh after a short delay to allow queue processing
    setTimeout(loadEntries, 2000);
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

loadEntries();
