/* ============================================================
   화면 설계 템플릿 — 공용 셸 스크립트
   각 기획서 repo는 같은 폴더에 이 파일을 두고 <script src> 로 참조한다.
   이 스크립트는 TEMPLATE_CONFIG 가 인라인으로 먼저 정의된 상태에서 로드되어야 한다.
   ============================================================ */

// Capture clean HTML for self-export (before any runtime mutation)
const ORIGINAL_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

// Apply config
document.title = TEMPLATE_CONFIG.PAGE_TITLE;
document.getElementById('bar-title').textContent = `📋 ${TEMPLATE_CONFIG.PAGE_TITLE}`;

/* ============================================================
   State
   ============================================================
   fileData — HTML 정본의 data (versions, current, nextId)
   draft    — localStorage의 편집 중 상태 (specs, baseVersion, nextId, lastModified)
   currentViewVersion — 지금 화면에 표시 중인 버전 id (null = 최신+draft)
   ============================================================ */
const STORAGE_KEY = TEMPLATE_CONFIG.STORAGE_KEY;
let fileData = loadFileData();
let draft = loadDraft();
let currentViewVersion = null;
let isDirty = false;
let compareMode = false;
let currentPinId = null;
let isEditMode = false;
let placingPin = false;

/* ============================================================
   URL param gate
   ============================================================ */
const urlParams = new URLSearchParams(location.search);
const canEdit = urlParams.get('edit') === '1';
if (canEdit) {
  document.getElementById('edit-toggle-group').style.display = 'flex';
}

/* ============================================================
   Data loading
   ============================================================ */
function loadFileData() {
  try {
    const parsed = JSON.parse(document.getElementById('spec-data').textContent);
    if (!Array.isArray(parsed.versions)) parsed.versions = [];
    if (typeof parsed.nextId !== 'number') parsed.nextId = 1;
    if (parsed.current === undefined) parsed.current = null;
    return parsed;
  } catch (e) {
    console.warn('Load file data failed:', e);
    return { versions: [], current: null, nextId: 1 };
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Load draft failed:', e);
    return null;
  }
}

function saveDraftLocal() {
  if (!draft) { localStorage.removeItem(STORAGE_KEY); return; }
  draft.lastModified = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (e) { console.warn('Save draft failed:', e); }
}

function clearDraft() {
  draft = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  setDirty(false);
}

/* ============================================================
   Specs access — source of current visible specs
   ============================================================ */
function getCurrentSpecs() {
  // Viewing a specific version → that version's specs (read-only)
  if (currentViewVersion) {
    const v = fileData.versions.find(v => v.id === currentViewVersion);
    return v ? v.specs : {};
  }
  // Live view: draft if exists, else latest version
  if (draft) return draft.specs;
  if (fileData.current) {
    const v = fileData.versions.find(v => v.id === fileData.current);
    return v ? v.specs : {};
  }
  return {};
}

function isReadOnlyView() {
  // Read-only when viewing any specific saved version
  return !!currentViewVersion;
}

/* ============================================================
   Draft creation/mutation
   ============================================================ */
function ensureDraft() {
  if (draft) return;
  const baseSpecs = fileData.current
    ? (fileData.versions.find(v => v.id === fileData.current)?.specs || {})
    : {};
  draft = {
    specs: structuredClone(baseSpecs),
    baseVersion: fileData.current,
    nextId: fileData.nextId,
    lastModified: new Date().toISOString()
  };
}

function mutateDraft(fn) {
  ensureDraft();
  fn(draft);
  saveDraftLocal();
  setDirty(true);
}

/* ============================================================
   Dirty / save indicator
   ============================================================ */
function setDirty(val) {
  isDirty = val;
  updateSaveIndicator();
}

function updateSaveIndicator(overrideState, overrideText) {
  const el = document.getElementById('save-indicator');
  el.classList.remove('saved', 'dirty', 'draft-saved', 'version-saved', 'readonly');
  if (overrideState) {
    el.classList.add(overrideState);
    el.innerHTML = overrideText;
    return;
  }
  if (isReadOnlyView()) {
    el.classList.add('readonly');
    el.innerHTML = '👁️ 읽기 전용';
    return;
  }
  if (isDirty) {
    el.classList.add('dirty');
    el.innerHTML = '<span class="dot"></span>미저장';
    return;
  }
  el.classList.add('saved');
  el.innerHTML = '<span class="dot"></span>저장됨';
}

function flashSaveIndicator(type, text) {
  updateSaveIndicator(type, text);
  setTimeout(() => updateSaveIndicator(), 3000);
}

/* ============================================================
   Version helpers
   ============================================================ */
function parseVersion(id) {
  const m = id?.match(/^v(\d+)\.(\d+)$/);
  return m ? { major: parseInt(m[1]), minor: parseInt(m[2]) } : null;
}

