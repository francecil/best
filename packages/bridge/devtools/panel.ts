/**
 * Bridge DevTools Panel
 *
 * Connects to the Bridge service worker via a dedicated 'bridge:devtools' port
 * and displays a real-time log of all requests, responses, and errors.
 */

import type { DevToolsEvent } from '../core/types';

// ─── State ──────────────────────────────────────────────────────────────────

interface EventRecord {
  index: number;
  event: DevToolsEvent;
  /** Matching request event for responses/errors */
  requestData?: unknown;
}

const records: EventRecord[] = [];
const requestCache = new Map<number | string, DevToolsEvent>();
let selectedIndex = -1;
let filterText = '';

// ─── DOM refs ────────────────────────────────────────────────────────────────

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

// ─── Connection ──────────────────────────────────────────────────────────────

function connect() {
  const port = chrome.runtime.connect({ name: 'bridge:devtools' });

  port.onDisconnect.addListener(() => {
    setStatus(false);
    // Reconnect after a short delay
    setTimeout(connect, 2000);
  });

  port.onMessage.addListener((event: DevToolsEvent) => {
    handleEvent(event);
  });

  setStatus(true);
}

function setStatus(connected: boolean) {
  statusEl.textContent = connected ? 'Connected' : 'Disconnected';
  statusEl.className = connected ? 'status-connected' : 'status-disconnected';
}

// ─── Event handling ───────────────────────────────────────────────────────────

function handleEvent(event: DevToolsEvent) {
  // Cache request events so responses can show the original request data
  if (event.type === 'request') {
    requestCache.set(event.id, event);
  }

  const record: EventRecord = {
    index: records.length,
    event,
    requestData: event.type !== 'request' ? requestCache.get(event.id)?.data : undefined,
  };

  records.push(record);

  if (matchesFilter(record)) {
    appendRow(record);
  }
}

function matchesFilter(record: EventRecord): boolean {
  if (!filterText) return true;
  return record.event.path.toLowerCase().includes(filterText);
}

// ─── Table rendering ──────────────────────────────────────────────────────────

function appendRow(record: EventRecord) {
  emptyRow.style.display = 'none';

  const tr = document.createElement('tr');
  tr.dataset.index = String(record.index);

  const { event } = record;

  const duration = event.duration !== undefined ? `${event.duration}ms` : '—';
  const time = new Date(event.timestamp).toISOString().slice(11, 23);

  tr.innerHTML = `
    <td>${record.index + 1}</td>
    <td class="type-${event.type}">${event.type}</td>
    <td title="${event.path}">${event.path}</td>
    <td>${duration}</td>
    <td>${time}</td>
  `;

  tr.addEventListener('click', () => selectRow(record.index));
  eventsBody.appendChild(tr);
}

function selectRow(index: number) {
  // Deselect previous
  if (selectedIndex >= 0) {
    const prev = eventsBody.querySelector(`tr[data-index="${selectedIndex}"]`);
    prev?.classList.remove('selected');
  }

  selectedIndex = index;
  const tr = eventsBody.querySelector(`tr[data-index="${index}"]`);
  tr?.classList.add('selected');

  showDetail(records[index]!);
}

// ─── Detail pane ─────────────────────────────────────────────────────────────

function showDetail(record: EventRecord) {
  const { event } = record;

  detailPlaceholder.style.display = 'none';
  detailContent.style.display = 'block';

  detailTitle.textContent = `${event.type.toUpperCase()} · ${event.path}`;

  // Request pane: show original request params for responses/errors, or own data for requests
  const reqData = event.type === 'request' ? event.data : record.requestData;
  detailRequest.textContent = JSON.stringify(reqData ?? null, null, 2);

  // Data pane: the response result, error message, or subscription payload
  detailData.textContent = JSON.stringify(event.data ?? null, null, 2);
}

// ─── Controls ────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  records.length = 0;
  requestCache.clear();
  selectedIndex = -1;
  eventsBody.innerHTML = '';
  eventsBody.appendChild(emptyRow);
  emptyRow.style.display = '';
  detailPlaceholder.style.display = '';
  detailContent.style.display = 'none';
});

filterInput.addEventListener('input', () => {
  filterText = filterInput.value.trim().toLowerCase();
  rebuildTable();
});

function rebuildTable() {
  eventsBody.innerHTML = '';
  eventsBody.appendChild(emptyRow);

  const visible = records.filter(matchesFilter);
  if (visible.length === 0) {
    emptyRow.style.display = '';
  }
  else {
    emptyRow.style.display = 'none';
    for (const record of visible) appendRow(record);
  }

  // Re-apply selected state
  if (selectedIndex >= 0) {
    const tr = eventsBody.querySelector(`tr[data-index="${selectedIndex}"]`);
    tr?.classList.add('selected');
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

connect();
