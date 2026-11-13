/**
 * HistoryManager.js
 * Deep-cloned state stack (max 40 steps) for world + arch + env snapshots,
 * plus lossless JSON scene export & import (supporting TypedArrays & plain objects).
 */

const TYPED_ARRAY_CTORS = {
  Float32Array,
  Float64Array,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
};


const MAX_SCENE_IMPORT_BYTES = 16 * 1024 * 1024;
const MAX_SCENE_IMPORT_DEPTH = 48;
const MAX_SCENE_IMPORT_NODES = 300000;
// Keep scene imports bounded to a number of objects the interactive
// WebGL editor can realistically rebuild, not merely a byte-size cap.
export const SCENE_ENTITY_LIMITS = Object.freeze({
  buildings: 200,
  walls: 400,
  paths: 256,
  clutter: 1200,
  trees: 600,
  bushes: 600,
  flowers: 4000,
  boulders: 600,
  pathPoints: 512,
});
const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function validateSceneSnapshot(snapshot) {
  if (!isRecord(snapshot) || !isRecord(snapshot.world) || !isRecord(snapshot.arch)) {
    throw new Error('Scene must contain world and arch objects.');
  }
  if (snapshot.env !== undefined && !isRecord(snapshot.env)) {
    throw new Error('Scene environment must be an object.');
  }
  for (const key of ['terrain', 'foliage']) {
    if (snapshot.world[key] !== undefined && !isRecord(snapshot.world[key])) {
      throw new Error('Scene world.' + key + ' must be an object.');
    }
  }
  for (const key of ['buildings', 'walls', 'paths', 'clutter']) {
    if (snapshot.arch[key] !== undefined && !Array.isArray(snapshot.arch[key])) {
      throw new Error('Scene arch.' + key + ' must be an array.');
    }
  }

  for (const [key, limit] of Object.entries(SCENE_ENTITY_LIMITS)) {
    if (key === 'pathPoints') continue;
    const source = ['buildings', 'walls', 'paths', 'clutter'].includes(key)
      ? snapshot.arch : snapshot.world.foliage;
    const list = source?.[key];
    if (list !== undefined) {
      if (!Array.isArray(list) || list.length > limit) {
        throw new Error('Scene entity count exceeds limit for ' + key + '.');
      }
    }
  }
  const terrainPaths = snapshot.world.terrain?.paths;
  if (terrainPaths !== undefined &&
      (!Array.isArray(terrainPaths) || terrainPaths.length > SCENE_ENTITY_LIMITS.paths)) {
    throw new Error('Scene terrain paths exceed limit.');
  }
  for (const list of [snapshot.arch.walls, snapshot.arch.paths, terrainPaths]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!isRecord(item) || !Array.isArray(item.points) ||
          item.points.length > SCENE_ENTITY_LIMITS.pathPoints) {
        throw new Error('Scene path exceeds allowed geometry complexity.');
      }
    }
  }

  // A bounded, iterative scan prevents deep recursion, huge scene trees,
  // prototype pollution keys and NaN/Infinity from reaching WebGL geometry.
  const stack = [{ value: snapshot, depth: 0, key: '' }];
  let visited = 0;
  while (stack.length) {
    const { value, depth, key } = stack.pop();
    if (++visited > MAX_SCENE_IMPORT_NODES || depth > MAX_SCENE_IMPORT_DEPTH) {
      throw new Error('Scene exceeds complexity or nesting limits.');
    }
    // Random seeds are unsigned 32-bit values (up to 4294967295); do not
    // confuse those with unbounded coordinates or geometry dimensions.
    const validSeed = key === 'seed' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
    if (typeof value === 'number' && (!Number.isFinite(value) || (Math.abs(value) > 1e7 && !validSeed))) {
      throw new Error('Scene contains a non-finite number.');
    }
    if (typeof value === 'string' && value.length > 2_000_000) {
      throw new Error('Scene contains an excessively long string.');
    }
    if (value === null || typeof value !== 'object') continue;
    if (ArrayBuffer.isView(value)) {
      if (value.length > 262144) throw new Error('Scene typed array is too large.');
      for (let i = 0; i < value.length; i++) {
        if (!Number.isFinite(value[i])) throw new Error('Scene typed array contains invalid numbers.');
      }
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 100000) throw new Error('Scene array is too large.');
      for (const item of value) stack.push({ value: item, depth: depth + 1, key: '' });
      continue;
    }
    if (!isRecord(value)) throw new Error('Scene has an unsupported object type.');
    for (const key of Object.keys(value)) {
      if (DANGEROUS_JSON_KEYS.has(key)) throw new Error('Scene contains a forbidden key.');
      stack.push({ value: value[key], depth: depth + 1, key });
    }
  }
  return snapshot;
}

