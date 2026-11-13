/**
 * One-way quality fallback for weak GPUs.
 * Never counteracts a player's explicit graphics preference.
 */
export const QUALITY_ORDER = Object.freeze(['eco', 'balanced', 'high', 'ultra']);

export class AdaptiveQuality {
  constructor({ minFps = 23, consecutive = 3, cooldownMs = 8000, startTime = 0 } = {}) {
    this.minFps = minFps;
    this.consecutive = consecutive;
    this.cooldownMs = cooldownMs;
    this.lastChange = startTime;
    this.lowWindows = 0;
    this.isManual = false;
  }
  manualOverride() {
    this.isManual = true;
    this.lowWindows = 0;
  }
  observe({fps, now, quality}) {
    if (this.isManual || !Number.isFinite(fps) || !Number.isFinite(now)) return null;
    if (fps >= this.minFps) { this.lowWindows = 0; return null; }
    if (now - this.lastChange < this.cooldownMs) return null;
    if (++this.lowWindows < this.consecutive) return null;
    this.lowWindows = 0;
    const idx = QUALITY_ORDER.indexOf(quality);
    if (idx <= 0) return null;
    const next = QUALITY_ORDER[idx - 1];
    this.lastChange = now;
    return next;
  }
}

// Prefer a practical starter tier for explicitly identified legacy integrated
// GPUs. The renderer string stays client-local and is never transmitted.
export function recommendedQualityForRenderer(defaultQuality, rendererName = '') {
  const name = typeof rendererName === 'string' ? rendererName : '';
  const legacyIntel = /Intel(?:\(R\))?\s+(?:UHD\s+Graphics\s+6(?:0|1|2|3)0|HD\s+Graphics\s+[456]\d\d)\b/i;
  return legacyIntel.test(name) ? 'eco' : defaultQuality;
}
