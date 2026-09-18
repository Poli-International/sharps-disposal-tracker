/**
 * Sharps Disposal Tracker v2
 * Fully client-side, zero remote dependencies, strict CSP compliance.
 * Handles:
 *  1. Studio profiles & studio-specific isolation (Improvement G)
 *  2. Container lifecycle (opened, in use, sealed, collected / archived) (Improvement H)
 *  3. Container's own reference & station location (Improvement A)
 *  4. Studio's own open-too-long limit with warning flags (Improvement B)
 *  5. Why it was sealed short-list reason recording (Improvement C)
 *  6. Collection register with monthly/yearly totals & paper sheet (Improvement D)
 *  7. Where the paper is filed (Improvement E)
 *  8. Next collection calendar .ics export (Improvement F)
 *  9. JSON backup & restore with merge/replace choices (Improvement H)
 * 10. Multi-language dictionary switching across 7 languages
 */

const STORAGE_KEY = 'poli-sharps-disposal-v2';
const STUDIOS_KEY = 'poli-sharps-studios-v2';
const ACTIVE_STUDIO_KEY = 'poli-active-studio-v2';
const THEME_KEY = 'poli-theme-preference';
const LANG_KEY = 'poli-language';

// State in memory
let studios = [];
let activeStudioId = 'default';
let containers = [];
let currentFilter = 'ALL';
let searchQuery = '';
let registerDateFrom = '';
let registerDateTo = '';

/**
 * Get safe local ISO date string YYYY-MM-DD
 * Preserves user local calendar date without UTC offset shifting (Rule 19).
 */
function getLocalToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate difference in whole days between two YYYY-MM-DD dates
 */
function daysBetween(startDateStr, endDateStr) {
  if (!startDateStr) return 0;
  const start = new Date(startDateStr + 'T00:00:00');
  const end = endDateStr ? new Date(endDateStr + 'T00:00:00') : new Date(getLocalToday() + 'T00:00:00');
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Escape HTML to prevent XSS
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format currency / cost without inventing defaults (Rule 19)
 */
function formatCost(val) {
  if (val === '' || val === null || val === undefined) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return esc(val);
  return n.toFixed(2);
}

/**
 * Format weight without inventing defaults
 */
function formatWeight(val) {
  if (!val && val !== 0) return '—';
  return String(val);
}

/**
 * Translate seal reason to user-friendly label (Improvement C)
 */
function getSealReasonLabel(container) {
  if (!container.sealReason) return '—';
  if (container.sealReason === 'other') {
    return container.sealReasonOther ? esc(container.sealReasonOther) : window.t('modal.seal_reason_other');
  }
  const keyMap = {
    full: 'modal.seal_reason_full',
    time_limit: 'modal.seal_reason_time_limit',
    moving_premises: 'modal.seal_reason_moving_premises'
  };
  const key = keyMap[container.sealReason];
  return key ? window.t(key) : container.sealReason;
}

/**
 * Studios Management (Improvement G)
 */
function loadStudios() {
  try {
    const raw = localStorage.getItem(STUDIOS_KEY);
    if (raw) {
      studios = JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading studios', e);
  }

  if (!Array.isArray(studios) || studios.length === 0) {
    studios = [
      { id: 'default', name: 'Main Studio', maxOpenDays: 30, nextCollectionDate: '', nextCollectionNotes: '' }
    ];
    saveStudios();
  }

  const savedActive = localStorage.getItem(ACTIVE_STUDIO_KEY);
  if (savedActive && studios.some(s => s.id === savedActive)) {
    activeStudioId = savedActive;
  } else {
    activeStudioId = studios[0].id;
  }
}

function saveStudios() {
  try {
    localStorage.setItem(STUDIOS_KEY, JSON.stringify(studios));
    localStorage.setItem(ACTIVE_STUDIO_KEY, activeStudioId);
  } catch (e) {
    console.error('Error saving studios', e);
  }
}

function getActiveStudio() {
  return studios.find(s => s.id === activeStudioId) || studios[0];
}

/**
 * Containers Storage Load & Save
 */
function loadData() {
  loadStudios();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        containers = parsed.map(c => {
          return {
            id: c.id || ('BIN-' + Math.random().toString(36).substr(2, 9)),
            containerRef: c.containerRef || c.id || '',
            station: c.station || '',
            size: c.size || '1.0 L',
            status: c.status || 'in_use',
            dateOpened: c.dateOpened || getLocalToday(),
            dateSealed: c.dateSealed || '',
            sealReason: c.sealReason || '',
            sealReasonOther: c.sealReasonOther || '',
            dateCollected: c.dateCollected || '',
            carrier: c.carrier || '',
            consignmentRef: c.consignmentRef || '',
            filingRef: c.filingRef || '',
            weight: c.weight || '',
            cost: c.cost !== undefined ? String(c.cost) : '',
            notes: c.notes || '',
            studioId: c.studioId || activeStudioId
          };
        });
        return;
      }
    }
  } catch (e) {
    console.error('Error loading containers data', e);
  }
  containers = [];
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(containers));
  } catch (e) {
    console.error('Error saving containers data', e);
  }
}

/**
 * Get containers for active studio
 */
function getActiveStudioContainers() {
  return containers.filter(c => c.studioId === activeStudioId);
}

/**
 * Modal Handling
 */
let modalConfirmCallback = null;

function showModal({ title, contentHtml, confirmText, cancelText, confirmClass, onConfirm }) {
  const backdrop = document.getElementById('modal-backdrop');
  const titleEl = document.getElementById('modal-title');
  const contentEl = document.getElementById('modal-content');
  const confirmBtn = document.getElementById('modal-btn-confirm');
  const cancelBtn = document.getElementById('modal-btn-cancel');

  if (!backdrop) return;

  titleEl.textContent = title;
  contentEl.innerHTML = contentHtml;
  confirmBtn.textContent = confirmText || window.t('common.confirm');
  cancelBtn.textContent = cancelText || window.t('common.cancel');
  confirmBtn.className = 'btn ' + (confirmClass || 'btn-primary');

  modalConfirmCallback = onConfirm;
  backdrop.classList.add('is-open');
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.classList.remove('is-open');
  modalConfirmCallback = null;
}

