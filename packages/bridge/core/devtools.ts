/**
 * Bridge DevTools helpers
 *
 * Devtools page (runs in devtools context):
 *   import { registerBridgeDevToolsPanel } from 'extension-bridge/devtools'
 *   registerBridgeDevToolsPanel()
 *
 * Panel page (runs in extension page context inside DevTools):
 *   import { mountBridgePanel } from 'extension-bridge/devtools'
 *   mountBridgePanel()
 */

import type { DevToolsEvent } from './types';

// ─── Devtools page ────────────────────────────────────────────────────────────

/**
 * Register the Bridge inspector panel inside Chrome DevTools.
 * Call this from the devtools background page script.
 *
 * @param panelHtmlPath - Extension-root-relative path to the panel page.
 *   Defaults to 'devtools-panel.html', which is the WXT output for
 *   entrypoints/devtools-panel/.
 */
export function registerBridgeDevToolsPanel(panelHtmlPath = 'devtools-panel.html'): void {
  chrome.devtools.panels.create('Bridge', '', panelHtmlPath);
}

// ─── Panel page ───────────────────────────────────────────────────────────────

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 12px; background: #1e1e1e; color: #d4d4d4;
  height: 100vh; display: flex; flex-direction: column; overflow: hidden;
}
#toolbar {
  display: flex; align-items: center; gap: 8px; padding: 4px 8px;
  background: #252526; border-bottom: 1px solid #3c3c3c; flex-shrink: 0;
}
#clear-btn {
  padding: 2px 10px; background: #3a3d41; color: #d4d4d4;
  border: 1px solid #555; border-radius: 3px; cursor: pointer; font-size: 11px;
}
#clear-btn:hover { background: #505357; }
#filter-input {
  flex: 1; max-width: 240px; padding: 2px 6px; background: #3c3c3c;
  border: 1px solid #555; border-radius: 3px; color: #d4d4d4;
  font-size: 11px; outline: none;
}
#filter-input:focus { border-color: #007acc; }
.conn-connected { margin-left: auto; font-size: 11px; color: #4ec9b0; }
.conn-disconnected { margin-left: auto; font-size: 11px; color: #f44747; }
#main { display: flex; flex: 1; overflow: hidden; }
#list-pane { width: 55%; overflow-y: auto; border-right: 1px solid #3c3c3c; }
#events-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
#events-table thead { position: sticky; top: 0; background: #252526; z-index: 1; }
#events-table th {
  padding: 4px 6px; text-align: left; font-weight: 600;
  border-bottom: 1px solid #3c3c3c; color: #9d9d9d; font-size: 11px;
}
#events-table td {
  padding: 3px 6px; border-bottom: 1px solid #2d2d2d;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
#events-table tbody tr:hover { background: #2a2d2e; }
#events-table tbody tr.selected { background: #094771; }
.empty { text-align: center; color: #6a6a6a; padding: 20px !important; }
.s-pending { color: #6a6a6a; }
.s-ok      { color: #4ec9b0; }
.s-error   { color: #f44747; }
.s-done    { color: #9d9d9d; }
.t-rpc     { color: #569cd6; font-size: 10px; }
.t-sub     { color: #c586c0; font-size: 10px; }
#detail-pane { flex: 1; overflow-y: auto; padding: 10px; }
#detail-placeholder { color: #6a6a6a; margin-top: 20px; text-align: center; }
#detail-title { font-size: 13px; margin-bottom: 10px; }
#detail-content section { margin-bottom: 12px; }
#detail-content h4 {
  font-size: 11px; font-weight: 600; color: #9d9d9d;
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;
}
pre {
  background: #252526; border: 1px solid #3c3c3c; border-radius: 3px;
  padding: 6px 8px; font-size: 11px; font-family: Consolas, monospace;
  white-space: pre-wrap; word-break: break-all;
}
`;

const HTML = `
<div id="toolbar">
  <button id="clear-btn">Clear</button>
  <input id="filter-input" type="text" placeholder="Filter by path…" autocomplete="off" />
  <span id="status" class="conn-disconnected">Disconnected</span>
</div>
<div id="main">
  <div id="list-pane">
    <table id="events-table">
      <thead>
        <tr><th>#</th><th>Type</th><th>Path</th><th>Status</th><th>Duration</th><th>Time</th></tr>
      </thead>
      <tbody id="events-body">
        <tr id="empty-row"><td colspan="6" class="empty">No calls recorded yet.</td></tr>
      </tbody>
    </table>
  </div>
  <div id="detail-pane">
    <div id="detail-placeholder">Select a call to view details.</div>
    <div id="detail-content" style="display:none">
      <h3 id="detail-title"></h3>
      <section><h4>Request</h4><pre id="detail-request"></pre></section>
      <section><h4>Response</h4><pre id="detail-data"></pre></section>
    </div>
  </div>
</div>
`;

/** One row in the table = one complete call (request + its response or error). */
interface CallRecord {
  index: number;
  id: number | string;
  path: string;
  type: 'rpc' | 'sub';
  status: 'pending' | 'ok' | 'error' | 'done';
  requestData: unknown;
  responseData?: unknown;
  duration?: number;
  startTime: number;
}

/**
 * Mount the Bridge inspector UI into `document.body` and connect to the
 * Bridge service worker via the `bridge:devtools` port.
 * Call this from the panel page script.
 */
export function mountBridgePanel(): void {
  // Inject styles
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Inject markup
  document.body.innerHTML = HTML;

  // ─── DOM refs ──────────────────────────────────────────────────────────────
  const statusEl = document.getElementById('status')!;
  const eventsBody = document.getElementById('events-body')!;
  const emptyRow = document.getElementById('empty-row')!;
  const clearBtn = document.getElementById('clear-btn')!;
  const filterInput = document.getElementById('filter-input') as HTMLInputElement;
  const detailPlaceholder = document.getElementById('detail-placeholder')!;
  const detailContent = document.getElementById('detail-content')!;
  const detailTitle = document.getElementById('detail-title')!;
  const detailRequest = document.getElementById('detail-request')!;
  const detailData = document.getElementById('detail-data')!;

  // ─── State ─────────────────────────────────────────────────────────────────
  const calls: CallRecord[] = [];
  const callsById = new Map<number | string, CallRecord>();
  let selectedIndex = -1;
  let filterText = '';

  // ─── Connection ────────────────────────────────────────────────────────────
  function connect() {
    const port = chrome.runtime.connect({ name: 'bridge:devtools' });
    // Identify which tab this panel is inspecting so the service worker can
    // route events to the correct panel instead of broadcasting to all.
    port.postMessage({ type: 'devtools:init', tabId: chrome.devtools.inspectedWindow.tabId });
    port.onDisconnect.addListener(() => {
      setStatus(false);
      setTimeout(connect, 2000);
    });
    port.onMessage.addListener((event: DevToolsEvent) => handleEvent(event));
    setStatus(true);
  }

  function setStatus(connected: boolean) {
    statusEl.textContent = connected ? 'Connected' : 'Disconnected';
    statusEl.className = connected ? 'conn-connected' : 'conn-disconnected';
  }

  // ─── Event handling ────────────────────────────────────────────────────────
  function handleEvent(event: DevToolsEvent) {
    if (event.type === 'request') {
      const record: CallRecord = {
        index: calls.length,
        id: event.id,
        path: event.path,
        type: 'rpc',
        status: 'pending',
        requestData: event.data,
        startTime: event.timestamp,
      };
      calls.push(record);
      callsById.set(event.id, record);
      if (matchesFilter(record)) appendRow(record);
    }
    else if (event.type === 'response' || event.type === 'error') {
      const record = callsById.get(event.id);
      if (!record) return;
      record.status = event.type === 'response' ? 'ok' : 'error';
      record.responseData = event.data;
      record.duration = event.duration;
      updateRow(record);
    }
    else if (event.type === 'subscribe') {
      const record: CallRecord = {
        index: calls.length,
        id: event.id,
        path: event.path,
        type: 'sub',
        status: 'pending',
        requestData: null,
        startTime: event.timestamp,
      };
      calls.push(record);
      callsById.set(event.id, record);
      if (matchesFilter(record)) appendRow(record);
    }
    else if (event.type === 'unsubscribe') {
      const record = callsById.get(event.id);
      if (!record) return;
      record.status = 'done';
      record.duration = event.timestamp - record.startTime;
      updateRow(record);
    }
  }

  function matchesFilter(r: CallRecord) {
    return !filterText || r.path.toLowerCase().includes(filterText);
  }

  // ─── Table ─────────────────────────────────────────────────────────────────
  function rowCells(record: CallRecord): string {
    const duration = record.duration !== undefined ? `${record.duration}ms` : '—';
    const time = new Date(record.startTime).toISOString().slice(11, 23);
    const statusLabel = record.status === 'pending' ? '…' : record.status === 'ok' ? 'ok' : record.status === 'done' ? 'done' : 'err';
    return `
      <td>${record.index + 1}</td>
      <td class="t-${record.type}">${record.type}</td>
      <td title="${record.path}">${record.path}</td>
      <td class="s-${record.status}">${statusLabel}</td>
      <td>${duration}</td>
      <td>${time}</td>`;
  }

  function appendRow(record: CallRecord) {
    emptyRow.style.display = 'none';
    const tr = document.createElement('tr');
    tr.dataset.index = String(record.index);
    tr.innerHTML = rowCells(record);
    tr.addEventListener('click', () => selectRow(record.index));
    eventsBody.appendChild(tr);
  }

  function updateRow(record: CallRecord) {
    const tr = eventsBody.querySelector<HTMLTableRowElement>(`tr[data-index="${record.index}"]`);
    if (!tr) return; // row was filtered out; will render correctly on next rebuild
    const cells = tr.querySelectorAll('td');
    const statusLabel = record.status === 'ok' ? 'ok' : record.status === 'done' ? 'done' : 'err';
    cells[3]!.className = `s-${record.status}`;
    cells[3]!.textContent = statusLabel;
    cells[4]!.textContent = record.duration !== undefined ? `${record.duration}ms` : '—';
    if (record.index === selectedIndex) showDetail(record);
  }

  function selectRow(index: number) {
    eventsBody.querySelector(`tr[data-index="${selectedIndex}"]`)?.classList.remove('selected');
    selectedIndex = index;
    eventsBody.querySelector(`tr[data-index="${index}"]`)?.classList.add('selected');
    showDetail(calls[index]!);
  }

  // ─── Detail ────────────────────────────────────────────────────────────────
  function showDetail(record: CallRecord) {
    detailPlaceholder.style.display = 'none';
    detailContent.style.display = 'block';
    detailTitle.textContent = record.path;
    detailRequest.textContent = JSON.stringify(record.requestData ?? null, null, 2);
    detailData.textContent = JSON.stringify(record.responseData ?? null, null, 2);
  }

  // ─── Controls ──────────────────────────────────────────────────────────────
  clearBtn.addEventListener('click', () => {
    calls.length = 0;
    callsById.clear();
    selectedIndex = -1;
    eventsBody.innerHTML = '';
    eventsBody.appendChild(emptyRow);
    emptyRow.style.display = '';
    detailPlaceholder.style.display = '';
    detailContent.style.display = 'none';
  });

  filterInput.addEventListener('input', () => {
    filterText = filterInput.value.trim().toLowerCase();
    eventsBody.innerHTML = '';
    eventsBody.appendChild(emptyRow);
    const visible = calls.filter(matchesFilter);
    if (visible.length === 0) {
      emptyRow.style.display = '';
    }
    else {
      emptyRow.style.display = 'none';
      for (const r of visible) appendRow(r);
    }
    eventsBody.querySelector(`tr[data-index="${selectedIndex}"]`)?.classList.add('selected');
  });

  connect();
}
