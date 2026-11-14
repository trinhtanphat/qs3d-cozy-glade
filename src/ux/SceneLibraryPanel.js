import {
  createSceneLibraryArchive, validateSceneLibraryArchive,
  commitSceneLibraryArchive, describeSceneLibrary, MAX_LIBRARY_BYTES,
} from './SceneLibraryArchive.js';

function el(tag, cls = '', content) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (content !== undefined) node.textContent = String(content);
  return node;
}
function downloadJSON(json) {
  const href = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const a = el('a');
  a.download = 'qs3d-glade-tat-ca-ban-do-' + new Date().toISOString().slice(0, 10) + '.json';
  a.href = href;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

export function installSceneLibraryPanel({
  autosave, history, presets, getActivePresetId, captureSnapshot, onRestored,
}) {
  const overlay = el('div', 'tg-library-backdrop');
  overlay.id = 'tg-scene-library';
  overlay.hidden = true;

  const panel = el('section', 'tg-library-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'tg-library-title');
  panel.tabIndex = -1;
  const header = el('div', 'tg-library-header');
  const heading = el('div');
  heading.append(el('div', 'tg-library-eyebrow', 'QS3D · STUDIO'));
  const title = el('h2', '', 'Thư viện thiết kế');
  title.id = 'tg-library-title';
  heading.append(title, el('p', '', 'Quản lý bản đồ và sao lưu toàn bộ công trình về thiết bị của bạn.'));
  const close = el('button', 'tg-library-close', 'Đóng ×');
  close.type = 'button';
  close.dataset.action = 'library-close';
  close.setAttribute('aria-label', 'Đóng thư viện thiết kế');
  header.append(heading, close);

  const stats = el('div', 'tg-library-summary');
  stats.setAttribute('aria-live', 'polite');
  const list = el('div', 'tg-library-grid');
  const help = el('p', 'tg-library-help',
    'Thiết kế lưu tại trình duyệt này; không tự đồng bộ tài khoản. Tệp sao lưu chứa bản đồ đang mở và các bản đồ đã lưu.');
  const actions = el('div', 'tg-library-actions');
  const exportBtn = el('button', 'tg-library-primary', '↓ Sao lưu tất cả');
  exportBtn.type = 'button';
  exportBtn.dataset.action = 'library-export';
  const importBtn = el('button', 'tg-library-secondary', '↑ Khôi phục từ tệp');
  importBtn.type = 'button';
  importBtn.dataset.action = 'library-import';
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  fileInput.setAttribute('aria-label', 'Chọn tệp sao lưu các bản đồ');
  actions.append(exportBtn, importBtn, fileInput);
  const status = el('p', 'tg-library-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  panel.append(header, stats, list, help, actions, status);
  overlay.append(panel);
  document.body.append(overlay);

  let previousFocus = null;
  let busy = false;
  const setBusy = (value) => {
    busy = value;
    exportBtn.disabled = value;
    importBtn.disabled = value;
    close.disabled = value;
  };
  const inform = (message, failure = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', failure);
  };
  function refresh() {
    const rows = describeSceneLibrary(autosave, presets, getActivePresetId(), captureSnapshot);
    list.replaceChildren();
    for (const scene of rows) {
      const card = el('article', 'tg-library-item');
      card.append(el('strong', '', scene.label));
      card.append(el('span', 'tg-library-indicator' + (scene.active ? ' is-current' : ''),
        scene.active ? 'Đang mở' : scene.damaged ? 'Bản lưu lỗi' : scene.saved ? 'Đã lưu' : 'Chưa xây'));
      card.append(el('p', '', scene.buildings + ' công trình · ' + scene.paths + ' con đường'));
      if (scene.savedAt && Number.isFinite(scene.savedAt)) {
        const date = new Date(scene.savedAt);
        if (!Number.isNaN(date.getTime())) card.append(el('small', '', 'Lưu: ' + date.toLocaleString('vi-VN')));
      }
      list.append(card);
    }
    stats.textContent = rows.length + ' bản đồ · ' + rows.filter((s) => s.saved).length + ' bản đồ có dữ liệu';
  }
  function open() {
    if (busy) return;
    previousFocus = document.activeElement;
    inform('');
    refresh();
    overlay.hidden = false;
    panel.focus();
  }
  function dismiss() {
    if (busy || overlay.hidden) return;
    overlay.hidden = true;
    previousFocus?.focus?.();
  }
  close.addEventListener('click', dismiss);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) dismiss();
    event.stopPropagation();
  });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); dismiss();
    }
    if (event.key === 'Tab') {
      const available = [close, exportBtn, importBtn].filter((b) => !b.disabled);
      if (event.shiftKey && document.activeElement === available[0]) {
        event.preventDefault(); available[available.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === available[available.length - 1]) {
        event.preventDefault(); available[0].focus();
      }
    }
  });

  exportBtn.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    inform('Đang kiểm tra toàn bộ bản đồ…');
    try {
      const json = await createSceneLibraryArchive({
        autosave, history, presets, activePresetId: getActivePresetId(), captureSnapshot,
      });
      downloadJSON(json);
      inform('Đã tạo tệp sao lưu ' + Math.round(new Blob([json]).size / 1024) + ' KB. Kiểm tra Tải xuống.');
    } catch (error) {
      inform('Không xuất được: ' + error.message + '. Hãy dùng nút Lưu JSON cho bản đồ đang mở.', true);
    } finally { setBusy(false); }
  });
  importBtn.addEventListener('click', () => { if (!busy) fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || busy) return;
    if (file.size > MAX_LIBRARY_BYTES) {
      inform('Tệp vượt giới hạn sao lưu 24 MB.', true);
      return;
    }
    setBusy(true);
    inform('Đang xác thực tất cả bản đồ…');
    try {
      const validated = await validateSceneLibraryArchive(await file.text(), { presets, history });
      const approval = window.confirm(
        'Khôi phục ' + validated.scenes.length + ' bản đồ? Bản lưu trùng tên sẽ bị thay thế. Nên sao lưu hiện tại trước khi tiếp tục.'
      );
      if (!approval) { inform('Đã hủy. Dữ liệu không thay đổi.'); return; }
      const restored = commitSceneLibraryArchive(validated, autosave?.storage);
      autosave?.cancelPending();
      inform('Đã khôi phục ' + restored.restored + ' bản đồ. Đang mở lại game…');
      onRestored?.(restored);
    } catch (error) {
      inform('Khôi phục thất bại: ' + error.message, true);
    } finally { setBusy(false); }
  });

  return { open, close: dismiss, refresh, element: overlay };
}
