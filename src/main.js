import { createRendererPipeline } from './engine/RendererPipeline.js';
import { AdaptiveQuality, recommendedQualityForRenderer } from './engine/AdaptiveQuality.js';
import { ArchitectureManager } from './arch/ArchitectureManager.js';
import { WorldManager } from './world/WorldManager.js';
import { AudioEngine } from './ux/AudioEngine.js';
import { HistoryManager } from './ux/HistoryManager.js';
import { SceneAutosave } from './ux/SceneAutosave.js';
import { PRESET_SCENES, buildPresetScene } from './ux/PresetScenes.js';
import { HUDController } from './ux/HUDController.js';
import { CameraController } from './game/CameraController.js';
import { InteractionController } from './game/InteractionController.js';

const WORLD_SIZE = 120;
const WATER_LEVEL = -0.35;

function setLoadingError(message) {
  const overlay = document.getElementById('loading-overlay');
  const statusEl = document.getElementById('loading-status');
  if (overlay) overlay.classList.add('has-error');
  if (statusEl) statusEl.textContent = message;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay || overlay.classList.contains('is-hidden')) return;
  overlay.classList.add('is-hidden');
}

function downloadDataURL(dataUrl, filename) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function bootstrap() {
  const canvas = document.getElementById('glade-canvas');
  const hudRoot = document.getElementById('hud-root');
  if (!canvas || !hudRoot) {
    setLoadingError('Thiếu vùng hiển thị 3D (#glade-canvas hoặc #hud-root).');
    return;
  }

  // Respect explicit preferences, use Balanced on touch screens, and
  // detect a few proven weak GPU families after WebGL context creation.
  const QUALITY_SETTING_KEY = 'qs3d-glade-graphics-tier';
  let selectedQuality = null;
  try {
    const saved = window.localStorage?.getItem(QUALITY_SETTING_KEY);
    if (['eco', 'balanced', 'high', 'ultra'].includes(saved)) selectedQuality = saved;
  } catch { /* Storage blocked or disabled: play normally */ }
  let initialQuality = selectedQuality || (
    window.matchMedia?.('(max-width: 760px) and (pointer: coarse)')?.matches
      ? 'balanced' : 'high'
  );
  let pipeline;
  try {
    pipeline = createRendererPipeline(canvas, {
      quality: initialQuality,
      waterLevel: WATER_LEVEL,
      worldSize: WORLD_SIZE,
    });
  } catch (err) {
    console.error('[tiny-glade] Failed to initialize WebGL2 pipeline:', err);
    setLoadingError(`Không thể khởi động đồ họa WebGL2: ${err?.message || err}`);
    return;
  }

  // WebGL_debug_renderer_info is optional. Never depend on or send this
  // identification to a service; absent permission falls back to FPS-based
  // adaptive quality. The user's saved preference always wins.
  if (!selectedQuality) {
    try {
      const gl = pipeline.renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
      const recommended = recommendedQualityForRenderer(initialQuality, rendererName);
      if (recommended !== initialQuality) {
        pipeline.setQuality(recommended);
        initialQuality = recommended;
      }
    } catch { /* Browser hides GPU information */ }
  }

  const audio = new AudioEngine();
  const history = new HistoryManager();

  const world = new WorldManager({
    scene: pipeline.scene,
    materials: pipeline.materials,
    worldSize: WORLD_SIZE,
    waterLevel: WATER_LEVEL,
    onWaterRipple: (x, z, strength = 0.6) => {
      pipeline.water?.addRipple?.(x, z, strength);
    },
  });
  world.setQuality?.(initialQuality);

  const arch = new ArchitectureManager({
    scene: pipeline.scene,
    materials: pipeline.materials,
    getTerrainHeight: (x, z) => world.getHeightAt(x, z),
    waterLevel: WATER_LEVEL,
  });

  // Initial water height texture bind
  pipeline.water?.updateTerrainTexture?.(world.getHeightDataTexture(), WORLD_SIZE);

  let hud = null;
  let interaction = null;

  const syncWorldArchAndLights = () => {
    arch.setPaths(world.getPaths());
    world.syncFootprints(arch.getFootprints());
    pipeline.water?.updateTerrainTexture?.(world.getHeightDataTexture(), WORLD_SIZE);
    pipeline.syncPointLights?.(arch.getLanternPositions());
  };

  const syncLanternLights = () => {
    pipeline.syncPointLights?.(arch.getLanternPositions());
  };

  const captureSnapshot = () => ({
    world: world.serialize(),
    arch: arch.serialize(),
    env: {
      timeOfDay: pipeline.envState?.timeOfDay ?? 16.7,
      season: pipeline.envState?.season ?? 'summer',
      cloudiness: pipeline.envState?.cloudiness ?? 0.35,
      mist: pipeline.envState?.mist ?? pipeline.envState?.fogDensity ?? 0.35,
      windStrength: pipeline.envState?.windStrength ?? 0.45,
    },
  });

  let lastCommittedSnapshot = null;
  let currentPresetId = 'qs3d-island';
  let sceneAutosave = null;
  const scheduleAutosave = () => sceneAutosave?.schedule(captureSnapshot, currentPresetId);

  const updateHistoryButtons = () => {
    hud?.setHistoryState?.(history.canUndo(), history.canRedo());
  };

  const resetHistoryWithCurrentState = () => {
    history.clear();
    lastCommittedSnapshot = captureSnapshot();
    updateHistoryButtons();
  };

  const commitHistoryStep = () => {
    if (lastCommittedSnapshot) {
      history.pushState(lastCommittedSnapshot);
    }
    lastCommittedSnapshot = captureSnapshot();
    updateHistoryButtons();
    scheduleAutosave();
  };

  const applySnapshot = (snapshot) => {
    if (!snapshot) return;
    interaction?.clearSelection?.();
    if (snapshot.world) {
      world.deserialize(snapshot.world);
    }
    if (snapshot.arch) {
      arch.deserialize(snapshot.arch);
    }
    if (snapshot.env) {
      if (typeof snapshot.env.timeOfDay === 'number') {
        pipeline.setTimeOfDay?.(snapshot.env.timeOfDay);
        hud?.updateTimeOfDay?.(snapshot.env.timeOfDay);
      }
      if (snapshot.env.season) {
        world.setSeason?.(snapshot.env.season);
      }
      pipeline.setWeather?.({
        season: snapshot.env.season,
        cloudiness: snapshot.env.cloudiness,
        mist: snapshot.env.mist,
        windStrength: snapshot.env.windStrength,
      });
    }
    syncWorldArchAndLights();
    lastCommittedSnapshot = captureSnapshot();
    updateHistoryButtons();
    scheduleAutosave();
  };

  const cameraController = new CameraController({
    camera: pipeline.camera,
    domElement: canvas,
    world,
    arch,
    waterLevel: WATER_LEVEL,
    onWalkModeChange: (active) => {
      interaction?.setWalkMode?.(active);
      hud?.setWalkMode?.(active);
    },
  });

  const loadPreset = (presetId, immediateCamera = false) => {
    currentPresetId = presetId;
    interaction?.clearSelection?.();
    buildPresetScene(presetId, { world, arch, pipeline });
    syncWorldArchAndLights();
    if (pipeline.envState?.season) {
      world.setSeason?.(pipeline.envState.season);
    }
    hud?.setPresetValue?.(presetId);
    if (typeof pipeline.envState?.timeOfDay === 'number') {
      hud?.updateTimeOfDay?.(pipeline.envState.timeOfDay);
    }
    cameraController.framePreset(presetId, immediateCamera);
    resetHistoryWithCurrentState();
    scheduleAutosave();
  };

  const handleUndo = () => {
    const current = captureSnapshot();
    const prev = history.undo(current);
    if (prev) {
      applySnapshot(prev);
      hud?.showToast?.('Đã hoàn tác thao tác cuối');
    }
  };

  const handleRedo = () => {
    const current = captureSnapshot();
    const next = history.redo(current);
    if (next) {
      applySnapshot(next);
      hud?.showToast?.('Đã thực hiện lại thao tác');
    }
  };

  const handleCaptureScreenshot = () => {
    const dataUrl = pipeline.captureScreenshotDataURL?.();
    if (dataUrl) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadDataURL(dataUrl, `tiny-glade-${stamp}.png`);
      hud?.showToast?.('Đã chụp ảnh cảnh 3D');
    }
  };

  const adaptiveQuality = new AdaptiveQuality({ startTime: performance.now() });
  if (selectedQuality) adaptiveQuality.manualOverride();
  const hudCallbacks = {
    presets: PRESET_SCENES,

    onUiSound: () => {
      audio.unlock?.();
      audio.playUiTick?.();
    },

    onToolChange: (toolId) => {
      audio.unlock?.();
      if (cameraController.isWalkMode()) {
        cameraController.setWalkMode(false);
        hud?.setWalkMode?.(false);
        interaction?.setWalkMode?.(false);
      }
      interaction?.setActiveTool?.(toolId);
    },
    onSelectTool: (toolId) => hudCallbacks.onToolChange(toolId),

    onOptionsChange: (opts) => {
      audio.unlock?.();
      interaction?.onToolOptionsChanged?.(opts);
    },
    onToolOptionsChange: (opts) => hudCallbacks.onOptionsChange(opts),

    onDeleteSelected: (entity) => {
      audio.unlock?.();
      interaction?.deleteSelectedEntity?.(entity);
    },

    onPresetChange: (presetId) => {
      audio.unlock?.();
      loadPreset(presetId, false);
    },
    onSelectPreset: (presetId) => hudCallbacks.onPresetChange(presetId),

    onUndo: handleUndo,
    onRedo: handleRedo,

    onExport: () => {
      audio.unlock?.();
      history.exportJSON(captureSnapshot(), 'tiny-glade-scene.json');
      hud?.showToast?.('Đã xuất cảnh thành tệp JSON');
    },
    onExportJSON: () => hudCallbacks.onExport(),

    onImport: async (file) => {
      if (!file) return;
      audio.unlock?.();
      try {
        const snap = await history.importJSON(file);
        if (snap) {
          commitHistoryStep();
          applySnapshot(snap);
          hud?.showToast?.('Đã nhập thiết kế thành công');
        }
      } catch (err) {
        console.warn('[tiny-glade] Rejected invalid user-provided scene JSON:', err);
        hud?.showToast?.('Không thể đọc tệp JSON thiết kế');
      }
    },
    onImportJSON: (file) => hudCallbacks.onImport(file),

    onTimeOfDayChange: (hours) => {
      pipeline.setTimeOfDay?.(Number(hours));
      syncLanternLights();
      scheduleAutosave();
    },
    onTimeChange: (hours) => hudCallbacks.onTimeOfDayChange(hours),

    onSeasonChange: (season) => {
      audio.playUiTick?.();
      world.setSeason?.(season);
      pipeline.setWeather?.({ season });
      scheduleAutosave();
    },

    onWeatherChange: (weatherPatch) => {
      if (weatherPatch?.season) {
        world.setSeason?.(weatherPatch.season);
      }
      pipeline.setWeather?.(weatherPatch);
      scheduleAutosave();
    },

    onDoFChange: (dofPatch) => {
      pipeline.setDoF?.(dofPatch);
    },

    onQualityChange: (tier) => {
      adaptiveQuality.manualOverride();
      try { window.localStorage?.setItem(QUALITY_SETTING_KEY, tier); } catch {}
      audio.playUiTick?.();
      pipeline.setQuality?.(tier);
      world.setQuality?.(tier);
      hud?.showToast?.(`Chất lượng đồ họa: ${tier}`);
    },

    onWalkModeChange: (active) => {
      audio.unlock?.();
      audio.playUiTick?.();
      const next = typeof active === 'boolean' ? active : !cameraController.isWalkMode();
      cameraController.setWalkMode(next);
      interaction?.setWalkMode?.(next);
      hud?.setWalkMode?.(next);
      if (next) {
        hud?.showToast?.('Chế độ đi bộ — WASD để đi, kéo để nhìn, Esc để thoát');
      }
    },
    onToggleWalkMode: (active) => hudCallbacks.onWalkModeChange(active),

    onPhotoModeChange: (active) => {
      audio.playUiTick?.();
      interaction?.setPhotoMode?.(Boolean(active));
    },

    onCapturePhoto: handleCaptureScreenshot,
    onScreenshot: handleCaptureScreenshot,

    onMuteChange: (muted) => {
      audio.unlock?.();
      const next = typeof muted === 'boolean' ? muted : !audio.isMuted();
      audio.setMuted(next);
      return next;
    },
    onToggleMute: (muted) => hudCallbacks.onMuteChange(muted),
  };

  hud = new HUDController(hudRoot, hudCallbacks);
  hud.setQuality?.(initialQuality);

  interaction = new InteractionController({
    scene: pipeline.scene,
    camera: pipeline.camera,
    domElement: canvas,
    pipeline,
    world,
    arch,
    audio,
    hud,
    cameraController,
    waterLevel: WATER_LEVEL,
    onCommitHistory: commitHistoryStep,
    onLanternsChanged: syncLanternLights,
  });

  // Unlock WebAudio cleanly on first user gesture
  const unlockOnce = () => {
    audio.unlock?.();
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });

  // Resize listener
  const onResize = () => {
    pipeline.resize?.(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);
  onResize();

  // Build breathtaking default starter diorama: Lakeside Keep
  loadPreset('qs3d-island', true);
  hud.setActiveTool?.('select');

  // Recover the last locally saved build without sending data to a server.
  // Failure to read storage or validate a checkpoint must never block WebGL.
  let storage = null;
  try { storage = window.localStorage; } catch { /* Storage denied */ }
  sceneAutosave = new SceneAutosave({ storage, history });
  const checkpoint = sceneAutosave.read();
  if (checkpoint) {
    void history.importJSON(checkpoint.sceneJSON).then((snapshot) => {
      if (PRESET_SCENES.some((preset) => preset.id === checkpoint.presetId)) {
        currentPresetId = checkpoint.presetId;
        hud.setPresetValue?.(currentPresetId);
        cameraController.framePreset(currentPresetId, true);
      }
      applySnapshot(snapshot);
      resetHistoryWithCurrentState();
      hud.showToast?.('Đã khôi phục thiết kế tự lưu trên thiết bị này.', 3200);
    }).catch((error) => {
      console.warn('[qs3d] Autosave is damaged; opening a fresh scene:', error);
      hud.showToast?.('Bản tự lưu không đọc được. Bạn vẫn có thể mở tệp JSON.', 4200);
    });
  } else if (sceneAutosave.lastError) {
    hud.showToast?.('Không thể đọc bản tự lưu trên thiết bị.', 3200);
  }
  window.addEventListener('pagehide', () => sceneAutosave?.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sceneAutosave?.flush();
  });

  // Expose clean automation & inspection handle
  window.__glade = {
    pipeline,
    world,
    arch,
    camera: cameraController,
    interaction,
    hud,
    audio,
    history,
    loadPreset,
    captureSnapshot,
    applySnapshot,
    sceneAutosave,
    adaptiveQuality,
  };

  // Main animation loop
  let prevTime = performance.now();
  let elapsed = 0;
  let firstFrameRendered = false;
  let statsAccumTime = 0;
  let statsFrames = 0;

  function frame(now) {
    requestAnimationFrame(frame);

    const rawDt = (now - prevTime) / 1000;
    prevTime = now;
    const dt = Math.min(0.05, Math.max(0.0005, rawDt));
    elapsed += dt;

    cameraController.update(dt, elapsed);
    interaction.update(dt, elapsed);
    arch.update(dt, elapsed, pipeline.envState);
    world.update(dt, elapsed, pipeline.envState, arch.getChimneyPositions());
    pipeline.update(dt, elapsed, cameraController.getFocusWorldPos());
    audio.updateAmbience?.(dt, pipeline.envState);
    pipeline.render();

    if (!firstFrameRendered) {
      firstFrameRendered = true;
      hideLoadingOverlay();
    }

    statsAccumTime += rawDt;
    statsFrames += 1;
    if (statsAccumTime >= 0.4) {
      const fps = Math.round(statsFrames / statsAccumTime);
      const frameMs = Number(((statsAccumTime / statsFrames) * 1000).toFixed(1));
      const rendererStats = pipeline.getStats?.() || {};
      // Adaptive but one-way: slow GPUs downgrade; the player's setting wins.
      const next = adaptiveQuality.observe({fps, now, quality: pipeline.envState?.quality});
      if (next) {
        pipeline.setQuality?.(next);
        world.setQuality?.(next);
        hud.setQuality?.(next);
        hud.showToast?.('Máy đang chậm: tự giảm chất lượng đồ họa. Bạn có thể đổi lại trong Không khí.', 4200);
      }
      hud.updateStats?.({
        fps,
        frameMs,
        drawCalls: rendererStats.drawCalls ?? 0,
        triangles: rendererStats.triangles ?? 0,
        quality: rendererStats.quality ?? pipeline.envState?.quality ?? 'high',
      });
      statsAccumTime = 0;
      statsFrames = 0;
    }
  }

  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
