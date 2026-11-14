/**
 * Browser-local, opt-out-by-not-using-storage scene checkpoint.
 * Saves only after explicit world changes / environment controls, not per frame.
 * Does not send gameplay or device information to any remote service.
 */
export const SCENE_AUTOSAVE_KEY = 'qs3d-cozy-glade:scene-autosave-v1';
const AUTOSAVE_FORMAT = 'qs3d-cozy-glade:autosave';
const MAX_AUTOSAVE_LENGTH = 16 * 1024 * 1024;
const SAFE_PRESET_ID = /^[a-z][a-z0-9-]{1,63}$/;

export function sceneSlotKey(presetId) {
  return typeof presetId === 'string' && SAFE_PRESET_ID.test(presetId)
    ? `${SCENE_AUTOSAVE_KEY}:preset:${presetId}` : null;
}

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

  readPresetSlot(presetId) {
    const key = sceneSlotKey(presetId);
    if (!key || !this.storage) return null;
    try {
      const raw = this.storage.getItem(key);
      if (!raw) { this.lastError = null; return null; }
      if (raw.length > MAX_AUTOSAVE_LENGTH) throw new Error('Preset autosave too large');
      const record = JSON.parse(raw);
      if (record?.format !== AUTOSAVE_FORMAT || record.version !== 1 ||
        record.presetId !== presetId || typeof record.sceneJSON !== 'string' ||
        record.sceneJSON.length > MAX_AUTOSAVE_LENGTH || !Number.isFinite(record.savedAt)) {
        throw new Error('Preset autosave version or data invalid');
      }
      this.lastError = null;
      return { sceneJSON: record.sceneJSON, presetId, savedAt: record.savedAt };
    } catch (error) {
      this.lastError = error;
      return null;
    }
  }

  mostRecentCheckpoint(presetIds = []) {
    let newest = this.read();
    let encounteredError = this.lastError;
    for (const presetId of presetIds) {
      const checkpoint = this.readPresetSlot(presetId);
      if (checkpoint && (!newest || checkpoint.savedAt > newest.savedAt)) newest = checkpoint;
      if (this.lastError) encounteredError = this.lastError;
    }
    // Recover a valid map even when the latest-scene pointer was not written
    // because storage quota ran out between the two checkpoint writes.
    this.lastError = newest ? null : encounteredError;
    return newest;
  }

  cancelPending() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.pending = null;
  }

  discardPresetSlot(presetId) {
    const key = sceneSlotKey(presetId);
    if (!key || !this.storage) return false;
    try { this.storage.removeItem(key); this.lastError = null; return true; }
    catch (error) { this.lastError = error; return false; }
  }

  schedule(capture, presetId = 'qs3d-island') {
    if (typeof capture !== 'function') return false;
    // Keep the unsaved scene in memory even if storage is blocked. Callers
    // must be able to warn before switching to another map.
    this.pending = { capture, presetId };
    if (!this.storage) return false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => this.flush(), this.delayMs);
    return true;
  }

  flush() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.pending) return false;
    if (!this.storage) {
      this.lastError = new Error('Browser storage is unavailable');
      return false;
    }
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
      // Write the per-map slot first. If storage quota is exhausted, never
      // move the latest-scene pointer to a new map without a valid map slot.
      const slot = sceneSlotKey(presetId);
      if (slot) this.storage.setItem(slot, text);
      // Legacy latest-scene key remains for backward-compatible boot restore.
      this.storage.setItem(this.key, text);
      this.lastSavedAt = savedAt;
      this.lastError = null;
      return true;
    } catch (error) {
      // Private browsing, blocked storage, quota and JSON failures must never
      // stop interactive gameplay or manual JSON export.
      this.lastError = error;
      // Retain the intended snapshot for explicit retry or manual JSON export.
      // Never silently mark a failed checkpoint as persisted.
      if (!this.pending) this.pending = { capture, presetId };
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
