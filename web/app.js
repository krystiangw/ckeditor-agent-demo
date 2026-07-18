/* global CKEDITOR, CKEDITOR_PREMIUM_FEATURES */

(async () => {
  const {
    ClassicEditor,
    Essentials,
    Paragraph,
    Heading,
    Bold,
    Italic,
    List,
    Link,
    Table,
    TableToolbar,
    Alignment,
    FindAndReplace,
    WordCount,
  } = CKEDITOR;
  const { TrackChanges, Comments, FormatPainter } = CKEDITOR_PREMIUM_FEATURES;

  const $ = (selector) => document.querySelector(selector);
  const state = {
    editor: null,
    editorLoads: 1,
    agentOps: 0,
    suggestionsPending: 0,
    audit: [],
    busy: false,
  };

  let toastTimer;
  let suggestionTimer;

  function toast(message, isError = false) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.toggle('error', isError);
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
  }

  function log(message, type = '') {
    const container = $('#activity-log');
    const line = document.createElement('div');
    line.className = `log-line ${type ? `log-${type}` : ''}`;
    line.textContent = message;
    container.append(line);
    container.scrollTop = container.scrollHeight;
  }

  function renderMeter() {
    $('#editor-loads').textContent = state.editorLoads;
    $('#agent-ops').textContent = state.agentOps;
    $('#suggestion-count').textContent = state.suggestionsPending;
    updateProtectedButtons();
  }

  function updateProtectedButtons() {
    const blocked = state.busy || state.suggestionsPending > 0;
    for (const selector of ['#draft-button', '#table-button']) {
      const button = $(selector);
      button.disabled = blocked;
      button.title = state.suggestionsPending > 0
        ? 'Accept or reject pending suggestions before replacing editor data.'
        : '';
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    document.querySelectorAll('.task-button').forEach((button) => {
      button.disabled = busy;
    });
    $('#save-button').disabled = busy;
    updateProtectedButtons();
  }

  async function request(path, options = {}) {
    const method = options.method || 'GET';
    const isAgentCall = path.startsWith('/api/agent/');
    if (isAgentCall) {
      state.agentOps += 1;
      renderMeter();
      log(`→ ${method} ${path}`);
    }

    const response = await fetch(path, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = payload?.error || `Request failed (${response.status})`;
      if (isAgentCall) log(`× ${message}`, 'error');
      throw new Error(message);
    }
    return payload;
  }

  function logMcpCalls(calls = []) {
    calls.forEach((name) => log(`  ↳ ${name}`, 'mcp'));
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  function renderCase(caseData) {
    $('#claim-heading').textContent = caseData.id;
    $('#case-id').textContent = caseData.id;
    $('#case-status').textContent = caseData.status;
    $('#case-claimant').textContent = caseData.claimant;
    $('#case-policy').textContent = caseData.policy;
    $('#case-coverage').textContent = `${caseData.policyType} · ${caseData.lossType}`;
    $('#case-amount').textContent = formatMoney(caseData.claimAmount);
    $('#case-adjuster').textContent = caseData.adjuster;
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function renderAudit() {
    const list = $('#audit-list');
    list.replaceChildren();
    $('#audit-count').textContent = state.audit.length;
    if (!state.audit.length) {
      const empty = document.createElement('p');
      empty.className = 'muted empty-message';
      empty.textContent = 'No activity recorded yet.';
      list.append(empty);
      return;
    }

    for (const entry of state.audit) {
      const item = document.createElement('article');
      item.className = `audit-item ${entry.thumb ? '' : 'no-thumb'}`;
      if (entry.thumb) {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'audit-thumb';
        thumb.title = 'Open full snapshot';
        const image = document.createElement('img');
        image.src = entry.thumb;
        image.alt = '';
        thumb.append(image);
        thumb.addEventListener('click', () => openLightbox(entry.thumb));
        item.append(thumb);
      }
      const detail = document.createElement('div');
      const action = document.createElement('div');
      action.className = 'audit-action';
      action.textContent = entry.action;
      const meta = document.createElement('div');
      meta.className = 'audit-meta';
      meta.textContent = `${entry.actor} · ${formatTime(entry.ts)}`;
      detail.append(action, meta);
      item.append(detail);
      list.append(item);
    }
  }

  async function addAudit(action, thumb) {
    const entry = await request('/api/audit', {
      method: 'POST',
      body: JSON.stringify({ actor: 'Claims Agent (AI)', action, ...(thumb ? { thumb } : {}) }),
    });
    state.audit.unshift(entry);
    renderAudit();
  }

  function openLightbox(source) {
    $('#lightbox-image').src = source;
    $('#lightbox').classList.remove('hidden');
  }

  function closeOverlay(id) {
    $(`#${id}`).classList.add('hidden');
  }

  function setEditorData(html) {
    state.editor.setData(html || '');
    $('#empty-hint').classList.toggle('hidden', Boolean(html));
    state.suggestionsPending = 0;
    renderMeter();
  }

  function countSuggestions(fallback = state.suggestionsPending) {
    try {
      const editing = state.editor.plugins.get('TrackChangesEditing');
      const suggestions = editing.getSuggestions?.();
      if (typeof suggestions === 'number') return suggestions;
      if (typeof suggestions?.length === 'number') return suggestions.length;
      if (typeof suggestions?.size === 'number') return suggestions.size;
      if (suggestions?.[Symbol.iterator]) return Array.from(suggestions).length;
    } catch (error) {
      console.debug('Suggestion count unavailable', error);
    }
    return fallback;
  }

  function refreshSuggestions(fallback) {
    state.suggestionsPending = countSuggestions(fallback);
    renderMeter();
  }

  function scheduleSuggestionRefresh() {
    clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(() => refreshSuggestions(), 80);
  }

  function blockText(element) {
    return Array.from(element.getChildren()).map((node) => node.data || '').join('');
  }

  async function applyPlan(plan) {
    if (!plan.length) {
      refreshSuggestions(0);
      return;
    }

    const editor = state.editor;
    const trackChanges = editor.commands.get('trackChanges');
    if (!trackChanges.value) editor.execute('trackChanges');

    try {
      for (const step of plan) {
        if (step.kind === 'replace') {
          const findAndReplace = editor.plugins.get('FindAndReplace');
          editor.execute('find', step.find);
          editor.execute('replaceAll', step.replacement, step.find);
          findAndReplace.state?.clear?.(editor.model);
        } else if (step.kind === 'insertParagraphBefore') {
          const root = editor.model.document.getRoot();
          const anchorElement = Array.from(root.getChildren())
            .find((child) => blockText(child).trim().startsWith(step.anchor));
          if (!anchorElement) throw new Error(`Could not find insertion anchor: ${step.anchor}`);
          const viewFragment = editor.data.processor.toView(step.html);
          const modelFragment = editor.data.toModel(viewFragment);
          editor.model.insertContent(modelFragment, editor.model.createPositionBefore(anchorElement));
        }
      }
    } finally {
      if (editor.commands.get('trackChanges').value) editor.execute('trackChanges');
    }

    refreshSuggestions(plan.length);
  }

  function renderFindings(plan) {
    const card = $('#findings-card');
    const list = $('#findings-list');
    list.replaceChildren();
    $('#finding-count').textContent = plan.length;
    card.classList.toggle('hidden', plan.length === 0);
    for (const step of plan) {
      const item = document.createElement('li');
      const rule = document.createElement('span');
      rule.className = 'rule-id';
      rule.textContent = step.ruleId;
      item.append(rule, document.createTextNode(step.reason));
      list.append(item);
    }
  }

  function showStats(stats) {
    const words = stats.words ?? stats.wordCount;
    const characters = stats.characters ?? stats.characterCount;
    if (words == null && characters == null) {
      $('#document-stats').textContent = stats.raw || 'Document statistics available.';
      return;
    }
    $('#document-stats').textContent = `${words ?? '—'} words · ${characters ?? '—'} characters`;
  }

  async function runTask(task) {
    if (state.busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      log(`× ${error.message}`, 'error');
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function draftResponse() {
    if (state.suggestionsPending) return;
    const result = await request('/api/agent/draft', { method: 'POST', body: '{}' });
    logMcpCalls(result.mcpCalls);
    setEditorData(result.html);
    showStats(result.stats);
    await addAudit('Agent drafted claim response', result.screenshot);
    $('#save-state').textContent = 'Unsaved changes';
    toast('Draft created from the approved template.');
  }

  async function review(mode) {
    const labels = { compliance: 'compliance', pii: 'PII', plain: 'plain-language' };
    const result = await request('/api/agent/review', {
      method: 'POST',
      body: JSON.stringify({ html: state.editor.getData(), mode }),
    });
    logMcpCalls(result.mcpCalls);
    await applyPlan(result.plan);
    renderFindings(result.plan);
    await addAudit(`Agent proposed ${result.plan.length} changes (${labels[mode]})`);
    $('#save-state').textContent = 'Unsaved changes';
    toast(result.plan.length ? `${result.plan.length} review suggestions added.` : 'No findings for this review.');
  }

  async function insertTable() {
    if (state.suggestionsPending) return;
    const result = await request('/api/agent/table', {
      method: 'POST',
      body: JSON.stringify({ html: state.editor.getData() }),
    });
    logMcpCalls(result.mcpCalls);
    setEditorData(result.html);
    await addAudit('Agent inserted settlement table');
    $('#save-state').textContent = 'Unsaved changes';
    toast('Settlement table inserted.');
  }

  async function takeSnapshot() {
    const result = await request('/api/agent/snapshot', {
      method: 'POST',
      body: JSON.stringify({ html: state.editor.getData() }),
    });
    logMcpCalls(result.mcpCalls);
    await addAudit('Audit snapshot captured', result.screenshot);
    toast('Snapshot added to the audit trail.');
  }

  async function saveDocument() {
    const saved = await request('/api/document', {
      method: 'PUT',
      body: JSON.stringify({ html: state.editor.getData() }),
    });
    $('#save-state').textContent = `Saved ${formatTime(saved.savedAt)}`;
    toast('Letter saved.');
  }

  async function showIntegrationLog() {
    $('#built-with-modal').classList.remove('hidden');
    const pre = $('#integration-log');
    pre.textContent = 'Loading…';
    try {
      const response = await fetch('/docs/INTEGRATION_LOG.md');
      if (!response.ok) throw new Error(`Unable to load integration log (${response.status})`);
      pre.textContent = await response.text();
    } catch (error) {
      pre.textContent = error.message;
    }
  }

  function wireEvents() {
    $('#draft-button').addEventListener('click', () => runTask(draftResponse));
    $('#compliance-button').addEventListener('click', () => runTask(() => review('compliance')));
    $('#pii-button').addEventListener('click', () => runTask(() => review('pii')));
    $('#plain-button').addEventListener('click', () => runTask(() => review('plain')));
    $('#table-button').addEventListener('click', () => runTask(insertTable));
    $('#snapshot-button').addEventListener('click', () => runTask(takeSnapshot));
    $('#save-button').addEventListener('click', () => runTask(saveDocument));
    $('#clear-log').addEventListener('click', () => $('#activity-log').replaceChildren());
    $('#built-with-button').addEventListener('click', showIntegrationLog);
    document.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => closeOverlay(button.dataset.close));
    });
    document.querySelectorAll('.overlay').forEach((overlay) => {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.classList.add('hidden');
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.querySelectorAll('.overlay').forEach((overlay) => overlay.classList.add('hidden'));
    });
  }

  try {
    const [config, caseData, documentData, audit] = await Promise.all([
      request('/api/config'),
      request('/api/case'),
      request('/api/document'),
      request('/api/audit'),
    ]);

    renderCase(caseData);
    state.audit = audit;
    renderAudit();

    state.editor = await ClassicEditor.create(document.querySelector('#editor'), {
      licenseKey: config.licenseKey,
      plugins: [
        Essentials, Paragraph, Heading, Bold, Italic, List, Link, Table, TableToolbar,
        Alignment, FindAndReplace, WordCount, TrackChanges, Comments, FormatPainter,
      ],
      toolbar: [
        'undo', 'redo', '|', 'heading', '|', 'bold', 'italic', 'alignment', '|',
        'bulletedList', 'numberedList', 'link', 'insertTable', '|',
        'trackChanges', 'comment', 'formatPainter', 'findAndReplace',
      ],
      table: {
        contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
      },
      sidebar: {
        container: document.querySelector('#annotations'),
      },
    });

    const users = state.editor.plugins.get('Users');
    users.addUser({ id: 'agent', name: 'Claims Agent (AI)' });
    users.addUser({ id: 'marta', name: 'M. Kowalska' });
    users.defineMe('marta');

    window.editor = state.editor;
    if (documentData.html) {
      state.editor.setData(documentData.html);
      $('#empty-hint').classList.add('hidden');
      $('#save-state').textContent = documentData.savedAt ? `Saved ${formatTime(documentData.savedAt)}` : 'Loaded';
    }
    state.editor.model.document.on('change:data', scheduleSuggestionRefresh);
    wireEvents();
    refreshSuggestions(0);
    log('Editor ready.', 'muted');
  } catch (error) {
    console.error(error);
    log(`× Boot failed: ${error.message}`, 'error');
    toast(`Could not start ClaimDesk: ${error.message}`, true);
  }
})();
