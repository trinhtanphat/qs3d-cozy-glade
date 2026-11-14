import { SCENE_AUTOSAVE_KEY, sceneSlotKey } from './SceneAutosave.js';

export const SCENE_LIBRARY_FORMAT = 'qs3d-cozy-glade-library';
export const SCENE_LIBRARY_VERSION = 1;
export const MAX_LIBRARY_BYTES = 24 * 1024 * 1024;
const MAX_SCENE_BYTES = 16 * 1024 * 1024;
const MAX_LIBRARY_SCENES = 10;
const DENIED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const utf8Length = (text) => new TextEncoder().encode(text).length;

function sceneIds(presets) {
  const ids = (presets || []).map((p) => typeof p === 'string' ? p : p?.id);
  if (!ids.length || ids.length > MAX_LIBRARY_SCENES ||
      ids.some((id) => !sceneSlotKey(id)) || new Set(ids).size !== ids.length) {
    throw new Error('Invalid preset list');
  }
  return ids;
}

function recordFor(sceneJSON, presetId, savedAt = Date.now()) {
  return {
    format: 'qs3d-cozy-glade:autosave', version: 1,
    savedAt, presetId, sceneJSON,
  };
}

/** Creates a portable, local-only snapshot of all known maps. */
export async function createSceneLibraryArchive({
  autosave, history, presets, activePresetId, captureSnapshot,
}) {
  const ids = sceneIds(presets);
  if (!ids.includes(activePresetId) || typeof captureSnapshot !== 'function') {
    throw new Error('Invalid active scene');
  }
  const latest = autosave?.read();
  const scenes = [];
  for (const presetId of ids) {
    let sceneJSON;
    if (presetId === activePresetId) {
      // Prefer live data even if the browser storage quota is exhausted.
      sceneJSON = history.serializeJSON(captureSnapshot());
    } else {
      const slot = autosave?.readPresetSlot(presetId);
      if (autosave?.lastError) {
        throw new Error('Stored map is damaged: ' + presetId);
      }
      sceneJSON = slot?.sceneJSON || (latest?.presetId === presetId ? latest.sceneJSON : null);
    }
    if (!sceneJSON) continue;
    if (utf8Length(sceneJSON) > MAX_SCENE_BYTES) throw new Error('Map backup exceeds 16 MB');
    // Do not silently pack corrupt saves into an archive.
    await history.importJSON(sceneJSON);
    scenes.push({ presetId, sceneJSON });
  }
  const archive = {
    format: SCENE_LIBRARY_FORMAT, version: SCENE_LIBRARY_VERSION,
    exportedAt: new Date().toISOString(), activePresetId, scenes,
  };
  const json = JSON.stringify(archive);
  if (utf8Length(json) > MAX_LIBRARY_BYTES) throw new Error('Library backup exceeds 24 MB');
  return json;
}

/** Parse + validate *every* map before any localStorage mutation occurs. */
export async function validateSceneLibraryArchive(raw, { presets, history }) {
  if (typeof raw !== 'string' || utf8Length(raw) > MAX_LIBRARY_BYTES) {
    throw new Error('Backup file is missing or exceeds 24 MB');
  }
  const allowed = new Set(sceneIds(presets));
  let archive;
  try {
    archive = JSON.parse(raw, (key, value) => {
      if (DENIED_KEYS.has(key)) throw new Error('Unsafe JSON member');
      return value;
    });
  } catch {
    throw new Error('Invalid or unsafe library JSON');
  }
  if (!archive || typeof archive !== 'object' || Array.isArray(archive) ||
      archive.format !== SCENE_LIBRARY_FORMAT || archive.version !== SCENE_LIBRARY_VERSION ||
      !Array.isArray(archive.scenes) || archive.scenes.length < 1 ||
      archive.scenes.length > allowed.size || !allowed.has(archive.activePresetId)) {
    throw new Error('Unsupported library backup');
  }
  const seen = new Set();
  const scenes = [];
  for (const item of archive.scenes) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !allowed.has(item.presetId) || seen.has(item.presetId) ||
        typeof item.sceneJSON !== 'string' || utf8Length(item.sceneJSON) > MAX_SCENE_BYTES) {
      throw new Error('Duplicate, unknown, or oversized map in backup');
    }
    seen.add(item.presetId);
    // Existing importer enforces scene structure, typed-array bounds and
    // prototype pollution protection. Do not duplicate those rules.
    await history.importJSON(item.sceneJSON);
    scenes.push({ presetId: item.presetId, sceneJSON: item.sceneJSON });
  }
  if (!seen.has(archive.activePresetId)) {
    throw new Error('Active map is missing from backup');
  }
  return { activePresetId: archive.activePresetId, scenes };
}

/**
 * Restore all listed maps with best-effort transactional rollback.
 * Unknown/unlisted maps are not changed. Never reload until success.
 */
export function commitSceneLibraryArchive(validated, storage, now = Date.now()) {
  if (!storage || !validated?.scenes?.length ||
      !validated.scenes.some((s) => s.presetId === validated.activePresetId)) {
    throw new Error('No valid scene library or available browser storage');
  }
  const values = new Map();
  for (const scene of validated.scenes) {
    const key = sceneSlotKey(scene.presetId);
    if (!key || typeof scene.sceneJSON !== 'string') throw new Error('Invalid map slot');
    values.set(key, JSON.stringify(recordFor(scene.sceneJSON, scene.presetId, now)));
  }
  const active = validated.scenes.find((s) => s.presetId === validated.activePresetId);
  values.set(SCENE_AUTOSAVE_KEY, JSON.stringify(recordFor(active.sceneJSON, validated.activePresetId, now)));
  const oldValues = new Map();
  try {
    for (const key of values.keys()) oldValues.set(key, storage.getItem(key));
  } catch {
    throw new Error('Could not inspect existing browser backups');
  }
  const applied = [];
  try {
    for (const [key, value] of values) {
      storage.setItem(key, value);
      applied.push(key);
    }
  } catch (error) {
    const failed = [];
    for (const key of applied.reverse()) {
      try {
        const old = oldValues.get(key);
        if (old === null) storage.removeItem(key);
        else storage.setItem(key, old);
      } catch {
        failed.push(key);
      }
    }
    if (failed.length) {
      throw new Error('Import failed; rollback incomplete. Preserve existing JSON backups.');
    }
    throw new Error('Import failed; original local saves were restored.');
  }
  return { restored: validated.scenes.length, activePresetId: validated.activePresetId };
}

export function describeSceneLibrary(autosave, presets, activePresetId, captureSnapshot) {
  return (presets || []).map((preset) => {
    const active = preset.id === activePresetId;
    const saved = active ? null : autosave?.readPresetSlot(preset.id);
    const current = active ? captureSnapshot() : null;
    let scene = current;
    if (!active && saved?.sceneJSON) {
      try { scene = JSON.parse(saved.sceneJSON)?.scene; }
      catch { scene = null; }
    }
    return {
      id: preset.id,
      label: preset.label,
      active,
      saved: active || !!saved,
      savedAt: active ? (autosave?.lastSavedAt || null) : (saved?.savedAt || null),
      buildings: Array.isArray(scene?.arch?.buildings) ? scene.arch.buildings.length : 0,
      paths: Array.isArray(scene?.arch?.paths) ? scene.arch.paths.length : 0,
      damaged: !active && !!autosave?.lastError,
    };
  });
}
