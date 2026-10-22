(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  let notes = store.get('notes', []);
  let lists = store.get('lists', [{ id: uid(), name: 'To-do', items: [] }]);
  let activeList = store.get('activeList', lists[0].id);
  const saveNotes = () => store.set('notes', notes);
  const saveLists = () => { store.set('lists', lists); store.set('activeList', activeList); };

  function status(msg, ms = 2500) {
    const el = $('#status'); el.textContent = msg;
    if (ms) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, ms);
  }

  // ---------- Tabs ----------
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    stopVoice();
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'feed') renderFeed();
  }));

  // ---------- Voice ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, activeBtn = null, onFinal = null, onInterim = null, wantListening = false;

  function startVoice(btn, idleLabel, finalCb, interimCb) {
    if (!SR) { status('Voice not supported in this browser — use Chrome, Edge or Safari.', 5000); return; }
    stopVoice();
    activeBtn = btn; btn.dataset.idle = idleLabel;
    onFinal = finalCb; onInterim = interimCb; wantListening = true;
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) onFinal(t.trim()); else interim += t;
      }
      onInterim && onInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wantListening = false; status('Microphone permission denied.', 5000); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') status('Voice error: ' + e.error);
    };
    // browsers end continuous sessions on silence; restart while the user still wants it
    rec.onend = () => { if (wantListening) { try { rec.start(); return; } catch {} } setBtn(false); };
    try { rec.start(); setBtn(true); } catch { status('Could not start microphone.'); }
  }
  function stopVoice() {
    wantListening = false;
    if (rec) { try { rec.stop(); } catch {} rec = null; }
    onInterim && onInterim('');
    setBtn(false);
  }
  function setBtn(on) {
    if (!activeBtn) return;
    activeBtn.classList.toggle('on', on);
    activeBtn.setAttribute('aria-pressed', on);
    activeBtn.textContent = on ? '⏹ Listening… tap to stop' : activeBtn.dataset.idle;
    if (!on) activeBtn = null;
  }
  const toggleVoice = (btn, idle, f, i) => (btn.classList.contains('on') ? stopVoice() : startVoice(btn, idle, f, i));

  // ---------- Notes ----------
  const noteText = $('#note-text');
  let noteBase = '', noteSegments = [];
  const PUNCT = [[/\bnew line\b/gi, '\n'], [/\bnew paragraph\b/gi, '\n\n'], [/\s*\bperiod\b/gi, '.'], [/\s*\bcomma\b/gi, ','],
                 [/\s*\bquestion mark\b/gi, '?'], [/\s*\bexclamation (mark|point)\b/gi, '!']];
  const punctuate = (t) => PUNCT.reduce((s, [re, r]) => s.replace(re, r), t);
  const joinNote = () => (noteBase + noteSegments.join(' ')).replace(/ ?\n ?/g, '\n');

  $('#note-mic').addEventListener('click', (e) => {
    if (!e.currentTarget.classList.contains('on')) {
      noteBase = noteText.value && !/\s$/.test(noteText.value) ? noteText.value + ' ' : noteText.value;
      noteSegments = [];
    }
    toggleVoice(e.currentTarget, '🎤 Start talking', (t) => {
      if (/^scratch that\.?$/i.test(t)) noteSegments.pop();
      else if (t) noteSegments.push(punctuate(t));
      noteText.value = joinNote();
    }, (interim) => { noteText.value = joinNote() + (interim ? (noteSegments.length || noteBase ? ' ' : '') + interim : ''); });
  });
  noteText.addEventListener('input', () => { noteBase = noteText.value; noteSegments = []; });

  $('#note-save').addEventListener('click', async () => {
    stopVoice();
    const text = noteText.value.trim();
    if (!text) return status('Nothing to save.');
    const n = { id: uid(), type: 'note', text, site: $('#note-site').value.trim(), cat: $('#note-cat').value, at: Date.now() };
    notes.unshift(n); saveNotes();
    noteText.value = ''; noteBase = ''; noteSegments = [];
    status('Note saved ✓');
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => {
      n.loc = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }; saveNotes();
    }, () => {}, { timeout: 8000, maximumAge: 60000 });
  });

  // ---------- Lists ----------
  const cur = () => lists.find((l) => l.id === activeList) || lists[0];

  function renderLists() {
    const sel = $('#list-select');
    sel.innerHTML = lists.map((l) => `<option value="${l.id}">${esc(l.name)} (${l.items.filter((i) => !i.done).length})</option>`).join('');
    sel.value = cur().id; activeList = cur().id;
    const l = cur();
    $('#items').innerHTML = l.items.length ? l.items.map((i) =>
      `<li class="${i.done ? 'done' : ''}" data-id="${i.id}"><input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Done"><span>${esc(i.text)}</span><button aria-label="Remove">✕</button></li>`
    ).join('') : '<li class="empty">No items yet — tap the mic and start listing.</li>';
    saveLists();
  }
  function addItems(text) {
    const parts = text.split(/\s*(?:\bnext\b|\band\b|,|\n)\s*/i).map((s) => s.trim()).filter(Boolean);
    parts.forEach((p) => cur().items.push({ id: uid(), text: p[0].toUpperCase() + p.slice(1), done: false }));
    renderLists();
  }
  $('#list-select').addEventListener('change', (e) => { activeList = e.target.value; renderLists(); });
  $('#list-new').addEventListener('click', () => {
    const name = prompt('List name?'); if (!name || !name.trim()) return;
    const l = { id: uid(), name: name.trim(), items: [] }; lists.push(l); activeList = l.id; renderLists();
  });
  $('#list-del').addEventListener('click', () => {
    if (!confirm(`Delete list “${cur().name}”?`)) return;
    lists = lists.filter((l) => l.id !== activeList);
    if (!lists.length) lists.push({ id: uid(), name: 'To-do', items: [] });
    activeList = lists[0].id; renderLists();
  });
  $('#item-add').addEventListener('click', () => { const t = $('#item-text').value.trim(); if (t) { cur().items.push({ id: uid(), text: t, done: false }); $('#item-text').value = ''; renderLists(); } });
  $('#item-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#item-add').click(); });
  $('#items').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const item = cur().items.find((i) => i.id === li.dataset.id);
    if (e.target.matches('input')) item.done = e.target.checked;
    else if (e.target.matches('button')) cur().items = cur().items.filter((i) => i !== item);
    else return;
    renderLists();
  });
  $('#list-clear').addEventListener('click', () => { cur().items = cur().items.filter((i) => !i.done); renderLists(); });
  $('#list-mic').addEventListener('click', (e) => toggleVoice(e.currentTarget, '🎤 Dictate items', (t) => {
    if (/^scratch that\.?$/i.test(t)) { cur().items.pop(); renderLists(); }
    else if (t) addItems(t);
  }));
  const listText = (l) => `${l.name}\n` + l.items.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n');
  $('#list-share').addEventListener('click', () => share(listText(cur()), cur().name));

  // ---------- Feed ----------
  function feedEntries() {
    const q = $('#search').value.trim().toLowerCase();
    return notes.filter((n) => !q || (n.text + n.site + n.cat).toLowerCase().includes(q));
  }
  function renderFeed() {
    const list = feedEntries();
    $('#feed').innerHTML = list.length ? list.map((n) => `
      <article class="entry" data-id="${n.id}">
        <div class="meta"><span class="tag ${n.cat}">${esc(n.cat)}</span><span>${fmt(n.at)}</span>${n.site ? `<span>📍 ${esc(n.site)}</span>` : ''}${n.loc ? `<a href="https://maps.google.com/?q=${n.loc.lat},${n.loc.lng}" target="_blank" rel="noopener">GPS</a>` : ''}</div>
        <p>${esc(n.text)}</p>
        <div class="actions"><button data-a="share">Share</button><button data-a="del" class="danger">Delete</button></div>
      </article>`).join('') : '<div class="empty">No updates yet. Record a note to get started.</div>';
  }
  $('#search').addEventListener('input', renderFeed);
  $('#feed').addEventListener('click', (e) => {
    const a = e.target.dataset.a; const el = e.target.closest('.entry'); if (!a || !el) return;
    const n = notes.find((x) => x.id === el.dataset.id);
    if (a === 'share') share(noteText2(n), 'Field update');
    if (a === 'del' && confirm('Delete this note?')) { notes = notes.filter((x) => x !== n); saveNotes(); renderFeed(); }
  });
  const noteText2 = (n) => `[${n.cat}] ${fmt(n.at)}${n.site ? ' — ' + n.site : ''}\n${n.text}`;

  async function share(text, title) {
    if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); status('Copied to clipboard'); } catch { prompt('Copy:', text); }
  }
  $('#share-all').addEventListener('click', () => {
    const items = feedEntries(); if (!items.length) return status('Nothing to share.');
    share(items.map(noteText2).join('\n\n'), 'Field updates');
  });
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ notes, lists }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `infield-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  });

  // ---------- Init ----------
  renderLists();
  if (!SR) status('Voice input unavailable here — typing still works.', 6000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