function computeNextVersionId(current, type) {
  if (!current) return 'v0.1';
  const v = parseVersion(current);
  if (!v) return 'v0.1';
  if (type === 'major') return `v${v.major + 1}.0`;
  return `v${v.major}.${v.minor + 1}`;
}

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}일 전`;
  return d.toISOString().slice(0, 10);
}

function authorLabel(author) {
  return author === 'claude' ? '🤖 Claude' : '✏️ 편집모드';
}

/* ============================================================
   Change computation (for diff display + changes array)
   ============================================================ */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function computeChanges(oldSpecs, newSpecs) {
  const changes = [];
  const oldIds = new Set(Object.keys(oldSpecs));
  const newIds = new Set(Object.keys(newSpecs));

  for (const id of newIds) {
    if (!oldIds.has(id)) changes.push({ pin: parseInt(id), action: '추가' });
  }
  for (const id of oldIds) {
    if (!newIds.has(id)) changes.push({ pin: parseInt(id), action: '삭제' });
  }
  for (const id of newIds) {
    if (!oldIds.has(id)) continue;
    const o = oldSpecs[id], n = newSpecs[id];
    if (o.title !== n.title) changes.push({ pin: parseInt(id), field: '제목', action: '수정' });
    if (o.role !== n.role) changes.push({ pin: parseInt(id), field: '역할', action: '수정' });
    if (!deepEqual(o.states, n.states)) changes.push({ pin: parseInt(id), field: '상태', action: '수정' });
    if (!deepEqual(o.props, n.props)) changes.push({ pin: parseInt(id), field: '속성', action: '수정' });
    if (o.confluence !== n.confluence) changes.push({ pin: parseInt(id), field: 'Confluence', action: '수정' });
    if (!deepEqual(o.position, n.position)) changes.push({ pin: parseInt(id), field: '위치', action: '수정' });
  }
  return changes;
}

function computeDiffMap(newSpecs, oldSpecs) {
  // Returns { pinId: { action, fields[] } }
  const map = {};
  const oldIds = new Set(Object.keys(oldSpecs));
  const newIds = new Set(Object.keys(newSpecs));

  for (const id of newIds) {
    if (!oldIds.has(id)) { map[id] = { action: '추가' }; continue; }
    const o = oldSpecs[id], n = newSpecs[id];
    const fields = [];
    if (o.title !== n.title) fields.push('제목');
    if (o.role !== n.role) fields.push('역할');
    if (!deepEqual(o.states, n.states)) fields.push('상태');
    if (!deepEqual(o.props, n.props)) fields.push('속성');
    if (o.confluence !== n.confluence) fields.push('Confluence');
    if (fields.length) map[id] = { action: '수정', fields };
  }
  for (const id of oldIds) {
    if (!newIds.has(id)) map[id] = { action: '삭제', removedSpec: oldSpecs[id] };
  }
  return map;
}

function getBaselineSpecs() {
  // For compare mode: baseline specs to compare against current view
  if (currentViewVersion) {
    // Viewing specific version → baseline = version right before it
    const idx = fileData.versions.findIndex(v => v.id === currentViewVersion);
    if (idx > 0) return fileData.versions[idx - 1].specs;
    return null;
  }
  // Live view with draft → baseline = draft's base version (or latest)
  if (draft) {
    const baseId = draft.baseVersion || fileData.current;
    if (!baseId) return null;
    const v = fileData.versions.find(v => v.id === baseId);
    return v ? v.specs : null;
  }
  // Live view without draft → baseline = prev of latest
  const idx = fileData.versions.findIndex(v => v.id === fileData.current);
  if (idx > 0) return fileData.versions[idx - 1].specs;
  return null;
}

function getBaselineLabel() {
  if (currentViewVersion) {
    const idx = fileData.versions.findIndex(v => v.id === currentViewVersion);
    if (idx > 0) return fileData.versions[idx - 1].id;
    return null;
  }
  if (draft) return draft.baseVersion || fileData.current;
  const idx = fileData.versions.findIndex(v => v.id === fileData.current);
  if (idx > 0) return fileData.versions[idx - 1].id;
  return null;
}

function getCurrentLabel() {
  if (currentViewVersion) return currentViewVersion;
  return draft ? '📋 draft' : (fileData.current || '(없음)');
}

/* ============================================================
   Pin rendering
   ============================================================ */
function renderAllPins() {
  document.querySelectorAll('.spec-pin').forEach(p => p.remove());
  const specs = getCurrentSpecs();
  Object.entries(specs).forEach(([id, data]) => renderPin(id, data));
  // Compare mode: also show ghosts for removed pins
  if (compareMode) applyDiffVisuals();
}

function renderPin(id, data) {
  const component = document.querySelector(`[data-component="${data.component}"]`);
  if (!component) return;
  const pin = document.createElement('span');
  pin.className = 'spec-pin';
  pin.id = `pin-${id}`;
  pin.dataset.pin = id;
  pin.textContent = id;
  pin.style.left = `${data.position.x}px`;
  pin.style.top = `${data.position.y}px`;
  component.appendChild(pin);
  attachPinHandlers(pin, id);
}

function renderGhostPin(id, data) {
  const component = document.querySelector(`[data-component="${data.component}"]`);
  if (!component) return;
  const pin = document.createElement('span');
  pin.className = 'spec-pin diff-removed';
  pin.dataset.pin = id;
  pin.dataset.ghost = '1';
  pin.textContent = id;
  pin.style.left = `${data.position.x}px`;
  pin.style.top = `${data.position.y}px`;
  pin.style.display = 'inline-flex';
  component.appendChild(pin);
}

function attachPinHandlers(pin, id) {
  let startX, startY, startPinX, startPinY;
  let didDrag = false;

  pin.addEventListener('mousedown', (e) => {
    if (!isEditMode || isReadOnlyView()) return;
    e.preventDefault();
    e.stopPropagation();
    didDrag = false;
    startX = e.clientX;
    startY = e.clientY;
    startPinX = parseFloat(pin.style.left);
    startPinY = parseFloat(pin.style.top);
    pin.classList.add('dragging');

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!didDrag && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) didDrag = true;
      pin.style.left = `${startPinX + dx}px`;
      pin.style.top = `${startPinY + dy}px`;
    };
    const onUp = () => {
      pin.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (didDrag) {
        mutateDraft(d => {
          d.specs[id].position = {
            x: parseFloat(pin.style.left),
            y: parseFloat(pin.style.top)
          };
        });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    if (didDrag) { didDrag = false; return; }
    focusPin(id);
  });
}

/* ============================================================
   Diff visuals (compare mode)
   ============================================================ */
function applyDiffVisuals() {
  // Clear old ghost pins
  document.querySelectorAll('.spec-pin[data-ghost="1"]').forEach(p => p.remove());
  document.querySelectorAll('.spec-pin').forEach(p => p.classList.remove('diff-added', 'diff-modified'));

  if (!compareMode) {
    updateCompareSummary(null);
    return;
  }

  const baseline = getBaselineSpecs();
  if (baseline === null) {
    updateCompareSummary({ noBaseline: true });
    return;
  }

  const current = getCurrentSpecs();
  const diff = computeDiffMap(current, baseline);

  Object.entries(diff).forEach(([pinId, info]) => {
    if (info.action === '추가') {
      document.getElementById(`pin-${pinId}`)?.classList.add('diff-added');
    } else if (info.action === '수정') {
      document.getElementById(`pin-${pinId}`)?.classList.add('diff-modified');
    } else if (info.action === '삭제' && info.removedSpec) {
      renderGhostPin(pinId, info.removedSpec);
    }
  });

  updateCompareSummary({ diff });
}

function updateCompareSummary(info) {
  const bar = document.getElementById('compare-summary');
  const text = document.getElementById('compare-summary-text');
  if (!compareMode) {
    document.body.classList.remove('compare-mode');
    return;
  }
  document.body.classList.add('compare-mode');
  if (info?.noBaseline) {
    text.textContent = '비교할 이전 버전이 없습니다';
    return;
  }
  if (!info?.diff) { text.textContent = '비교 중…'; return; }
  const d = info.diff;
  let added = 0, modified = 0, removed = 0;
  Object.values(d).forEach(x => {
    if (x.action === '추가') added++;
    else if (x.action === '수정') modified++;
    else if (x.action === '삭제') removed++;
  });
  const baseLabel = getBaselineLabel();
  const currLabel = getCurrentLabel();
  if (added + modified + removed === 0) {
    text.textContent = `${baseLabel} → ${currLabel}: 변경 없음`;
  } else {
    const parts = [];
    if (modified) parts.push(`핀 ${modified}개 수정`);
    if (added) parts.push(`${added}개 추가`);
    if (removed) parts.push(`${removed}개 삭제`);
    text.textContent = `${baseLabel} → ${currLabel}: ${parts.join(', ')}`;
  }
}

/* ============================================================
   Panel — 항상 노출 + 아코디언 (핀별)
   ============================================================ */
const panel = document.getElementById('spec-panel');
const panelBody = document.getElementById('panel-body');
const expandedPins = new Set();   // 펼침 상태인 핀 id
const deletePinDialog = document.getElementById('delete-pin-dialog');
const deletePinDesc = document.getElementById('delete-pin-desc');

function focusPin(id) {
  const sid = String(id);
  currentPinId = sid;
  expandedPins.add(sid);
  renderPanel();

  // 핀 강조
  document.querySelectorAll('.spec-pin').forEach(p => p.classList.remove('active'));
  document.getElementById(`pin-${sid}`)?.classList.add('active');

  // 해당 아코디언 항목으로 스크롤
  setTimeout(() => {
    const accEl = panelBody.querySelector(`.pin-accordion[data-pin="${sid}"]`);
    accEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 30);
}

function renderPanel() {
  const specs = getCurrentSpecs();
  const editable = isEditMode && !isReadOnlyView();
  const ids = Object.keys(specs).sort((a, b) => parseInt(a) - parseInt(b));

  if (ids.length === 0) {
    panelBody.innerHTML = `<div class="panel-empty">아직 핀이 없습니다.${editable ? '<br>편집 도구의 <b>+ 새 핀</b>으로 추가하세요.' : ''}</div>`;
    return;
  }

  // diff 정보 (compare 모드일 때)
  let diffMap = {};
  if (compareMode) {
    const baseline = getBaselineSpecs();
    if (baseline !== null) diffMap = computeDiffMap(specs, baseline);
  }

  panelBody.innerHTML = ids.map(id => {
    const data = specs[id];
    const expanded = expandedPins.has(id);
    const active = currentPinId === id;
    const diff = diffMap[id];
    const diffClass = diff?.action === '추가' ? 'diff-added'
      : diff?.action === '수정' ? 'diff-modified'
      : '';
    const hasDiff = !!diff;

    return `
      <div class="pin-accordion ${expanded ? 'expanded' : ''} ${active ? 'active' : ''} ${diffClass} ${hasDiff ? 'has-diff' : ''}" data-pin="${id}">
        <div class="pin-accordion-header" data-toggle="${id}">
          <span class="pin-accordion-arrow">▸</span>
          <span class="spec-panel-number">${id}</span>
          <span class="pin-accordion-title ${editable ? 'editable' : ''}" data-field="title" data-pin="${id}" data-placeholder="컴포넌트 이름" contenteditable="${editable}">${escapeHTML(data.title || '')}</span>
          ${editable ? `<div class="pin-accordion-actions"><button class="panel-icon-btn danger" data-action="delete" data-pin="${id}" title="핀 삭제">🗑</button></div>` : ''}
        </div>
        ${diff?.action === '추가' ? `<div class="pin-accordion-diff-summary">✨ ${getBaselineLabel()} 대비 추가됨</div>` : ''}
        ${diff?.action === '수정' && diff.fields?.length ? `<div class="pin-accordion-diff-summary">✏️ 변경: ${diff.fields.join(', ')}</div>` : ''}
        <div class="pin-accordion-body">${renderPinSections(id, data, editable, diff)}</div>
      </div>
    `;
  }).join('');

  bindPanelEvents();
}

function renderPinSections(id, data, editable, diff) {
  const fieldHasDiff = (f) => diff?.fields?.includes(f) ? 'diff-field' : '';
  return `
    <div class="spec-section ${fieldHasDiff('역할')}" data-section="role" data-pin="${id}">
      <div class="spec-section-title">역할 <span class="diff-tag">수정됨</span></div>
      <div class="spec-section-content editable" data-field="role" data-pin="${id}" data-placeholder="이 컴포넌트의 역할" contenteditable="${editable}">${escapeHTML(data.role || '')}</div>
    </div>

    <div class="spec-section ${fieldHasDiff('상태')}" data-section="states" data-pin="${id}">
      <div class="spec-section-title">상태 / 변형 <span class="diff-tag">수정됨</span></div>
      <ul class="spec-list">
        ${(data.states || []).map((s, i) => `
          <li>
            <span class="spec-list-text editable" data-field="states" data-pin="${id}" data-index="${i}" data-placeholder="상태 설명" contenteditable="${editable}">${escapeHTML(s)}</span>
            <button class="spec-list-delete" data-delete="states" data-pin="${id}" data-index="${i}" title="삭제">✕</button>
          </li>
        `).join('')}
      </ul>
      <button class="add-item-btn" data-add="states" data-pin="${id}">+ 상태 추가</button>
    </div>

    <div class="spec-section ${fieldHasDiff('속성')}" data-section="props" data-pin="${id}">
      <div class="spec-section-title">주요 속성 <span class="diff-tag">수정됨</span></div>
      <div>
        ${(data.props || []).map(([k, v], i) => `
          <div class="prop-row">
            <span class="prop-key editable" data-field="props-key" data-pin="${id}" data-index="${i}" data-placeholder="속성명" contenteditable="${editable}">${escapeHTML(k)}</span>
            <span class="prop-value editable" data-field="props-value" data-pin="${id}" data-index="${i}" data-placeholder="값" contenteditable="${editable}">${escapeHTML(v)}</span>
            <button class="spec-list-delete" data-delete="props" data-pin="${id}" data-index="${i}" title="삭제">✕</button>
          </div>
        `).join('')}
      </div>
      <button class="add-item-btn" data-add="props" data-pin="${id}">+ 속성 추가</button>
    </div>

    <div class="spec-section ${fieldHasDiff('Confluence')}" data-section="confluence" data-pin="${id}">
      <div class="spec-section-title">자세한 정책 <span class="diff-tag">수정됨</span></div>
      <div class="spec-confluence-link">
        📄 <span class="editable" data-field="confluence" data-pin="${id}" data-placeholder="Confluence 경로" contenteditable="${editable}">${escapeHTML(data.confluence || '')}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: auto; flex-shrink: 0;">
          <path d="M7 17L17 7M7 7h10v10"/>
        </svg>
      </div>
    </div>
  `;
}

function bindPanelEvents() {
  // 헤더 클릭 → 아코디언 토글 (편집 가능 영역/액션 버튼 클릭은 무시)
  panelBody.querySelectorAll('.pin-accordion-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.editable')) return;
      if (e.target.closest('[data-action]')) return;
      const id = header.dataset.toggle;
      const acc = header.parentElement;
      const willExpand = !acc.classList.contains('expanded');
      acc.classList.toggle('expanded', willExpand);
      if (willExpand) expandedPins.add(id); else expandedPins.delete(id);
    });
  });
  // 핀 삭제 버튼
  panelBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.pin;
      currentPinId = id;
      const title = getCurrentSpecs()[id]?.title || '(이름 없음)';
      deletePinDesc.textContent = `핀 ${id} "${title}"을(를) 삭제할까요?`;
      deletePinDialog.classList.add('open');
    });
  });
  // 편집 핸들러
  panelBody.querySelectorAll('.editable').forEach(el => {
    el.addEventListener('blur', handleEditBlur);
    // 제목 영역에서 Enter 누르면 줄바꿈 대신 blur
    if (el.classList.contains('pin-accordion-title')) {
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); }
      });
    }
  });
  // 항목 추가/삭제
  panelBody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', handleDelete);
  });
  panelBody.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', handleAdd);
  });
}

function handleEditBlur(e) {
  if (!isEditMode || isReadOnlyView()) return;
  const el = e.target;
  const pinId = el.dataset.pin;
  if (!pinId) return;
  const field = el.dataset.field;
  const value = el.textContent.trim();
  mutateDraft(d => {
    const spec = d.specs[pinId];
    if (!spec) return;
    if (field === 'title') spec.title = value;
    else if (field === 'role' || field === 'confluence') spec[field] = value;
    else if (field === 'states') spec.states[el.dataset.index] = value;
    else if (field === 'props-key') spec.props[el.dataset.index][0] = value;
    else if (field === 'props-value') spec.props[el.dataset.index][1] = value;
  });
  if (compareMode) { applyDiffVisuals(); renderPanel(); }
}

function handleDelete(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const type = btn.dataset.delete;
  const idx = parseInt(btn.dataset.index);
  const pinId = btn.dataset.pin;
  if (!pinId) return;
  mutateDraft(d => {
    d.specs[pinId][type].splice(idx, 1);
  });
  renderPanel();
  if (compareMode) applyDiffVisuals();
}

function handleAdd(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const type = btn.dataset.add;
  const pinId = btn.dataset.pin;
  if (!pinId) return;
  mutateDraft(d => {
    if (type === 'states') d.specs[pinId].states.push('새 상태');
    else if (type === 'props') d.specs[pinId].props.push(['새 속성', '값']);
  });
  expandedPins.add(pinId);
  renderPanel();
  setTimeout(() => {
    const accEl = panelBody.querySelector(`.pin-accordion[data-pin="${pinId}"]`);
    if (!accEl) return;
    const els = accEl.querySelectorAll(`[data-field^="${type}"]`);
    if (els.length) {
      const target = els[els.length - (type === 'props' ? 2 : 1)];
      target?.focus();
      document.execCommand?.('selectAll');
    }
  }, 50);
  if (compareMode) applyDiffVisuals();
}

/* ============================================================
   Pin delete confirmation
   ============================================================ */
document.getElementById('delete-pin-cancel').addEventListener('click', () => {
  deletePinDialog.classList.remove('open');
});
document.getElementById('delete-pin-confirm').addEventListener('click', () => {
  const id = currentPinId;
  mutateDraft(d => { delete d.specs[id]; });
  expandedPins.delete(id);
  currentPinId = null;
  deletePinDialog.classList.remove('open');
  renderAllPins();
  renderPanel();
});

/* ============================================================
   Mode toggles
   ============================================================ */
const specToggle = document.getElementById('spec-toggle');
const specToggleLabel = document.getElementById('spec-toggle-label');
const editToggle = document.getElementById('edit-toggle');
const compareToggle = document.getElementById('compare-toggle');

// 번호 표시를 디폴트로 활성화
document.body.classList.add('spec-mode');

function updateSpecToggleLabel(active) {
  specToggleLabel.textContent = active ? '번호 표시' : '번호 숨김';
}
updateSpecToggleLabel(specToggle.classList.contains('active'));

specToggle.addEventListener('click', () => {
  const active = specToggle.classList.toggle('active');
  document.body.classList.toggle('spec-mode', active);
  updateSpecToggleLabel(active);
  if (!active && isEditMode) editToggle.click();
});

editToggle.addEventListener('click', () => {
  if (!canEdit) return;
  if (isReadOnlyView() && !isEditMode) {
    // Can't enter edit mode when viewing past version
    alert('과거 버전에서는 편집할 수 없습니다. 최신 버전으로 이동 후 편집하세요.');
    return;
  }
  isEditMode = editToggle.classList.toggle('active');
  document.body.classList.toggle('edit-mode', isEditMode);
  if (isEditMode && !specToggle.classList.contains('active')) specToggle.click();
  renderPanel();
});

compareToggle.addEventListener('click', () => {
  if (compareToggle.classList.contains('disabled')) return;
  compareMode = compareToggle.classList.toggle('active');
  applyDiffVisuals();
  renderPanel();
});

function updateCompareToggleAvailability() {
  // Enable compare toggle if there's a baseline available
  const hasBaseline = getBaselineSpecs() !== null;
  compareToggle.classList.toggle('disabled', !hasBaseline);
  if (!hasBaseline && compareMode) {
    compareMode = false;
    compareToggle.classList.remove('active');
    applyDiffVisuals();
  }
}

/* ============================================================
   New pin placement
   ============================================================ */
const btnNewPin = document.getElementById('btn-new-pin');

btnNewPin.addEventListener('click', () => {
  placingPin = !placingPin;
  document.body.classList.toggle('pin-placing', placingPin);
});

document.addEventListener('click', (e) => {
  if (!placingPin) return;
  const component = e.target.closest('[data-component]');
  if (!component) return;
  e.preventDefault();
  e.stopPropagation();

  const rect = component.getBoundingClientRect();
  const x = e.clientX - rect.left - 12;
  const y = e.clientY - rect.top - 12;

  ensureDraft();
  const id = draft.nextId++;
  draft.specs[id] = {
    title: '새 컴포넌트',
    component: component.dataset.component,
    position: { x, y },
    role: '',
    states: [],
    props: [],
    confluence: ''
  };
  saveDraftLocal();
  setDirty(true);
  renderAllPins();
  placingPin = false;
  document.body.classList.remove('pin-placing');
  focusPin(String(id));
  setTimeout(() => {
    const titleEl = panelBody.querySelector(`.pin-accordion[data-pin="${id}"] .pin-accordion-title`);
    titleEl?.focus();
    document.execCommand?.('selectAll');
  }, 100);
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && placingPin) {
    placingPin = false;
    document.body.classList.remove('pin-placing');
  }
});

/* ============================================================
   Version dropdown
   ============================================================ */
const versionSelect = document.getElementById('version-select');
const versionMenu = document.getElementById('version-menu');

versionSelect.addEventListener('click', (e) => {
  e.stopPropagation();
  const showing = versionMenu.style.display !== 'none';
  if (showing) { versionMenu.style.display = 'none'; return; }
  renderVersionMenu();
  versionMenu.style.display = 'block';
});

document.addEventListener('click', () => { versionMenu.style.display = 'none'; });

function renderVersionMenu() {
  const items = [];
  // Draft item (always shown when draft exists, regardless of current view)
  if (draft) {
    const active = !currentViewVersion;
    const dt = formatRelative(draft.lastModified);
    items.push(`
      <div class="version-menu-item draft-item ${active ? 'active' : ''}" data-target="draft">
        <div class="v-title">📋 내 편집 (draft)</div>
        <div class="v-sub">${dt} · ✏️ 편집모드${draft.baseVersion ? ` · ${draft.baseVersion} 기준` : ''}</div>
      </div>
    `);
  }
  // Versions (newest first)
  const versions = [...fileData.versions].reverse();
  if (versions.length === 0 && !draft) {
    versionMenu.innerHTML = '<div class="version-menu-empty">아직 저장된 버전이 없습니다.<br>편집 후 📌 버전 저장을 눌러보세요.</div>';
    return;
  }
  versions.forEach(v => {
    const active = (currentViewVersion === v.id) || (!currentViewVersion && !draft && v.id === fileData.current);
    const rel = formatRelative(v.timestamp);
    const memo = v.memo ? `<div class="v-memo">— ${escapeHTML(v.memo)}</div>` : '';
    items.push(`
      <div class="version-menu-item ${active ? 'active' : ''}" data-target="${v.id}">
        <div class="v-title">${v.id}${v.id === fileData.current ? ' · 최신' : ''}</div>
        <div class="v-sub">${rel} · ${authorLabel(v.author)}</div>
        ${memo}
      </div>
    `);
  });
  versionMenu.innerHTML = items.join('');
  versionMenu.querySelectorAll('.version-menu-item').forEach(el => {
    el.addEventListener('click', () => {
      const target = el.dataset.target;
      switchToVersion(target);
      versionMenu.style.display = 'none';
    });
  });
}

function switchToVersion(target) {
  currentPinId = null;
  if (target === 'draft') {
    currentViewVersion = null;
  } else {
    currentViewVersion = target;
    // Entering read-only view: turn off edit mode
    if (isEditMode) {
      isEditMode = false;
      editToggle.classList.remove('active');
      document.body.classList.remove('edit-mode');
    }
  }
  document.body.classList.toggle('readonly-view', isReadOnlyView());
  renderVersionLabel();
  renderAllPins();
  renderPanel();
  updateCompareToggleAvailability();
  if (compareMode) applyDiffVisuals();
  updateSaveIndicator();
}

function renderVersionLabel() {
  if (currentViewVersion) {
    versionSelect.textContent = `${currentViewVersion} ▾`;
    versionSelect.classList.remove('empty');
    return;
  }
  if (draft) {
    versionSelect.textContent = '📋 draft ▾';
    versionSelect.classList.remove('empty');
    return;
  }
  if (fileData.current) {
    versionSelect.textContent = `${fileData.current} ▾`;
    versionSelect.classList.remove('empty');
  } else {
    versionSelect.textContent = '(버전 없음) ▾';
    versionSelect.classList.add('empty');
  }
}

document.getElementById('goto-latest-btn').addEventListener('click', () => {
  // "최신으로 이동" → go back to live view (draft or latest)
  switchToVersion('draft');
});

/* ============================================================
   Self-export HTML
   ============================================================ */
function exportHtml(filenameSuffix) {
  const dataJson = JSON.stringify(fileData, null, 2);
  const newHtml = ORIGINAL_HTML.replace(
    /(<script type="application\/json" id="spec-data">)[\s\S]*?(<\/script>)/,
    `$1\n${dataJson}\n$2`
  );
  const blob = new Blob([newHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `${STORAGE_KEY}_${filenameSuffix || date}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   💾 Save draft (to HTML draft slot)
   ============================================================ */