/**
 * Seal Container Workflow (Improvement C)
 */
function promptSealContainer(id) {
  const container = containers.find(c => c.id === id);
  if (!container) return;

  const today = getLocalToday();
  const html = `
    <div class="modal-form-stack">
      <p>${window.t('modal.seal_confirm_msg', { ref: esc(container.containerRef || container.station), station: esc(container.station), size: esc(container.size) })}</p>
      
      <div class="form-field">
        <label for="modal-seal-date" class="modal-field-label">${window.t('modal.seal_date_label')}</label>
        <input type="date" id="modal-seal-date" class="input-field" value="${today}" min="${container.dateOpened}" required />
      </div>

      <div class="form-field">
        <label for="modal-seal-reason" class="modal-field-label">${window.t('modal.seal_reason_label')}</label>
        <select id="modal-seal-reason" class="input-field" required>
          <option value="full">${window.t('modal.seal_reason_full')}</option>
          <option value="time_limit">${window.t('modal.seal_reason_time_limit')}</option>
          <option value="moving_premises">${window.t('modal.seal_reason_moving_premises')}</option>
          <option value="other">${window.t('modal.seal_reason_other')}</option>
        </select>
      </div>

      <div class="form-field is-hidden" id="modal-seal-other-wrap">
        <label for="modal-seal-other" class="modal-field-label">${window.t('modal.seal_reason_other_label')}</label>
        <input type="text" id="modal-seal-other" class="input-field" placeholder="${window.t('modal.seal_reason_other_placeholder')}" />
      </div>
    </div>
  `;

  showModal({
    title: window.t('modal.seal_title'),
    contentHtml: html,
    confirmText: window.t('modal.seal_btn'),
    confirmClass: 'btn-warning',
    onConfirm: () => {
      const dateInput = document.getElementById('modal-seal-date');
      const reasonSelect = document.getElementById('modal-seal-reason');
      const otherInput = document.getElementById('modal-seal-other');

      container.status = 'sealed';
      container.dateSealed = dateInput ? dateInput.value : today;
      container.sealReason = reasonSelect ? reasonSelect.value : 'full';
      if (container.sealReason === 'other' && otherInput) {
        container.sealReasonOther = otherInput.value.trim();
      } else {
        container.sealReasonOther = '';
      }

      saveData();
      renderAll();
    }
  });

  const reasonSelect = document.getElementById('modal-seal-reason');
  const otherWrap = document.getElementById('modal-seal-other-wrap');
  if (reasonSelect && otherWrap) {
    reasonSelect.addEventListener('change', () => {
      if (reasonSelect.value === 'other') {
        otherWrap.classList.remove('is-hidden');
      } else {
        otherWrap.classList.add('is-hidden');
      }
    });
  }
}

/**
 * Record Waste Collection Workflow (Improvements D & E)
 */
function promptCollectContainer(id) {
  const container = containers.find(c => c.id === id);
  if (!container) return;

  const today = getLocalToday();
  const defaultSealed = container.dateSealed || today;

  const html = `
    <div class="modal-form-stack">
      <p>${window.t('modal.collect_confirm_msg', { ref: esc(container.containerRef || container.station), station: esc(container.station) })}</p>
      
      <div class="form-field">
        <label for="modal-collect-date" class="modal-field-label">${window.t('modal.collect_date_label')}</label>
        <input type="date" id="modal-collect-date" class="input-field" value="${today}" min="${container.dateOpened}" required />
      </div>

      <div class="form-field">
        <label for="modal-carrier" class="modal-field-label">${window.t('modal.carrier_label')}</label>
        <input type="text" id="modal-carrier" class="input-field" placeholder="${window.t('modal.carrier_placeholder')}" value="${esc(container.carrier || '')}" required />
      </div>

      <div class="form-field">
        <label for="modal-ref" class="modal-field-label">${window.t('modal.consignment_ref_label')}</label>
        <input type="text" id="modal-ref" class="input-field" placeholder="${window.t('modal.consignment_ref_placeholder')}" value="${esc(container.consignmentRef || '')}" required />
      </div>

      <div class="form-field">
        <label for="modal-filing-ref" class="modal-field-label">${window.t('modal.filing_ref_label')}</label>
        <input type="text" id="modal-filing-ref" class="input-field" placeholder="${window.t('modal.filing_ref_placeholder')}" value="${esc(container.filingRef || '')}" />
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="modal-weight" class="modal-field-label">${window.t('modal.weight_label')}</label>
          <input type="text" id="modal-weight" class="input-field" placeholder="${window.t('modal.weight_placeholder')}" value="${esc(container.weight || '')}" />
        </div>
        <div class="form-field">
          <label for="modal-cost" class="modal-field-label">${window.t('modal.cost_label')}</label>
          <input type="number" step="0.01" min="0" id="modal-cost" class="input-field" placeholder="${window.t('modal.cost_placeholder')}" value="${esc(container.cost || '')}" />
        </div>
      </div>
    </div>
  `;

  showModal({
    title: window.t('modal.collect_title'),
    contentHtml: html,
    confirmText: window.t('modal.collect_btn'),
    confirmClass: 'btn-primary',
    onConfirm: () => {
      const dateEl = document.getElementById('modal-collect-date');
      const carrierEl = document.getElementById('modal-carrier');
      const refEl = document.getElementById('modal-ref');
      const filingEl = document.getElementById('modal-filing-ref');
      const weightEl = document.getElementById('modal-weight');
      const costEl = document.getElementById('modal-cost');

      container.status = 'collected';
      if (!container.dateSealed) {
        container.dateSealed = defaultSealed;
      }
      container.dateCollected = dateEl ? dateEl.value : today;
      container.carrier = carrierEl ? carrierEl.value.trim() : '';
      container.consignmentRef = refEl ? refEl.value.trim() : '';
      container.filingRef = filingEl ? filingEl.value.trim() : '';
      container.weight = weightEl ? weightEl.value.trim() : '';
      container.cost = costEl ? costEl.value.trim() : '';

      saveData();
      renderAll();
    }
  });
}

/**
 * Edit Container Details Workflow
 */
