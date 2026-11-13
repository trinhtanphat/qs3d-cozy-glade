/**
 * Browser-local, opt-out-by-not-using-storage scene checkpoint.
 * Saves only after explicit world changes / environment controls, not per frame.
 * Does not send gameplay or device information to any remote service.
 */
export const SCENE_AUTOSAVE_KEY = 'qs3d-cozy-glade:scene-autosave-v1';
const AUTOSAVE_FORMAT = 'qs3d-cozy-glade:autosave';
const MAX_AUTOSAVE_LENGTH = 16 * 1024 * 1024;

export class SceneAutosave {
  constructor({ storage = null, history, key = SCENE_AUTOSAVE_KEY,
    delayMs = 1800, setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id) } = {}) {
    this.storage = storage;
    this.history = history;
    this.key = key;
    this.delayMs = delayMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pending = null;
    this.timer = null;
    this.lastError = null;
    this.lastSavedAt = null;
  }

  read() {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      if (raw.length > MAX_AUTOSAVE_LENGTH) throw new Error('Autosave too large');
      const record = JSON.parse(raw);
      if (record?.format !== AUTOSAVE_FORMAT || record.version !== 1 ||
          typeof record.sceneJSON !== 'string' ||
          !Number.isFinite(record.savedAt) || record.sceneJSON.length > MAX_AUTOSAVE_LENGTH) {
        throw new Error('Autosave version or data invalid');
      }
      this.lastError = null;
      return { sceneJSON: record.sceneJSON, presetId: record.presetId,
        savedAt: record.savedAt };
    } catch (error) {
      this.lastError = error;
      return null;
    }
  }

  schedule(capture, presetId = 'qs3d-island') {
    if (!this.storage || typeof capture !== 'function') return false;
    this.pending = { capture, presetId };
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => this.flush(), this.delayMs);
    return true;
  }

  flush() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.pending || !this.storage) return false;
    const { capture, presetId } = this.pending;
    this.pending = null;
    try {
      const sceneJSON = this.history.serializeJSON(capture());
      if (!sceneJSON || sceneJSON.length > MAX_AUTOSAVE_LENGTH) {
        throw new Error('Scene exceeds autosave size limit');
      }
      const savedAt = Date.now();
      const record = { format: AUTOSAVE_FORMAT, version: 1, savedAt,
        presetId: String(presetId), sceneJSON };
      const text = JSON.stringify(record);
      if (text.length > MAX_AUTOSAVE_LENGTH) throw new Error('Autosave exceeds size limit');
      this.storage.setItem(this.key, text);
      this.lastSavedAt = savedAt;
      this.lastError = null;
      return true;
    } catch (error) {
      // Private browsing, blocked storage, quota and JSON failures must never
      // stop interactive gameplay or manual JSON export.
      this.lastError = error;
      return false;
    }
  }

  discard() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.pending = null;
    try {
      this.storage?.removeItem(this.key);
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error;
      return false;
    }
  }
}