document.getElementById('btn-save-draft').addEventListener('click', () => {
  if (!draft) {
    flashSaveIndicator('saved', '<span class="dot"></span>변경 없음');
    return;
  }
  fileData.draft = {
    specs: structuredClone(draft.specs),
    baseVersion: draft.baseVersion,
    nextId: draft.nextId,
    savedAt: new Date().toISOString()
  };
  exportHtml(`draft_${new Date().toISOString().slice(0,10)}`);
  // Draft is now authoritative in the HTML file — clear localStorage
  // (keep `draft` in memory so user can continue editing)
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  setDirty(false);
  const time = new Date().toTimeString().slice(0, 5);
  flashSaveIndicator('draft-saved', `💾 작업본 저장됨 · ${time}`);
});

/* ============================================================
   📌 Save version (new version to VERSIONS[])
   ============================================================ */
const saveVersionDialog = document.getElementById('save-version-dialog');

document.getElementById('btn-save-version').addEventListener('click', () => {
  if (!draft && fileData.versions.length > 0) {
    alert('저장할 변경사항이 없습니다. 먼저 편집을 해주세요.');
    return;
  }
  // Preview version id
  const minor = computeNextVersionId(fileData.current, 'minor');
  const major = computeNextVersionId(fileData.current, 'major');
  document.getElementById('label-minor-preview').textContent = fileData.current ? `(${fileData.current} → ${minor})` : `(첫 버전: ${minor})`;
  document.getElementById('label-major-preview').textContent = fileData.current ? `(${fileData.current} → ${major})` : `(첫 버전은 메이저 불가)`;
  // If no current version, force minor
  const majorRadio = document.querySelector('input[name="version-type"][value="major"]');
  const minorRadio = document.querySelector('input[name="version-type"][value="minor"]');
  if (!fileData.current) {
    majorRadio.disabled = true;
    minorRadio.checked = true;
  } else {
    majorRadio.disabled = false;
  }
  document.getElementById('version-memo').value = '';
  saveVersionDialog.classList.add('open');
  setTimeout(() => document.getElementById('version-memo').focus(), 50);
});