function promptEditContainer(id) {
  const container = containers.find(c => c.id === id);
  if (!container) return;

  const html = `
    <div class="modal-form-stack">
      <div class="form-field">
        <label for="edit-ref" class="modal-field-label">${window.t('form.container_ref_label')}</label>
        <input type="text" id="edit-ref" class="input-field" value="${esc(container.containerRef || '')}" required />
      </div>

      <div class="form-field">
        <label for="edit-station" class="modal-field-label">${window.t('form.station_label')}</label>
        <input type="text" id="edit-station" class="input-field" value="${esc(container.station || '')}" required />
      </div>

      <div class="form-field">
        <label for="edit-size" class="modal-field-label">${window.t('form.container_size')}</label>
        <input type="text" id="edit-size" class="input-field" value="${esc(container.size || '')}" required />
      </div>

      <div class="form-field">
        <label for="edit-date-opened" class="modal-field-label">${window.t('form.date_opened')}</label>
        <input type="date" id="edit-date-opened" class="input-field" value="${esc(container.dateOpened || '')}" required />
      </div>

      <div class="form-field">
        <label for="edit-notes" class="modal-field-label">${window.t('form.notes_label')}</label>
        <input type="text" id="edit-notes" class="input-field" value="${esc(container.notes || '')}" />
      </div>
    </div>
  `;

  showModal({
    title: window.t('common.edit'),
    contentHtml: html,
    confirmText: window.t('common.save'),
    confirmClass: 'btn-primary',
    onConfirm: () => {
      const refEl = document.getElementById('edit-ref');
      const stationEl = document.getElementById('edit-station');
      const sizeEl = document.getElementById('edit-size');
      const dateEl = document.getElementById('edit-date-opened');
      const notesEl = document.getElementById('edit-notes');

      if (refEl && refEl.value.trim()) container.containerRef = refEl.value.trim();
      if (stationEl && stationEl.value.trim()) container.station = stationEl.value.trim();
      if (sizeEl && sizeEl.value.trim()) container.size = sizeEl.value.trim();
      if (dateEl && dateEl.value) container.dateOpened = dateEl.value;
      if (notesEl) container.notes = notesEl.value.trim();

      saveData();
      renderAll();
    }
  });
}

/**
 * Add Studio Modal (Improvement G)
 */
function promptAddStudio() {
  const html = `
    <div class="modal-form-stack">
      <div class="form-field">
        <label for="modal-new-studio-name" class="modal-field-label">${window.t('app.modal_add_studio_label')}</label>
        <input type="text" id="modal-new-studio-name" class="input-field" placeholder="${window.t('app.modal_add_studio_placeholder')}" required />
      </div>
      <div class="form-field">
        <label for="modal-new-studio-limit" class="modal-field-label">${window.t('app.studio_limit_label')}</label>
        <input type="number" id="modal-new-studio-limit" class="input-field" min="1" max="365" value="30" />
      </div>
    </div>
  `;

  showModal({
    title: window.t('app.modal_add_studio_title'),
    contentHtml: html,
    confirmText: window.t('app.add_studio_btn'),
    confirmClass: 'btn-primary',
    onConfirm: () => {
      const nameInput = document.getElementById('modal-new-studio-name');
      const limitInput = document.getElementById('modal-new-studio-limit');
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) return;

      const maxOpenDays = limitInput && limitInput.value ? parseInt(limitInput.value, 10) : 30;
      const newStudio = {
        id: 'studio-' + Date.now(),
        name,
        maxOpenDays,
        nextCollectionDate: '',
        nextCollectionNotes: ''
      };

      studios.push(newStudio);
      activeStudioId = newStudio.id;
      saveStudios();
      renderStudioBar();
      renderAll();
    }
  });
}

/**
 * Render Studio Bar & Limit input (Improvements B & G)
 */
function renderStudioBar() {
  const selector = document.getElementById('studio-selector');
  const limitInput = document.getElementById('input-studio-limit');
  if (!selector) return;

  selector.innerHTML = studios.map(s => {
    return `<option value="${esc(s.id)}" ${s.id === activeStudioId ? 'selected' : ''}>${esc(s.name)}</option>`;
  }).join('');

  const currentStudio = getActiveStudio();
  if (limitInput) {
    limitInput.value = currentStudio.maxOpenDays || 30;
  }
}

/**
 * Setup Studio Bar Event Handlers
 */
