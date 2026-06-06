import './style.css';
import { GameEngine } from './engine/GameEngine';
import type { GameState } from './engine/Types';

document.addEventListener('DOMContentLoaded', () => {
  // Bind UI elements
  const fpsEl = document.getElementById('metric-fps');
  const siliconEl = document.getElementById('res-silicon');
  const ferroEl = document.getElementById('res-ferro');
  const coresEl = document.getElementById('res-cores');
  const coordsEl = document.getElementById('tank-coords');
  const dirEl = document.getElementById('tank-dir');
  const speedEl = document.getElementById('tank-speed');
  const statusEl = document.getElementById('metric-status');
  const livesEl = document.getElementById('tank-lives');
  const queueEl = document.getElementById('wave-queue');
  const killsEl = document.getElementById('wave-kills');
  const levelEl = document.getElementById('matrix-level');

  // Upgrade Modal elements
  const overlayEl = document.getElementById('upgrade-overlay');
  const modalSilicon = document.getElementById('modal-silicon');
  const modalFerro = document.getElementById('modal-ferro');
  const modalCore = document.getElementById('modal-core');

  const btnPiercing = document.getElementById('btn-upgrade-piercing') as HTMLButtonElement;
  const btnFlak = document.getElementById('btn-upgrade-flak') as HTMLButtonElement;
  const btnForts = document.getElementById('btn-upgrade-forts') as HTMLButtonElement;
  const btnTreads = document.getElementById('btn-upgrade-treads') as HTMLButtonElement;
  const btnPropellant = document.getElementById('btn-upgrade-propellant') as HTMLButtonElement;

  const statusPiercing = document.getElementById('status-piercing');
  const statusFlak = document.getElementById('status-flak');
  const statusForts = document.getElementById('status-forts');
  const statusTreads = document.getElementById('status-treads');
  const statusPropellant = document.getElementById('status-propellant');

  const btnCloseUpgrade = document.getElementById('btn-close-upgrade');

  let engine: GameEngine | null = null;
  let isStoreOpen = false;

  // Padding helper
  const padZero = (num: number, size: number = 3): string => {
    let s = num.toString();
    while (s.length < size) s = "0" + s;
    return s;
  };

  // Update gameplay HUD elements on every engine tick
  const handleStateUpdate = (state: GameState, fps: number) => {
    // 1. Update FPS
    if (fpsEl) {
      fpsEl.innerText = `${fps.toFixed(1)} FPS`;
    }

    // 2. Update Resources
    if (siliconEl) {
      siliconEl.innerText = padZero(state.resources.siliconShards);
    }
    if (ferroEl) {
      ferroEl.innerText = padZero(state.resources.ferroAlloys);
    }
    if (coresEl) {
      coresEl.innerText = padZero(state.resources.kineticCores);
    }

    // 3. Update Player Grid Coordinates & Movement Details
    const p = state.player;
    const col = Math.floor((p.x + p.width / 2) / 32);
    const row = Math.floor((p.y + p.height / 2) / 32);
    
    if (coordsEl) {
      coordsEl.innerText = `X: ${padZero(col, 2)}, Y: ${padZero(row, 2)}`;
    }

    if (dirEl) {
      dirEl.innerText = p.direction;
    }

    if (speedEl) {
      if (p.isMoving) {
        const onIce = state.grid[row]?.[col]?.type === 'ICE';
        speedEl.innerText = onIce ? '180 PX/S' : '120 PX/S';
      } else {
        speedEl.innerText = '0 PX/S';
      }
    }

    // 4. Update Combat Wave Statistics
    if (livesEl) {
      livesEl.innerText = padZero(p.lives, 2);
    }
    if (queueEl) {
      queueEl.innerText = padZero(state.spawnQueue.length, 2);
    }
    if (killsEl) {
      killsEl.innerText = padZero(state.killCount, 2);
    }
    if (levelEl) {
      levelEl.innerText = padZero(state.currentLevel, 2);
    }
  };

  const toggleStore = (visible: boolean) => {
    if (!engine || !overlayEl) return;
    
    isStoreOpen = visible;
    engine.togglePauseStore(visible);

    if (visible) {
      overlayEl.classList.remove('hidden');
      updateStoreUI();
    } else {
      overlayEl.classList.add('hidden');
    }
  };

  const updateStoreUI = () => {
    if (!engine) return;
    const state = engine.getGameState();
    const r = state.resources;
    const p = state.player;

    // Update modal resource readouts
    if (modalSilicon) modalSilicon.innerText = padZero(r.siliconShards);
    if (modalFerro) modalFerro.innerText = padZero(r.ferroAlloys);
    if (modalCore) modalCore.innerText = padZero(r.kineticCores);

    // 1. Kinetic Piercing (15 Silicon, 2 Ferro)
    if (p.kineticPiercing) {
      btnPiercing.disabled = true;
      btnPiercing.className = 'upgrade-card purchased';
      if (statusPiercing) statusPiercing.innerText = 'PURCHASED';
    } else {
      const canAfford = r.siliconShards >= 15 && r.ferroAlloys >= 2;
      btnPiercing.disabled = !canAfford;
      btnPiercing.className = `upgrade-card ${canAfford ? '' : 'locked'}`;
      if (statusPiercing) statusPiercing.innerText = canAfford ? 'AVAILABLE' : 'LOCKED';
    }

    // 2. Proximity Flak (25 Silicon, 1 Core)
    if (p.proximityFlak) {
      btnFlak.disabled = true;
      btnFlak.className = 'upgrade-card purchased';
      if (statusFlak) statusFlak.innerText = 'PURCHASED';
    } else {
      const canAfford = r.siliconShards >= 25 && r.kineticCores >= 1;
      btnFlak.disabled = !canAfford;
      btnFlak.className = `upgrade-card ${canAfford ? '' : 'locked'}`;
      if (statusFlak) statusFlak.innerText = canAfford ? 'AVAILABLE' : 'LOCKED';
    }

    // 3. Reinforce Forts (5 Ferro)
    if (p.baseReinforced) {
      btnForts.disabled = true;
      btnForts.className = 'upgrade-card purchased';
      if (statusForts) statusForts.innerText = 'INSTALLED';
    } else {
      const canAfford = r.ferroAlloys >= 5;
      btnForts.disabled = !canAfford;
      btnForts.className = `upgrade-card ${canAfford ? '' : 'locked'}`;
      if (statusForts) statusForts.innerText = canAfford ? 'AVAILABLE' : 'LOCKED';
    }

    // 4. Overdrive Treads (10 Silicon, 1 Ferro per tier, max 3)
    const treadLvl = p.treadTier || 0;
    if (treadLvl >= 3) {
      btnTreads.disabled = true;
      btnTreads.className = 'upgrade-card purchased';
      if (statusTreads) statusTreads.innerText = 'MAX LEVEL';
    } else {
      const canAfford = r.siliconShards >= 10 && r.ferroAlloys >= 1;
      btnTreads.disabled = !canAfford;
      btnTreads.className = `upgrade-card ${canAfford ? '' : 'locked'}`;
      if (statusTreads) statusTreads.innerText = canAfford ? `BUY TIER ${treadLvl + 1}/3` : `LOCKED (TIER ${treadLvl}/3)`;
    }

    // 5. Hyper-Velocity Propellant (12 Silicon, 1 Ferro per tier, max 3)
    const propellantLvl = p.propellantTier || 0;
    if (propellantLvl >= 3) {
      btnPropellant.disabled = true;
      btnPropellant.className = 'upgrade-card purchased';
      if (statusPropellant) statusPropellant.innerText = 'MAX LEVEL';
    } else {
      const canAfford = r.siliconShards >= 12 && r.ferroAlloys >= 1;
      btnPropellant.disabled = !canAfford;
      btnPropellant.className = `upgrade-card ${canAfford ? '' : 'locked'}`;
      if (statusPropellant) statusPropellant.innerText = canAfford ? `BUY TIER ${propellantLvl + 1}/3` : `LOCKED (TIER ${propellantLvl}/3)`;
    }
  };

  // Keyboard toggles
  window.addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E' || e.key === 'Tab') {
      e.preventDefault();
      toggleStore(!isStoreOpen);
    }
  });

  if (btnCloseUpgrade) {
    btnCloseUpgrade.addEventListener('click', () => {
      toggleStore(false);
    });
  }

  // Button purchase bindings
  if (btnPiercing) {
    btnPiercing.addEventListener('click', () => {
      if (engine && engine.buyUpgrade('piercing')) {
        updateStoreUI();
      }
    });
  }
  if (btnFlak) {
    btnFlak.addEventListener('click', () => {
      if (engine && engine.buyUpgrade('flak')) {
        updateStoreUI();
      }
    });
  }
  if (btnForts) {
    btnForts.addEventListener('click', () => {
      if (engine && engine.buyUpgrade('forts')) {
        updateStoreUI();
      }
    });
  }
  if (btnTreads) {
    btnTreads.addEventListener('click', () => {
      if (engine && engine.buyUpgrade('treads')) {
        updateStoreUI();
      }
    });
  }
  if (btnPropellant) {
    btnPropellant.addEventListener('click', () => {
      if (engine && engine.buyUpgrade('propellant')) {
        updateStoreUI();
      }
    });
  }

  // Create and start game engine loop
  try {
    engine = new GameEngine('game-canvas', (state, fps) => {
      handleStateUpdate(state, fps);
      
      // Update the base health warning or Game Over state on status banner
      if (statusEl) {
        const isOffline = (engine as any).baseDestroyed;
        const isGameOver = state.player.lives < 0;
        
        if (isGameOver) {
          statusEl.innerText = 'TERMINATED';
          statusEl.className = 'metric-value';
          statusEl.style.color = 'var(--color-accent-red)';
          statusEl.style.textShadow = '0 0 10px rgba(255, 7, 58, 1)';
        } else if (isOffline) {
          statusEl.innerText = 'COMPROMISED';
          statusEl.className = 'metric-value';
          statusEl.style.color = 'var(--color-accent-red)';
          statusEl.style.textShadow = '0 0 10px rgba(255, 7, 58, 0.8)';
        } else {
          statusEl.innerText = 'ONLINE';
          statusEl.className = 'metric-value active-pulse';
          statusEl.style.color = '';
          statusEl.style.textShadow = '';
        }
      }
    });

    engine.start();
    (window as any).gameEngine = engine;

    // Clean up engine loop when window unloads
    window.addEventListener('beforeunload', () => {
      if (engine) engine.stop();
    });

  } catch (err) {
    console.error('Error starting game engine:', err);
  }
});