function deepCloneSnapshot(value) {
  if (value === null || typeof value !== 'object') return value;

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fallback to manual recursive clone if non-cloneable field exists
    }
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return new value.constructor(value);
  }
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = deepCloneSnapshot(value[i]);
    }
    return out;
  }

  const out = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (typeof v !== 'function') {
      out[key] = deepCloneSnapshot(v);
    }
  }
  return out;
}

function snapshotsEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const aView = ArrayBuffer.isView(a) && !(a instanceof DataView);
  const bView = ArrayBuffer.isView(b) && !(b instanceof DataView);
  if (aView || bView) {
    if (!aView || !bView || a.constructor !== b.constructor || a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!snapshotsEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!snapshotsEqual(a[k], b[k])) return false;
  }
  return true;
}

function jsonReplacer(_key, value) {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const ctorName = value.constructor?.name;
    if (ctorName && TYPED_ARRAY_CTORS[ctorName]) {
      // Round Float32 slightly for compact human-friendly JSON files while staying sub-millimeter accurate
      const arr = new Array(value.length);
      if (ctorName === 'Float32Array' || ctorName === 'Float64Array') {
        for (let i = 0; i < value.length; i++) {
          arr[i] = Math.round(value[i] * 10000) / 10000;
        }
      } else {
        for (let i = 0; i < value.length; i++) {
          arr[i] = value[i];
        }
      }
      return { __typedArray: ctorName, data: arr };
    }
  }
  return value;
}

function jsonReviver(_key, value) {
  if (
    value &&
    typeof value === 'object' &&
    typeof value.__typedArray === 'string' &&
    Array.isArray(value.data) &&
    TYPED_ARRAY_CTORS[value.__typedArray]
  ) {
    if (value.data.length > 262144) throw new Error('Scene typed array is too large.');
    const Ctor = TYPED_ARRAY_CTORS[value.__typedArray];
    return new Ctor(value.data);
  }
  return value;
}

export class HistoryManager {
  constructor(maxSteps = 40) {
    this.maxSteps = Math.max(1, Number(maxSteps) || 40);
    this._undoStack = [];
    this._redoStack = [];
    // Automatically adapts to both pre-mutation pushState and baseline+post-mutation pushState
    this._postStateMode = false;
  }

  /**
   * Optional explicit baseline initializer for post-mutation history tracking.
   */
  setBaseline(snapshot) {
    if (!snapshot) return;
    this._undoStack = [deepCloneSnapshot(snapshot)];
    this._redoStack = [];
    this._postStateMode = true;
  }

  /**
   * Pushes a deep-cloned snapshot onto the undo stack and clears redo history.
   */
  pushState(snapshot) {
    if (!snapshot) return;
    const cloned = deepCloneSnapshot(snapshot);

    if (this._undoStack.length > 0) {
      const top = this._undoStack[this._undoStack.length - 1];
      if (snapshotsEqual(top, cloned)) {
        return;
      }
    }

    this._undoStack.push(cloned);
    this._redoStack.length = 0;

    const cap = this._postStateMode ? this.maxSteps + 1 : this.maxSteps;
    while (this._undoStack.length > cap) {
      this._undoStack.shift();
    }
  }