function setupStudioBarEvents() {
  const selector = document.getElementById('studio-selector');
  const addBtn = document.getElementById('btn-add-studio');
  const limitInput = document.getElementById('input-studio-limit');

  if (selector) {
    selector.addEventListener('change', (e) => {
      activeStudioId = e.target.value;
      saveStudios();
      renderStudioBar();
      renderAll();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', promptAddStudio);
  }

  if (limitInput) {
    limitInput.addEventListener('change', () => {
      const val = parseInt(limitInput.value, 10);
      const currentStudio = getActiveStudio();
      if (val > 0) {
        currentStudio.maxOpenDays = val;
        saveStudios();
        renderAll();
      }
    });
  }
}

/**
 * Setup Language Selector
 */
function setupLanguageSelector() {
  const langSelect = document.getElementById('lang-selector');
  if (!langSelect) return;

  const currentLang = window.APP_LANG || localStorage.getItem('poli_tools_language') || localStorage.getItem(LANG_KEY) || 'en';
  langSelect.value = currentLang;

  langSelect.addEventListener('change', (e) => {
    const nextLang = e.target.value;
    if (window.setLanguage) {
      window.setLanguage(nextLang);
    } else {
      window.APP_LANG = nextLang;
      try {
        localStorage.setItem('poli_tools_language', nextLang);
        localStorage.setItem(LANG_KEY, nextLang);
      } catch (err) {}
      if (document.documentElement) {
        document.documentElement.lang = nextLang;
      }
    }
    applyDeclarativeTranslations();
    renderAll();
  });
}

/**
 * Render Tab 1: Active at Stations Grid (Improvements A & B)
 */
function renderOpenGrid() {
  const grid = document.getElementById('open-containers-grid');
  if (!grid) return;

  const studioContainers = getActiveStudioContainers();
  const openBins = studioContainers.filter(c => c.status === 'in_use');
  const currentStudio = getActiveStudio();
  const maxDays = currentStudio.maxOpenDays || 30;

  if (openBins.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div style="font-weight: 600; margin-top: 0.5rem;">${window.t('open_now.empty')}</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = openBins.map(bin => {
    const days = daysBetween(bin.dateOpened, getLocalToday());
    const isPastLimit = days > maxDays;

    return `
      <div class="open-card ${isPastLimit ? 'is-overdue' : ''}">
        <div class="open-card__header">
          <span class="open-card__station">${esc(bin.station)}</span>
          <span class="badge badge-info">${esc(bin.size)}</span>
        </div>
        
        <div class="open-card__ref">
          <span class="summary-label">${window.t('all.th_id')}:</span> <strong>${esc(bin.containerRef || bin.id)}</strong>
        </div>

        <div class="open-card__dates">
          <div><span class="summary-label">${window.t('open_now.opened_label')}:</span> ${esc(bin.dateOpened)}</div>
          <div><span class="summary-label">${window.t('open_now.days_in_use', { days: String(days) })}</span></div>
        </div>

        ${isPastLimit ? `
          <div class="past-limit-badge">
            ⚠️ ${window.t('open_now.past_limit_badge', { days: String(days), limit: String(maxDays) })}
          </div>
        ` : ''}

        ${bin.notes ? `<div class="open-card__notes">${esc(bin.notes)}</div>` : ''}

        <div class="open-card__actions">
          <button type="button" class="btn btn-warning btn-sm btn-seal" data-id="${esc(bin.id)}">
            ${window.t('open_now.seal_button')}
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-edit" data-id="${esc(bin.id)}">
            ${window.t('common.edit')}
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.btn-seal').forEach(btn => {
    btn.addEventListener('click', () => promptSealContainer(btn.getAttribute('data-id')));
  });
  grid.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => promptEditContainer(btn.getAttribute('data-id')));
  });
}

/**
 * Render Tab 2: Open / Active Containers Lifecycle Table
 */
function renderLifecycleTable() {
  const tbody = document.getElementById('lifecycle-body');
  const emptyState = document.getElementById('table-empty-state');
  if (!tbody) return;

  const studioContainers = getActiveStudioContainers();
  const currentStudio = getActiveStudio();
  const maxDays = currentStudio.maxOpenDays || 30;

  let list = studioContainers.filter(c => c.status === 'in_use' || c.status === 'sealed');

  if (currentFilter !== 'ALL') {
    list = list.filter(c => c.status === currentFilter);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(c => {
      return (
        (c.containerRef && c.containerRef.toLowerCase().includes(q)) ||
        (c.station && c.station.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q)) ||
        (c.sealReason && c.sealReason.toLowerCase().includes(q)) ||
        (c.sealReasonOther && c.sealReasonOther.toLowerCase().includes(q))
      );
    });
  }

  if (list.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('is-hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('is-hidden');

  tbody.innerHTML = list.map(c => {
    const daysInUse = daysBetween(c.dateOpened, c.dateSealed || getLocalToday());
    const isPastLimit = c.status === 'in_use' && daysInUse > maxDays;

    let statusBadge = '';
    if (c.status === 'in_use') {
      statusBadge = `<span class="badge badge-info">${window.t('all.status_in_use')}</span>`;
    } else {
      statusBadge = `<span class="badge badge-warning">${window.t('all.status_sealed')}</span>`;
    }

    let actionsHtml = '';
    if (c.status === 'in_use') {
      actionsHtml = `
        <button type="button" class="btn btn-warning btn-sm btn-table-seal" data-id="${esc(c.id)}">${window.t('all.btn_seal')}</button>
        <button type="button" class="btn btn-secondary btn-sm btn-table-edit" data-id="${esc(c.id)}">${window.t('common.edit')}</button>
      `;
    } else if (c.status === 'sealed') {
      actionsHtml = `
        <button type="button" class="btn btn-primary btn-sm btn-table-collect" data-id="${esc(c.id)}">${window.t('all.btn_collect')}</button>
        <button type="button" class="btn btn-secondary btn-sm btn-table-edit" data-id="${esc(c.id)}">${window.t('common.edit')}</button>
      `;
    }

    return `
      <tr>
        <td><strong>${esc(c.containerRef || c.id)}</strong></td>
        <td>${esc(c.station)}</td>
        <td>${esc(c.size)}</td>
        <td>${statusBadge}</td>
        <td>${esc(c.dateOpened)}</td>
        <td>${c.dateSealed ? esc(c.dateSealed) : '—'}</td>
        <td>
          ${daysInUse}
          ${isPastLimit ? `<br><span class="past-limit-badge">⚠️ ${daysInUse}d > ${maxDays}d</span>` : ''}
        </td>
        <td>${getSealReasonLabel(c)}</td>
        <td><div class="table-actions-cell">${actionsHtml}</div></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-table-seal').forEach(btn => {
    btn.addEventListener('click', () => promptSealContainer(btn.getAttribute('data-id')));
  });
  tbody.querySelectorAll('.btn-table-collect').forEach(btn => {
    btn.addEventListener('click', () => promptCollectContainer(btn.getAttribute('data-id')));
  });
  tbody.querySelectorAll('.btn-table-edit').forEach(btn => {
    btn.addEventListener('click', () => promptEditContainer(btn.getAttribute('data-id')));
  });
}

/**
 * Render Tab 3: Collection Register, Monthly/Yearly Totals, and Printable Sheet (Improvements D & E)
 */
function renderCollectionRegister() {
  const currentStudio = getActiveStudio();
  const studioContainers = getActiveStudioContainers();
  let collected = studioContainers.filter(c => c.status === 'collected');

  if (registerDateFrom) {
    collected = collected.filter(c => c.dateCollected >= registerDateFrom);
  }
  if (registerDateTo) {
    collected = collected.filter(c => c.dateCollected <= registerDateTo);
  }

  collected.sort((a, b) => (b.dateCollected || '').localeCompare(a.dateCollected || ''));

  // Monthly Totals
  const monthlyMap = {};
  collected.forEach(c => {
    const month = (c.dateCollected || '').slice(0, 7) || 'Unknown';
    if (!monthlyMap[month]) {
      monthlyMap[month] = { count: 0, cost: 0, weightCount: 0, weightTotal: 0 };
    }
    monthlyMap[month].count += 1;
    const costNum = parseFloat(c.cost);
    if (!isNaN(costNum)) monthlyMap[month].cost += costNum;
    const weightNum = parseFloat(c.weight);
    if (!isNaN(weightNum)) {
      monthlyMap[month].weightCount += 1;
      monthlyMap[month].weightTotal += weightNum;
    }
  });

  const monthlyTbody = document.getElementById('monthly-totals-body');
  if (monthlyTbody) {
    const months = Object.keys(monthlyMap).sort().reverse();
    if (months.length === 0) {
      monthlyTbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">${window.t('register.no_collections_range')}</td></tr>`;
    } else {
      monthlyTbody.innerHTML = months.map(m => {
        const item = monthlyMap[m];
        return `
          <tr>
            <td><strong>${esc(m)}</strong></td>
            <td>${item.count}</td>
            <td>${item.cost > 0 ? item.cost.toFixed(2) : '—'}</td>
            <td>${item.weightTotal > 0 ? item.weightTotal.toFixed(1) + ' kg' : '—'}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Yearly Totals
  const yearlyMap = {};
  collected.forEach(c => {
    const year = (c.dateCollected || '').slice(0, 4) || 'Unknown';
    if (!yearlyMap[year]) {
      yearlyMap[year] = { count: 0, cost: 0, weightCount: 0, weightTotal: 0 };
    }
    yearlyMap[year].count += 1;
    const costNum = parseFloat(c.cost);
    if (!isNaN(costNum)) yearlyMap[year].cost += costNum;
    const weightNum = parseFloat(c.weight);
    if (!isNaN(weightNum)) {
      yearlyMap[year].weightCount += 1;
      yearlyMap[year].weightTotal += weightNum;
    }
  });

  const yearlyTbody = document.getElementById('yearly-totals-body');
  if (yearlyTbody) {
    const years = Object.keys(yearlyMap).sort().reverse();
    if (years.length === 0) {
      yearlyTbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">${window.t('register.no_collections_range')}</td></tr>`;
    } else {
      yearlyTbody.innerHTML = years.map(y => {
        const item = yearlyMap[y];
        return `
          <tr>
            <td><strong>${esc(y)}</strong></td>
            <td>${item.count}</td>
            <td>${item.cost > 0 ? item.cost.toFixed(2) : '—'}</td>
            <td>${item.weightTotal > 0 ? item.weightTotal.toFixed(1) + ' kg' : '—'}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Printable Register Paper
  const metaStudio = document.getElementById('print-meta-studio');
  const metaDate = document.getElementById('print-meta-date');
  const metaRange = document.getElementById('print-meta-range');
  const summaryBox = document.getElementById('register-summary-box');
  const paperTbody = document.getElementById('register-table-body');

  if (metaStudio) metaStudio.textContent = window.t('register.studio_name', { name: currentStudio.name });
  if (metaDate) metaDate.textContent = window.t('register.generated_on', { date: getLocalToday() });
  if (metaRange) {
    if (registerDateFrom || registerDateTo) {
      metaRange.textContent = window.t('register.date_range', { from: registerDateFrom || 'Start', to: registerDateTo || 'End' });
    } else {
      metaRange.textContent = window.t('register.all_dates');
    }
  }

  let totalCostSum = 0;
  let totalWeightSum = 0;
  collected.forEach(c => {
    const cVal = parseFloat(c.cost);
    if (!isNaN(cVal)) totalCostSum += cVal;
    const wVal = parseFloat(c.weight);
    if (!isNaN(wVal)) totalWeightSum += wVal;
  });

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div class="print-summary-item">
        <span class="print-summary-label">${window.t('register.th_containers')}:</span>
        <span class="print-summary-val">${collected.length}</span>
      </div>
      <div class="print-summary-item">
        <span class="print-summary-label">${window.t('summary.total_cost')}:</span>
        <span class="print-summary-val">${totalCostSum > 0 ? totalCostSum.toFixed(2) : '0.00'}</span>
      </div>
      <div class="print-summary-item">
        <span class="print-summary-label">${window.t('register.th_weight')}:</span>
        <span class="print-summary-val">${totalWeightSum > 0 ? totalWeightSum.toFixed(1) + ' kg' : '—'}</span>
      </div>
    `;
  }

  if (paperTbody) {
    if (collected.length === 0) {
      paperTbody.innerHTML = `<tr><td colspan="10" class="text-muted" style="text-align:center; padding: 1.5rem;">${window.t('register.no_collections_range')}</td></tr>`;
    } else {
      paperTbody.innerHTML = collected.map(c => {
        return `
          <tr>
            <td>${esc(c.dateCollected || '—')}</td>
            <td><strong>${esc(c.containerRef || c.id)}</strong></td>
            <td>${esc(c.station || '—')}</td>
            <td>${esc(c.size || '—')}</td>
            <td>${esc(c.consignmentRef || '—')}</td>
            <td>${esc(c.carrier || '—')}</td>
            <td>${esc(c.filingRef || '—')}</td>
            <td>${formatWeight(c.weight)}</td>
            <td>${formatCost(c.cost)}</td>
            <td>${getSealReasonLabel(c)}</td>
          </tr>
        `;
      }).join('');
    }
  }

  const nextDateInput = document.getElementById('input-next-collection-date');
  const nextNotesInput = document.getElementById('input-next-collection-notes');
  if (nextDateInput && currentStudio.nextCollectionDate) {
    nextDateInput.value = currentStudio.nextCollectionDate;
  }
  if (nextNotesInput && currentStudio.nextCollectionNotes) {
    nextNotesInput.value = currentStudio.nextCollectionNotes;
  }
}

/**
 * Render Tab 4: Archived Containers (Improvement H)
 */
function renderArchiveTable() {
  const tbody = document.getElementById('archive-table-body');
  const emptyState = document.getElementById('archive-empty-state');
  if (!tbody) return;

  const studioContainers = getActiveStudioContainers();
  const collected = studioContainers.filter(c => c.status === 'collected');

  if (collected.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('is-hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('is-hidden');

  tbody.innerHTML = collected.map(c => {
    const timeline = `${esc(c.dateOpened)} → ${esc(c.dateSealed || '—')} → ${esc(c.dateCollected || '—')}`;
    return `
      <tr>
        <td><strong>${esc(c.containerRef || c.id)}</strong></td>
        <td>${esc(c.station)}</td>
        <td>${esc(c.size)}</td>
        <td><span class="summary-sub">${timeline}</span></td>
        <td>${getSealReasonLabel(c)}</td>
        <td>${esc(c.consignmentRef || '—')}</td>
        <td>${esc(c.carrier || '—')}</td>
        <td>${formatCost(c.cost)}</td>
        <td><strong>${esc(c.filingRef || '—')}</strong></td>
      </tr>
    `;
  }).join('');
}

/**
 * Update Top Metric Badges & Summary
 */
function updateMetrics() {
  const studioContainers = getActiveStudioContainers();
  const openCount = studioContainers.filter(c => c.status === 'in_use').length;
  const sealedCount = studioContainers.filter(c => c.status === 'sealed').length;
  const collectedCount = studioContainers.filter(c => c.status === 'collected').length;

  let totalCost = 0;
  studioContainers.forEach(c => {
    const val = parseFloat(c.cost);
    if (!isNaN(val)) totalCost += val;
  });

  const countOpenEl = document.getElementById('count-open');
  const countSealedEl = document.getElementById('count-sealed');
  const countCollectedEl = document.getElementById('count-collected');
  const totalCostValEl = document.getElementById('total-cost-val');
  const badgeOpenCount = document.getElementById('badge-open-count');

  if (countOpenEl) countOpenEl.textContent = openCount;
  if (countSealedEl) countSealedEl.textContent = sealedCount;
  if (countCollectedEl) countCollectedEl.textContent = collectedCount;
  if (totalCostValEl) totalCostValEl.textContent = totalCost.toFixed(2);
  if (badgeOpenCount) badgeOpenCount.textContent = openCount;
}

/**
 * Master Render
 */
function renderAll() {
  updateMetrics();
  renderOpenGrid();
  renderLifecycleTable();
  renderCollectionRegister();
  renderArchiveTable();
}

/**
 * Setup Tabs
 */
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      tabButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const content = document.getElementById(target);
      if (content) content.classList.add('active');
    });
  });
}

/**
 * Setup Add Container Form (Improvements A & B)
 */
function setupAddForm() {
  const btn = document.getElementById('btn-add-container');
  const refInput = document.getElementById('input-container-ref');
  const stationInput = document.getElementById('input-station');
  const sizeSelect = document.getElementById('input-size');
  const dateInput = document.getElementById('input-date-opened');
  const notesInput = document.getElementById('input-notes');
  const errEl = document.getElementById('form-error');

  if (dateInput && !dateInput.value) {
    dateInput.value = getLocalToday();
  }

  if (!btn) return;

  btn.addEventListener('click', () => {
    if (errEl) errEl.textContent = '';

    const containerRef = refInput ? refInput.value.trim() : '';
    const station = stationInput ? stationInput.value.trim() : '';
    const size = sizeSelect ? sizeSelect.value : '';
    const dateOpened = dateInput ? dateInput.value : '';
    const notes = notesInput ? notesInput.value.trim() : '';

    if (!containerRef) {
      if (errEl) errEl.textContent = window.t('validation.error_ref_required');
      return;
    }
    if (!station) {
      if (errEl) errEl.textContent = window.t('validation.error_station_required');
      return;
    }
    if (!size) {
      if (errEl) errEl.textContent = window.t('validation.error_size_required');
      return;
    }
    if (!dateOpened) {
      if (errEl) errEl.textContent = window.t('validation.error_date_opened_required');
      return;
    }

    const newContainer = {
      id: 'BIN-' + Date.now(),
      containerRef,
      station,
      size,
      status: 'in_use',
      dateOpened,
      dateSealed: '',
      sealReason: '',
      sealReasonOther: '',
      dateCollected: '',
      carrier: '',
      consignmentRef: '',
      filingRef: '',
      weight: '',
      cost: '',
      notes,
      studioId: activeStudioId
    };

    containers.unshift(newContainer);
    saveData();

    if (refInput) refInput.value = '';
    if (stationInput) stationInput.value = '';
    if (sizeSelect) sizeSelect.value = '';
    if (dateInput) dateInput.value = getLocalToday();
    if (notesInput) notesInput.value = '';

    renderAll();
  });
}

/**
 * Setup Filter & Search Handlers
 */
function setupFilterHandlers() {
  const searchInput = document.getElementById('search-input');
  const filterStatus = document.getElementById('filter-status');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderLifecycleTable();
    });
  }

  if (filterStatus) {
    filterStatus.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      renderLifecycleTable();
    });
  }

  const dateFromEl = document.getElementById('register-date-from');
  const dateToEl = document.getElementById('register-date-to');
  const filterBtn = document.getElementById('btn-filter-register');
  const showAllBtn = document.getElementById('btn-filter-all-register');
  const printBtn = document.getElementById('btn-trigger-print');

  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      registerDateFrom = dateFromEl ? dateFromEl.value : '';
      registerDateTo = dateToEl ? dateToEl.value : '';
      renderCollectionRegister();
    });
  }

  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      if (dateFromEl) dateFromEl.value = '';
      if (dateToEl) dateToEl.value = '';
      registerDateFrom = '';
      registerDateTo = '';
      renderCollectionRegister();
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
}