document.getElementById('save-version-cancel').addEventListener('click', () => {
  saveVersionDialog.classList.remove('open');
});

document.getElementById('save-version-confirm').addEventListener('click', () => {
  const type = document.querySelector('input[name="version-type"]:checked').value;
  const memo = document.getElementById('version-memo').value.trim();
  commitNewVersion({ type, memo, author: 'manual' });
  saveVersionDialog.classList.remove('open');
});

function commitNewVersion({ type, memo, author }) {
  const prevSpecs = fileData.current
    ? (fileData.versions.find(v => v.id === fileData.current)?.specs || {})
    : {};
  const newSpecs = draft ? draft.specs : (fileData.current ? prevSpecs : {});
  const newId = computeNextVersionId(fileData.current, type);
  const changes = computeChanges(prevSpecs, newSpecs);

  fileData.versions.push({
    id: newId,
    timestamp: new Date().toISOString(),
    author: author || 'manual',
    memo: memo || '',
    specs: structuredClone(newSpecs),
    changes
  });
  fileData.current = newId;
  if (draft) fileData.nextId = draft.nextId;
  fileData.draft = null;

  // Clear draft
  clearDraft();

  exportHtml(newId);
  currentViewVersion = null;
  renderVersionLabel();
  renderAllPins();
  renderPanel();
  updateCompareToggleAvailability();
  flashSaveIndicator('version-saved', `📌 ${newId} 저장됨`);
}