  /**
   * Reverts to the previous snapshot, storing currentSnapshot on the redo stack.
   * Works seamlessly whether callers push state before edits OR push state after edits.
   */
  undo(currentSnapshot) {
    if (this._undoStack.length === 0) return null;

    if (currentSnapshot !== undefined && currentSnapshot !== null) {
      const top = this._undoStack[this._undoStack.length - 1];
      if (snapshotsEqual(top, currentSnapshot)) {
        // Post-mutation stack mode: top of undoStack IS the current live state
        this._postStateMode = true;
        if (this._undoStack.length < 2) {
          return null;
        }
        const poppedCurrent = this._undoStack.pop();
        this._redoStack.push(poppedCurrent);
        while (this._redoStack.length > this.maxSteps) {
          this._redoStack.shift();
        }
        const prev = this._undoStack[this._undoStack.length - 1];
        return deepCloneSnapshot(prev);
      }

      // Pre-mutation stack mode: top of undoStack is the state prior to currentSnapshot
      const prev = this._undoStack.pop();
      this._redoStack.push(deepCloneSnapshot(currentSnapshot));
      while (this._redoStack.length > this.maxSteps) {
        this._redoStack.shift();
      }
      return deepCloneSnapshot(prev);
    }

    // Fallback when called without currentSnapshot
    this._postStateMode = true;
    if (this._undoStack.length < 2) {
      return null;
    }
    const current = this._undoStack.pop();
    this._redoStack.push(current);
    return deepCloneSnapshot(this._undoStack[this._undoStack.length - 1]);
  }

  /**
   * Re-applies the next undone snapshot from the redo stack.
   */
  redo(currentSnapshot) {
    if (this._redoStack.length === 0) return null;

    const next = this._redoStack.pop();

    if (this._postStateMode || currentSnapshot === undefined || currentSnapshot === null) {
      this._undoStack.push(deepCloneSnapshot(next));
      const cap = this.maxSteps + 1;
      while (this._undoStack.length > cap) {
        this._undoStack.shift();
      }
      return deepCloneSnapshot(next);
    }

    // Pre-mutation stack mode: push currentSnapshot back onto undoStack
    this._undoStack.push(deepCloneSnapshot(currentSnapshot));
    while (this._undoStack.length > this.maxSteps) {
      this._undoStack.shift();
    }
    return deepCloneSnapshot(next);
  }

  canUndo() {
    return this._postStateMode ? this._undoStack.length > 1 : this._undoStack.length > 0;
  }

  canRedo() {
    return this._redoStack.length > 0;
  }

  clear() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._postStateMode = false;
  }

  /**
   * Downloads snapshot as a formatted JSON file in the browser.
   */
  serializeJSON(snapshot) {
    if (!snapshot) return '';
    const payload = {
      format: 'tiny-glade-scene',
      version: 1,
      exportedAt: new Date().toISOString(),
      scene: deepCloneSnapshot(snapshot),
    };
    return JSON.stringify(payload, jsonReplacer, 2);
  }

  /** Downloads a scene file without coupling autosave to browser downloads. */
  exportJSON(snapshot, filename = 'tiny-glade-scene.json') {
    const json = this.serializeJSON(snapshot);
    if (!json) return '';

    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'tiny-glade-scene.json';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    return json;
  }

  /**
   * Reads and parses an exported JSON File/Blob (or JSON string) back into a scene snapshot.
   */
  async importJSON(file) {
    if (!file) {
      throw new Error('No scene file provided.');
    }

    if (typeof file?.size === 'number' && file.size > MAX_SCENE_IMPORT_BYTES) {
      throw new Error('Scene file exceeds 16 MB safety limit.');
    }
    let rawText = '';
    if (typeof file === 'string') {
      rawText = file;
    } else if (typeof file.text === 'function') {
      rawText = await file.text();
    } else if (typeof FileReader !== 'undefined') {
      rawText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read scene JSON file.'));
        reader.readAsText(file);
      });
    } else {
      throw new Error('Unsupported file input for importJSON.');
    }

    if (new TextEncoder().encode(rawText).byteLength > MAX_SCENE_IMPORT_BYTES) {
      throw new Error('Scene file exceeds 16 MB safety limit.');
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText, (key, value) => {
        if (DANGEROUS_JSON_KEYS.has(key)) throw new Error('Forbidden JSON key');
        return jsonReviver(key, value);
      });
    } catch {
      throw new Error('Invalid JSON in scene file.');
    }

    if (!isRecord(parsed)) throw new Error('Scene JSON root must be an object.');
    if (parsed.format !== undefined && parsed.format !== 'tiny-glade-scene') {
      throw new Error('Unsupported scene format.');
    }
    if (parsed.format === 'tiny-glade-scene' && parsed.version !== 1) {
      throw new Error('Unsupported scene version.');
    }

    // Accept both the versioned export envelope and a direct world/arch snapshot.
    const snapshot = parsed.format === 'tiny-glade-scene' ? parsed.scene : parsed;
    validateSceneSnapshot(snapshot);
    return deepCloneSnapshot(snapshot);
  }
}
