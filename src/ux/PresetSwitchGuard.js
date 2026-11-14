/**
 * Prevent an autosave failure from silently throwing away a user's work
 * when a different preset is selected.
 */
export function maySwitchPreset({ autosave, confirmDiscard, onCancel }) {
  if (!autosave?.pending) return true;
  if (autosave.flush()) return true;
  if (typeof confirmDiscard !== 'function' || !confirmDiscard()) {
    onCancel?.();
    return false;
  }
  // Only explicit user approval allows losing an unsaved in-memory checkpoint.
  autosave.cancelPending();
  return true;
}