/* ============================================================
   Reset (clear draft)
   ============================================================ */
const resetDialog = document.getElementById('reset-dialog');
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!draft) {
    alert('초기화할 편집 내용이 없습니다.');
    return;
  }
  resetDialog.classList.add('open');
});
document.getElementById('reset-cancel').addEventListener('click', () => {
  resetDialog.classList.remove('open');
});
document.getElementById('reset-confirm').addEventListener('click', () => {
  clearDraft();
  currentPinId = null;
  expandedPins.clear();
  renderVersionLabel();
  renderAllPins();
  renderPanel();
  updateCompareToggleAvailability();
  resetDialog.classList.remove('open');
});

/* ============================================================
   Conflict dialog
   ============================================================ */
const conflictDialog = document.getElementById('conflict-dialog');

function showConflictDialog() {
  document.getElementById('conflict-base').textContent = draft?.baseVersion || '(없음)';
  document.getElementById('conflict-current').textContent = fileData.current || '(없음)';
  conflictDialog.classList.add('open');
}

document.getElementById('conflict-discard').addEventListener('click', () => {
  clearDraft();
  conflictDialog.classList.remove('open');
  renderAllPins();
  renderPanel();
  renderVersionLabel();
  updateSaveIndicator();
});

document.getElementById('conflict-commit').addEventListener('click', () => {
  // Rebase draft's baseVersion to current, then open save version dialog
  if (draft) draft.baseVersion = fileData.current;
  saveDraftLocal();
  conflictDialog.classList.remove('open');
  // Open save version dialog
  document.getElementById('btn-save-version').click();
});

