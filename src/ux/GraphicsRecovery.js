/**
 * Graceful, user-controlled recovery when WebGL2 cannot start or the browser
 * loses its graphics context. No automatic reload loops, no server writes.
 */
export function installGraphicsRecovery({ canvas, overlay, statusEl, onReload, onContextLost }) {
  if (!canvas || !overlay || !statusEl) throw new Error('Graphics recovery requires canvas and loading UI');
  const doc = overlay.ownerDocument;
  const retry = doc.createElement('button');
  retry.id = 'graphics-retry';
  retry.type = 'button';
  retry.textContent = 'Thử lại đồ họa';
  retry.title = 'Tải lại đồ họa trên trình duyệt này';
  retry.hidden = true;
  retry.setAttribute('aria-label', 'Thử lại đồ họa WebGL2');
  overlay.append(retry);

  const exportBtn = doc.createElement('button');
  exportBtn.id = 'graphics-backup';
  exportBtn.type = 'button';
  exportBtn.textContent = 'Tải bản thiết kế dự phòng';
  exportBtn.title = 'Xuất cảnh đang mở thành tệp JSON trước khi tải lại';
  exportBtn.hidden = true;
  overlay.append(exportBtn);

  let lost = false;
  let backup = null;
  const showFailure = (message) => {
    overlay.classList.remove('is-hidden');
    overlay.classList.add('has-error');
    statusEl.textContent = String(message);
    retry.hidden = false;
    exportBtn.hidden = typeof backup !== 'function';
  };
  const onLost = (event) => {
    // Prevent default so the browser is permitted to restore the context.
    event.preventDefault();
    lost = true;
    try { onContextLost?.(); } catch { /* Do not hide the failure message. */ }
    showFailure('Kết nối với GPU đã bị gián đoạn. Thiết kế được giữ trên thiết bị khi có thể. Hãy tải JSON dự phòng hoặc thử lại đồ họa.');
  };
  const onRestored = () => {
    if (!lost) return;
    showFailure('GPU đã phản hồi trở lại. Hãy tải lại đồ họa để khởi tạo cảnh 3D an toàn.');
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  retry.addEventListener('click', () => {
    try { onReload?.(); } catch {
      showFailure('Chưa thể tải lại đồ họa. Hãy xuất JSON dự phòng trước khi thử lại.');
    }
  });
  exportBtn.addEventListener('click', () => {
    try { backup?.(); } catch {
      showFailure('Xuất JSON chưa thành công. Không tải lại trang khi chưa có bản sao lưu.');
    }
  });

  return {
    get isLost() { return lost; },
    showFailure,
    suspend() { lost = true; },
    setBackupHandler(callback) {
      backup = typeof callback === 'function' ? callback : null;
      if (!retry.hidden) exportBtn.hidden = !backup;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      retry.remove();
      exportBtn.remove();
    },
  };
}