/**
 * Calendar .ics Export (Improvement F)
 */
function setupCalendarExport() {
  const nextDateInput = document.getElementById('input-next-collection-date');
  const nextNotesInput = document.getElementById('input-next-collection-notes');
  const exportBtn = document.getElementById('btn-export-ics');

  function persistCalendarInputs() {
    const currentStudio = getActiveStudio();
    if (nextDateInput) currentStudio.nextCollectionDate = nextDateInput.value;
    if (nextNotesInput) currentStudio.nextCollectionNotes = nextNotesInput.value.trim();
    saveStudios();
  }

  if (nextDateInput) nextDateInput.addEventListener('change', persistCalendarInputs);
  if (nextNotesInput) nextNotesInput.addEventListener('input', persistCalendarInputs);

  if (!exportBtn) return;

  exportBtn.addEventListener('click', () => {
    persistCalendarInputs();
    const currentStudio = getActiveStudio();
    const dateVal = nextDateInput ? nextDateInput.value : '';

    if (!dateVal) {
      showModal({
        title: window.t('calendar.title'),
        contentHtml: `<p>${window.t('validation.error_ics_date_required')}</p>`,
        confirmText: window.t('common.confirm'),
        onConfirm: () => {}
      });
      return;
    }

    const cleanDate = dateVal.replace(/-/g, '');
    const notes = nextNotesInput ? nextNotesInput.value.trim() : '';
    const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Poli International//Sharps Disposal Tracker//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:sharps-pickup-${cleanDate}-${Date.now()}@poliinternational.com`,
      `DTSTAMP:${nowIso}`,
      `DTSTART;VALUE=DATE:${cleanDate}`,
      `DTEND;VALUE=DATE:${cleanDate}`,
      `SUMMARY:Sharps Waste Collection - ${currentStudio.name}`,
      `DESCRIPTION:${notes || 'Scheduled pickup'}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sharps-collection-${cleanDate}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/**
 * CSV & JSON Backup / Restore (Improvement H)
 */
function setupBackupHandlers() {
  const exportJsonBtn = document.getElementById('btn-export-json');
  const importJsonBtn = document.getElementById('btn-import-json');
  const jsonFileInput = document.getElementById('json-file-input');

  const exportCsvBtn = document.getElementById('btn-export-csv');
  const importCsvBtn = document.getElementById('btn-import-csv');
  const csvFileInput = document.getElementById('csv-file-input');
  const templateCsvBtn = document.getElementById('btn-template-csv');

  // JSON Backup
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      const currentStudio = getActiveStudio();
      const studioContainers = getActiveStudioContainers();
      const exportPayload = {
        exportVersion: 2,
        exportDate: getLocalToday(),
        studio: currentStudio,
        containers: studioContainers
      };

      const jsonStr = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sharps-backup-${currentStudio.name.toLowerCase().replace(/\s+/g, '-')}-${getLocalToday()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // JSON Restore trigger
  if (importJsonBtn && jsonFileInput) {
    importJsonBtn.addEventListener('click', () => {
      jsonFileInput.value = '';
      jsonFileInput.click();
    });

    jsonFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          let importedContainers = [];

          if (Array.isArray(data)) {
            importedContainers = data;
          } else if (data && Array.isArray(data.containers)) {
            importedContainers = data.containers;
          } else {
            throw new Error('Invalid JSON structure');
          }

          const html = `
            <div class="modal-form-stack">
              <p>${window.t('restore.msg')}</p>
              <div class="radio-choice-group">
                <label class="radio-choice-label">
                  <input type="radio" name="json-restore-mode" value="merge" checked />
                  <div>
                    <strong>${window.t('restore.merge_label')}</strong>
                  </div>
                </label>
                <label class="radio-choice-label">
                  <input type="radio" name="json-restore-mode" value="replace" />
                  <div>
                    <strong>${window.t('restore.replace_label')}</strong>
                  </div>
                </label>
              </div>
            </div>
          `;

          showModal({
            title: window.t('restore.title'),
            contentHtml: html,
            confirmText: window.t('common.confirm'),
            confirmClass: 'btn-primary',
            onConfirm: () => {
              const mode = document.querySelector('input[name="json-restore-mode"]:checked')?.value || 'merge';
              
              const normalized = importedContainers.map(c => ({
                id: c.id || ('BIN-' + Math.random().toString(36).substr(2, 9)),
                containerRef: c.containerRef || c.id || '',
                station: c.station || '',
                size: c.size || '1.0 L',
                status: c.status || 'in_use',
                dateOpened: c.dateOpened || getLocalToday(),
                dateSealed: c.dateSealed || '',
                sealReason: c.sealReason || '',
                sealReasonOther: c.sealReasonOther || '',
                dateCollected: c.dateCollected || '',
                carrier: c.carrier || '',
                consignmentRef: c.consignmentRef || '',
                filingRef: c.filingRef || '',
                weight: c.weight || '',
                cost: c.cost !== undefined ? String(c.cost) : '',
                notes: c.notes || '',
                studioId: activeStudioId
              }));

              if (mode === 'replace') {
                containers = containers.filter(c => c.studioId !== activeStudioId).concat(normalized);
              } else {
                const existingIds = new Set(containers.filter(c => c.studioId === activeStudioId).map(c => c.id));
                const toAdd = normalized.filter(c => !existingIds.has(c.id));
                containers = toAdd.concat(containers);
              }

              saveData();
              renderAll();
            }
          });

        } catch (err) {
          showModal({
            title: window.t('restore.title'),
            contentHtml: `<p>${window.t('restore.invalid_file')}</p>`,
            confirmText: window.t('common.confirm'),
            onConfirm: () => {}
          });
        }
      };
      reader.readAsText(file);
    });
  }

  // CSV Export
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      const currentStudio = getActiveStudio();
      const studioContainers = getActiveStudioContainers();
      const headers = [
        'ContainerRef',
        'Station',
        'Size',
        'Status',
        'DateOpened',
        'DateSealed',
        'SealReason',
        'SealReasonOther',
        'DateCollected',
        'Carrier',
        'ConsignmentRef',
        'FilingRef',
        'Weight',
        'Cost',
        'Notes'
      ];

      const rows = studioContainers.map(c => {
        return [
          c.containerRef || c.id,
          c.station,
          c.size,
          c.status,
          c.dateOpened,
          c.dateSealed,
          c.sealReason,
          c.sealReasonOther,
          c.dateCollected,
          c.carrier,
          c.consignmentRef,
          c.filingRef,
          c.weight,
          c.cost,
          c.notes
        ].map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sharps-register-${currentStudio.name.toLowerCase().replace(/\s+/g, '-')}-${getLocalToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // CSV Template
  if (templateCsvBtn) {
    templateCsvBtn.addEventListener('click', () => {
      const headers = [
        'ContainerRef',
        'Station',
        'Size',
        'Status',
        'DateOpened',
        'DateSealed',
        'SealReason',
        'SealReasonOther',
        'DateCollected',
        'Carrier',
        'ConsignmentRef',
        'FilingRef',
        'Weight',
        'Cost',
        'Notes'
      ];
      const sampleRow = [
        'SC-2026-01',
        'Piercing Room 1',
        '1.0 L',
        'in_use',
        getLocalToday(),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Chairside bin'
      ].map(val => `"${val}"`).join(',');

      const csvContent = [headers.join(','), sampleRow].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sharps-import-template.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // CSV Import
  if (importCsvBtn && csvFileInput) {
    importCsvBtn.addEventListener('click', () => {
      csvFileInput.value = '';
      csvFileInput.click();
    });

    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const lines = event.target.result.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (lines.length <= 1) throw new Error('CSV is empty');

          const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
          const imported = [];

          for (let i = 1; i < lines.length; i++) {
            const row = [];
            let inQuotes = false;
            let cur = '';
            for (let ch of lines[i]) {
              if (ch === '"') {
                inQuotes = !inQuotes;
              } else if (ch === ',' && !inQuotes) {
                row.push(cur.trim());
                cur = '';
              } else {
                cur += ch;
              }
            }
            row.push(cur.trim());

            const cleanRow = row.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
            const getCol = (name) => {
              const idx = header.indexOf(name.toLowerCase());
              return idx >= 0 ? cleanRow[idx] || '' : '';
            };

            const containerRef = getCol('containerref') || getCol('id') || `IMP-${i}`;
            const station = getCol('station') || 'General Station';
            const size = getCol('size') || '1.0 L';
            const status = getCol('status') || 'in_use';
            const dateOpened = getCol('dateopened') || getLocalToday();
            const dateSealed = getCol('datesealed') || '';
            const sealReason = getCol('sealreason') || '';
            const sealReasonOther = getCol('sealreasonother') || '';
            const dateCollected = getCol('datecollected') || '';
            const carrier = getCol('carrier') || '';
            const consignmentRef = getCol('consignmentref') || '';
            const filingRef = getCol('filingref') || '';
            const weight = getCol('weight') || '';
            const cost = getCol('cost') || '';
            const notes = getCol('notes') || '';

            imported.push({
              id: 'BIN-CSV-' + Date.now() + '-' + i,
              containerRef,
              station,
              size,
              status: ['in_use', 'sealed', 'collected'].includes(status) ? status : 'in_use',
              dateOpened,
              dateSealed,
              sealReason,
              sealReasonOther,
              dateCollected,
              carrier,
              consignmentRef,
              filingRef,
              weight,
              cost,
              notes,
              studioId: activeStudioId
            });
          }

          const html = `
            <div class="modal-form-stack">
              <p>${window.t('restore.msg')}</p>
              <div class="radio-choice-group">
                <label class="radio-choice-label">
                  <input type="radio" name="csv-restore-mode" value="merge" checked />
                  <div>
                    <strong>${window.t('restore.merge_label')}</strong>
                  </div>
                </label>
                <label class="radio-choice-label">
                  <input type="radio" name="csv-restore-mode" value="replace" />
                  <div>
                    <strong>${window.t('restore.replace_label')}</strong>
                  </div>
                </label>
              </div>
            </div>
          `;

          showModal({
            title: window.t('restore.title'),
            contentHtml: html,
            confirmText: window.t('common.confirm'),
            confirmClass: 'btn-primary',
            onConfirm: () => {
              const mode = document.querySelector('input[name="csv-restore-mode"]:checked')?.value || 'merge';
              if (mode === 'replace') {
                containers = containers.filter(c => c.studioId !== activeStudioId).concat(imported);
              } else {
                containers = imported.concat(containers);
              }
              saveData();
              renderAll();
            }
          });

        } catch (err) {
          showModal({
            title: window.t('restore.title'),
            contentHtml: `<p>${window.t('restore.invalid_file')}</p>`,
            confirmText: window.t('common.confirm'),
            onConfirm: () => {}
          });
        }
      };
      reader.readAsText(file);
    });
  }
}

/**
 * Setup Modal Close & Confirm Listeners
 */
function setupModalEvents() {
  const cancelBtn = document.getElementById('modal-btn-cancel');
  const confirmBtn = document.getElementById('modal-btn-confirm');
  const backdrop = document.getElementById('modal-backdrop');

  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (typeof modalConfirmCallback === 'function') {
        const cb = modalConfirmCallback;
        modalConfirmCallback = null;
        cb();
      }
      closeModal();
    });
  }
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
  }
}

/**
 * Theme Toggle Handler
 */
function setupThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');

  function updateThemeUI() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    if (themeIcon && themeText) {
      if (currentTheme === 'light') {
        themeIcon.textContent = '🌙';
        themeText.textContent = window.t('app.theme_dark');
      } else {
        themeIcon.textContent = '☀️';
        themeText.textContent = window.t('app.theme_light');
      }
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      updateThemeUI();
    });
  }

  updateThemeUI();
}

/**
 * Translate declarative HTML attributes on load or language change
 */
function applyDeclarativeTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key && window.t) {
      el.textContent = window.t(key);
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key && window.t) {
      el.setAttribute('title', window.t(key));
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && window.t) {
      el.setAttribute('placeholder', window.t(key));
    }
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key && window.t) {
      el.setAttribute('aria-label', window.t(key));
    }
  });
}

window.applyDeclarativeTranslations = applyDeclarativeTranslations;
window.renderAll = renderAll;

/**
 * Application Bootstrap
 */
document.addEventListener('DOMContentLoaded', () => {
  setupLanguageSelector();
  applyDeclarativeTranslations();
  loadData();
  renderStudioBar();
  setupStudioBarEvents();
  setupTabs();
  setupAddForm();
  setupFilterHandlers();
  setupCalendarExport();
  setupBackupHandlers();
  setupModalEvents();
  setupThemeToggle();
  renderAll();
});