/* ============================================================
   Draft restore dialog
   ============================================================ */
const draftDialog = document.getElementById('draft-dialog');
document.getElementById('draft-discard').addEventListener('click', () => {
  clearDraft();
  draftDialog.classList.remove('open');
  renderAllPins();
  renderPanel();
  renderVersionLabel();
  updateSaveIndicator();
  updateCompareToggleAvailability();
});
document.getElementById('draft-restore').addEventListener('click', () => {
  draftDialog.classList.remove('open');
  setDirty(true);
  renderAllPins();
  renderPanel();
  renderVersionLabel();
  updateCompareToggleAvailability();
});

function showDraftRestoreDialog() {
  const rel = formatRelative(draft.lastModified);
  const pinCount = Object.keys(draft.specs || {}).length;
  document.getElementById('draft-dialog-desc').textContent =
    `${rel}에 편집하던 내용이 있습니다 (핀 ${pinCount}개). 이어서 작업하시겠어요?`;
  draftDialog.classList.add('open');
}

/* ============================================================
   beforeunload warning
   ============================================================ */
window.addEventListener('beforeunload', (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

/* ============================================================
   Helpers
   ============================================================ */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ============================================================
   Bootstrap
   ============================================================ */
function bootstrap() {
  // Distinguish: localStorage draft (possibly interrupted session) vs fileData.draft (from prior 💾)
  let hasLocalDraft = !!draft;

  if (!draft && fileData.draft) {
    // Silent restore from HTML's draft slot (saved via 💾 previously)
    draft = {
      specs: structuredClone(fileData.draft.specs),
      baseVersion: fileData.draft.baseVersion,
      nextId: fileData.draft.nextId,
      lastModified: fileData.draft.savedAt
    };
    saveDraftLocal();
  }

  // Conflict detection: draft's base version doesn't match HTML's current
  if (draft && fileData.current && draft.baseVersion && draft.baseVersion !== fileData.current) {
    showConflictDialog();
  } else if (hasLocalDraft) {
    // Only prompt when localStorage had an existing unsaved draft
    const pinCount = Object.keys(draft.specs || {}).length;
    if (pinCount > 0) {
      setDirty(true);  // localStorage draft = unsaved work
      showDraftRestoreDialog();
    }
  }

  renderVersionLabel();
  renderAllPins();
  renderPanel();
  updateCompareToggleAvailability();
  updateSaveIndicator();
}

bootstrap();
