import { Direction, TileType } from './Types';
import type { MacroTile, GameState, Bullet, EnemyTank, DropItem } from './Types';
import { FlowField } from './FlowField';
import { LevelManager } from './LevelManager';
import type { LevelConfig } from './LevelManager';

interface FlakExplosion {
  x: number;
  y: number;
  timer: number; // starts at 15
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  
  // Game loop timing
  private lastTime = 0;
  private accumulator = 0;
  private readonly deltaTime = 1000 / 60; // 60 FPS target (~16.67ms)
  private fps = 0;
  private frameCount = 0;
  private fpsLastTime = 0;
  private loopFrameId = 0;
  private frameCounter = 0; // Incremented every frame, used for wave animations
  private intermissionTimer = 0;
  
  // Dijkstra Flow Fields
  private baseFlowField: number[][] = [];
  private heavyFlowField: number[][] = [];
  private playerFlowField: number[][] = [];
  
  // Keep track of last calculated player micro-tile position to optimize calculations
  private lastPlayerMicroRow = -1;
  private lastPlayerMicroCol = -1;
  
  // Spawning variables
  private readonly spawnPoints = [
    { x: 1 * 32 + 2, y: 1 * 32 + 2 },
    { x: 6 * 32 + 2, y: 1 * 32 + 2 },
    { x: 11 * 32 + 2, y: 1 * 32 + 2 },
  ];
  private spawnClock = 120; // 2 seconds delay initially
  
  // Bullet physics
  private bullets: Bullet[] = [];
  
  // Flak explosions
  private flakExplosions: FlakExplosion[] = [];
  
  // Input tracking
  private activeKeys: Set<string> = new Set();
  
  // UI callbacks/elements
  private onStateUpdate?: (state: GameState, fps: number) => void;
  
  // Eagle Base status
  public baseDestroyed = false;

  constructor(canvasId: string, onStateUpdate?: (state: GameState, fps: number) => void) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;
    this.onStateUpdate = onStateUpdate;
    
    // Initialize default game state
    this.state = this.resetState();
    
    // Calculate initial flow fields
    this.recalculateStaticFlowFields();
    this.recalculatePlayerFlowField();
    
    // Bind event listeners
    this.setupInput();
  }

  private resetState(): GameState {
    this.baseDestroyed = false;
    this.bullets = [];
    this.flakExplosions = [];
    this.spawnClock = 120;
    this.intermissionTimer = 0;
    
    const player = {
      x: 6 * 32 + 2, // Spawn column 6 (center), offset slightly to center the 28x28 tank in 32x32 cell
      y: 11 * 32 + 2, // Row 11
      direction: Direction.UP,
      speed: 1,
      width: 28,
      height: 28,
      isMoving: false,
      lives: 3,
      health: 100,
      flashTimer: 0,
      kineticPiercing: false,
      proximityFlak: false,
      baseReinforced: false,
      treadTier: 0,
      propellantTier: 0
    };

    const resources = {
      siliconShards: 0,
      ferroAlloys: 0,
      kineticCores: 0,
    };

    const config = LevelManager.getLevelConfig(1);

    const state: GameState = {
      grid: [], // will be set below
      player,
      activeEnemies: [],
      spawnQueue: [...config.enemyTypeDistribution],
      killCount: 0,
      resources,
      isPaused: false,
      debugMode: false,
      dropItems: [],
      floatingTexts: [],
      currentLevel: 1,
      gamePhase: 'PLAYING'
    };

    this.state = state;
    state.grid = this.generateProceduralMap(config);
    return state;
  }

  private recalculateStaticFlowFields(): void {
    // Eagle base (rows 24-25, cols 12-13 of 26x26 micro-grid)
    const baseTargets = [
      { r: 24, c: 12 }, { r: 24, c: 13 },
      { r: 25, c: 12 }, { r: 25, c: 13 }
    ];
    this.baseFlowField = FlowField.generateDijkstraMap(this.state.grid, baseTargets, 15);
    this.heavyFlowField = FlowField.generateDijkstraMap(this.state.grid, baseTargets, 1);
  }

  private recalculatePlayerFlowField(): void {
    const p = this.state.player;
    const px = p.x + p.width / 2;
    const py = p.y + p.height / 2;
    const pr = Math.max(0, Math.min(25, Math.floor(py / 16)));
    const pc = Math.max(0, Math.min(25, Math.floor(px / 16)));
    
    // Only recompute if player has crossed a micro-grid cell boundary to save computation power
    if (pr !== this.lastPlayerMicroRow || pc !== this.lastPlayerMicroCol) {
      this.lastPlayerMicroRow = pr;
      this.lastPlayerMicroCol = pc;
      this.playerFlowField = FlowField.generateDijkstraMap(this.state.grid, [{ r: pr, c: pc }], 15);
    }
  }

  private loadDefaultMap(): MacroTile[][] {
    const grid: MacroTile[][] = [];
    
    for (let r = 0; r < 13; r++) {
      const row: MacroTile[] = [];
      for (let c = 0; c < 13; c++) {
        let type: TileType = TileType.EMPTY;
        
        // Perimeter of STEEL
        if (r === 0 || r === 12 || c === 0 || c === 12) {
          type = TileType.STEEL;
        } 
        // Brick fortress around base at bottom center (row 12, col 6 is the base)
        else if (r === 12 && c === 6) {
          type = TileType.EMPTY; // Will render eagle here
        } else if (
          (r === 12 && c === 5) || 
          (r === 11 && c === 5) || 
          (r === 10 && c === 5) || 
          (r === 10 && c === 6) || 
          (r === 10 && c === 7) || 
          (r === 11 && c === 7) || 
          (r === 12 && c === 7)
        ) {
          type = TileType.BRICK;
        }
        // Custom map clusters (keeping spawn columns 1, 6, and 11 clear along top rows)
        else if (
          (r === 2 && c === 2) || (r === 3 && c === 2) || (r === 4 && c === 2) ||
          (r === 2 && c === 10) || (r === 3 && c === 10) || (r === 4 && c === 10) ||
          (r === 5 && c === 5) || (r === 5 && c === 6) || (r === 5 && c === 7) ||
          (r === 6 && c === 2) || (r === 6 && c === 10) ||
          (r === 8 && c === 5) || (r === 8 && c === 6) || (r === 8 && c === 7)
        ) {
          type = TileType.BRICK;
        } else if (
          (r === 4 && c === 3) || (r === 4 && c === 4) ||
          (r === 4 && c === 8) || (r === 4 && c === 9) ||
          (r === 7 && c === 3) || (r === 7 && c === 9)
        ) {
          type = TileType.BUSH;
        } else if (
          (r === 5 && c === 3) || (r === 5 && c === 4) ||
          (r === 5 && c === 8) || (r === 5 && c === 9)
        ) {
          type = TileType.WATER;
        } else if (
          (r === 8 && c === 2) || (r === 8 && c === 3) ||
          (r === 8 && c === 9) || (r === 8 && c === 10)
        ) {
          type = TileType.ICE;
        }
        
        // Initial health: all quadrants active for solid tiles
        const isSolid = type !== TileType.EMPTY;
        row.push({
          type,
          quadrants: [
            [isSolid, isSolid],
            [isSolid, isSolid]
          ]
        });
      }
      grid.push(row);
    }
    
    return grid;
  }

  private loadLevel(levelNumber: number): void {
    const config = LevelManager.getLevelConfig(levelNumber);
    
    this.state.activeEnemies = [];
    this.bullets = [];
    this.flakExplosions = [];
    this.state.dropItems = [];
    this.state.floatingTexts = [];
    
    this.state.spawnQueue = [...config.enemyTypeDistribution];
    this.spawnClock = config.spawnIntervalTicks;
    this.intermissionTimer = 0;
    
    // Reset player position and movement state (retain upgrades, resources, lives)
    const p = this.state.player;
    p.x = 6 * 32 + 2;
    p.y = 11 * 32 + 2;
    p.direction = Direction.UP;
    p.isMoving = false;
    p.flashTimer = 90; // invincibility frame highlight
    
    this.state.grid = this.generateProceduralMap(config);
    this.baseDestroyed = false;
    this.state.currentLevel = levelNumber;
    
    // Recalculate Dijkstra Maps
    this.recalculateStaticFlowFields();
    this.recalculatePlayerFlowField();
  }

  private verifyPathability(grid: MacroTile[][]): boolean {
    // BFS check from base (12, 6)
    const queue: [number, number][] = [[12, 6]];
    const visited = new Set<string>();
    visited.add('12,6');
    
    let head = 0;
    const dirs = [
      [-1, 0], // UP
      [1, 0],  // DOWN
      [0, -1], // LEFT
      [0, 1]   // RIGHT
    ];
    
    while (head < queue.length) {
      const [r, c] = queue[head++];
      
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        
        if (nr >= 0 && nr < 13 && nc >= 0 && nc < 13) {
          const key = `${nr},${nc}`;
          if (!visited.has(key)) {
            const tile = grid[nr][nc];
            // Treat STEEL and WATER as impassable
            if (tile.type !== TileType.STEEL && tile.type !== TileType.WATER) {
              visited.add(key);
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
    
    // Check if player spawn (11, 6) and 3 enemy spawns (1,1), (1,6), (1,11) are visited
    return visited.has('11,6') && visited.has('1,1') && visited.has('1,6') && visited.has('1,11');
  }

  private generateProceduralMap(config: LevelConfig): MacroTile[][] {
    const maxAttempts = 1000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const grid: MacroTile[][] = [];
      const density = config.tileDensity;
      
      for (let r = 0; r < 13; r++) {
        const row: MacroTile[] = [];
        for (let c = 0; c < 13; c++) {
          let type: TileType = TileType.EMPTY;
          
          // Perimeter of STEEL
          if (r === 0 || r === 12 || c === 0 || c === 12) {
            type = TileType.STEEL;
          } 
          // Eagle base at (12, 6) is empty
          else if (r === 12 && c === 6) {
            type = TileType.EMPTY;
          }
          // Brick/Steel fortress around base
          else if (
            (r === 12 && c === 5) || 
            (r === 11 && c === 5) || 
            (r === 10 && c === 5) || 
            (r === 10 && c === 6) || 
            (r === 10 && c === 7) || 
            (r === 11 && c === 7) || 
            (r === 12 && c === 7)
          ) {
            type = (this.state && this.state.player && this.state.player.baseReinforced) ? TileType.STEEL : TileType.BRICK;
          }
          // Spawns must be empty
          else if (
            (r === 11 && c === 6) || // Player spawn
            (r === 1 && c === 1) ||  // Left enemy spawn
            (r === 1 && c === 6) ||  // Center enemy spawn
            (r === 1 && c === 11)    // Right enemy spawn
          ) {
            type = TileType.EMPTY;
          }
          // Random generation based on densities
          else {
            const rand = Math.random();
            if (rand < density.BRICK) {
              type = TileType.BRICK;
            } else if (rand < density.BRICK + density.STEEL) {
              type = TileType.STEEL;
            } else if (rand < density.BRICK + density.STEEL + density.WATER) {
              type = TileType.WATER;
            } else if (rand < density.BRICK + density.STEEL + density.WATER + density.BUSH) {
              type = TileType.BUSH;
            } else if (rand < density.BRICK + density.STEEL + density.WATER + density.BUSH + density.ICE) {
              type = TileType.ICE;
            }
          }
          
          const isSolid = type !== TileType.EMPTY;
          row.push({
            type,
            quadrants: [
              [isSolid, isSolid],
              [isSolid, isSolid]
            ]
          });
        }
        grid.push(row);
      }
      
      // Run pathability check
      if (this.verifyPathability(grid)) {
        return grid;
      }
    }
    
    // Fallback in case pathability fails 1000 times
    return this.loadDefaultMap();
  }

  private setupInput(): void {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      
      // Prevent scrolling behaviors for action keys
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'f3'].includes(key)) {
        e.preventDefault();
      }
      
      if (e.key === 'F3' || key === 'f3') {
        this.state.debugMode = !this.state.debugMode;
        return;
      }
      
      // Stop keyboard movements while store pause is visible or game phase is not PLAYING
      if (this.state.isPaused || this.state.gamePhase !== 'PLAYING') return;

      this.activeKeys.add(key);
      this.updateKeyCapStyles();
      
      if (e.key === ' ' || key === 'spacebar') {
        this.fireBullet();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.activeKeys.delete(key);
      this.updateKeyCapStyles();
    });

    // Button interactions
    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        this.state = this.resetState();
        this.recalculateStaticFlowFields();
        this.recalculatePlayerFlowField();
      });
    }

    const btnPause = document.getElementById('btn-pause');
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.state.isPaused = !this.state.isPaused;
        btnPause.innerText = this.state.isPaused ? 'RESUME GAME' : 'PAUSE GAME';
      });
    }
  }

  private updateKeyCapStyles(): void {
    const checkKey = (domId: string, searchKeys: string[]) => {
      const el = document.getElementById(domId);
      if (el) {
        const isPressed = searchKeys.some(k => this.activeKeys.has(k));
        if (isPressed) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    };

    checkKey('key-w', ['w', 'arrowup']);
    checkKey('key-a', ['a', 'arrowleft']);
    checkKey('key-s', ['s', 'arrowdown']);
    checkKey('key-d', ['d', 'arrowright']);
    checkKey('key-space', [' ', 'spacebar']);
  }

  public togglePauseStore(visible: boolean): void {
    this.state.isPaused = visible;
    if (visible) {
      // Clear movement keys to stop slide
      this.activeKeys.clear();
      this.updateKeyCapStyles();
    }
  }

  public getGameState(): GameState {
    return this.state;
  }

  public buyUpgrade(type: 'piercing' | 'flak' | 'forts' | 'treads' | 'propellant'): boolean {
    const r = this.state.resources;
    const p = this.state.player;

    if (type === 'piercing' && !p.kineticPiercing) {
      if (r.siliconShards >= 15 && r.ferroAlloys >= 2) {
        r.siliconShards -= 15;
        r.ferroAlloys -= 2;
        p.kineticPiercing = true;
        return true;
      }
    } else if (type === 'flak' && !p.proximityFlak) {
      if (r.siliconShards >= 25 && r.kineticCores >= 1) {
        r.siliconShards -= 25;
        r.kineticCores -= 1;
        p.proximityFlak = true;
        return true;
      }
    } else if (type === 'forts' && !p.baseReinforced) {
      if (r.ferroAlloys >= 5) {
        r.ferroAlloys -= 5;
        p.baseReinforced = true;
        
        // Transform base brick fortresses into STEEL
        const fortCoords = [
          { r: 12, c: 5 }, { r: 11, c: 5 }, { r: 10, c: 5 },
          { r: 10, c: 6 },
          { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }
        ];
        for (const coord of fortCoords) {
          const tile = this.state.grid[coord.r][coord.c];
          if (tile.type === TileType.BRICK) {
            tile.type = TileType.STEEL;
            tile.quadrants = [
              [true, true],
              [true, true]
            ];
          }
        }
        
        this.recalculateStaticFlowFields();
        return true;
      }
    } else if (type === 'treads') {
      const currentTier = p.treadTier || 0;
      if (currentTier < 3 && r.siliconShards >= 10 && r.ferroAlloys >= 1) {
        r.siliconShards -= 10;
        r.ferroAlloys -= 1;
        p.treadTier = currentTier + 1;
        return true;
      }
    } else if (type === 'propellant') {
      const currentTier = p.propellantTier || 0;
      if (currentTier < 3 && r.siliconShards >= 12 && r.ferroAlloys >= 1) {
        r.siliconShards -= 12;
        r.ferroAlloys -= 1;
        p.propellantTier = currentTier + 1;
        return true;
      }
    }
    return false;
  }

  private fireBullet(): void {
    if (this.state.isPaused || this.state.gamePhase !== 'PLAYING') return;
    
    // Limit to 2 active player bullets at a time
    if (this.bullets.filter(b => b.active && b.owner === 'PLAYER').length >= 2) return;
    
    const p = this.state.player;
    let bx = p.x + p.width / 2;
    let by = p.y + p.height / 2;
    const bSpeed = 4.0 + 2.0 * (p.propellantTier || 0);
    
    // Spawn bullet offset from the tank muzzle
    const offset = 14;
    if (p.direction === Direction.UP) {
      by -= offset;
    } else if (p.direction === Direction.DOWN) {
      by += offset;
    } else if (p.direction === Direction.LEFT) {
      bx -= offset;
    } else if (p.direction === Direction.RIGHT) {
      bx += offset;
    }
    
    this.bullets.push({
      x: bx,
      y: by,
      vx: p.direction === Direction.LEFT ? -bSpeed : p.direction === Direction.RIGHT ? bSpeed : 0,
      vy: p.direction === Direction.UP ? -bSpeed : p.direction === Direction.DOWN ? bSpeed : 0,
      direction: p.direction,
      active: true,
      radius: 3,
      owner: 'PLAYER',
      penetrationCount: 0
    });
  }

  public start(): void {
    this.lastTime = performance.now();
    this.fpsLastTime = this.lastTime;
    this.loopFrameId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    cancelAnimationFrame(this.loopFrameId);
  }

  private loop = (timestamp: number) => {
    if (!this.lastTime) {
      this.lastTime = timestamp;
      this.fpsLastTime = timestamp;
    }

    let elapsed = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // Cap elapsed time to prevent giant jumps (e.g. background tab)
    if (elapsed > 100) elapsed = 100;

    this.accumulator += elapsed;

    // Fixed timestep updates
    while (this.accumulator >= this.deltaTime) {
      if (!this.state.isPaused) {
        this.updatePhysics();
      }
      this.accumulator -= this.deltaTime;
    }

    // FPS Meter
    this.frameCount++;
    if (timestamp > this.fpsLastTime + 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (timestamp - this.fpsLastTime));
      this.frameCount = 0;
      this.fpsLastTime = timestamp;
    }

    // Render step
    this.render();
    
    // Increment frame counter for animations
    this.frameCounter++;
    
    // Callback to update UI metrics
    if (this.onStateUpdate) {
      this.onStateUpdate(this.state, this.fps);
    }

    this.loopFrameId = requestAnimationFrame(this.loop);
  };

  private updatePhysics(): void {
    // 1. Check for Game Over condition
    const isGameOver = this.state.player.lives < 0 || this.baseDestroyed;
    if (isGameOver) {
      this.state.gamePhase = 'GAMEOVER';
      this.state.player.isMoving = false;
      return;
    }

    // 2. Check for Intermission transition
    if (this.state.gamePhase === 'INTERMISSION') {
      this.intermissionTimer--;
      if (this.intermissionTimer <= 0) {
        // Intermission complete! Increment level
        const nextLevel = this.state.currentLevel + 1;
        if (nextLevel > 20) {
          this.state.gamePhase = 'VICTORY';
        } else {
          this.loadLevel(nextLevel);
          this.state.gamePhase = 'PLAYING';
        }
      }
      return; // Pause other physics processing during intermission
    }

    // If game is in VICTORY or GAMEOVER phase, don't update physics
    if (this.state.gamePhase === 'VICTORY' || this.state.gamePhase === 'GAMEOVER') {
      this.state.player.isMoving = false;
      return;
    }

    // Update player flash duration
    if (this.state.player.flashTimer > 0) {
      this.state.player.flashTimer--;
    }

    this.updatePlayerMovement();
    this.recalculatePlayerFlowField();
    this.updateSpawning();
    this.updateEnemies();
    this.updateBullets();
    this.updateDropItems();
    this.updateFloatingTexts();
    this.updateFlakExplosions();

    // Check Stage Clear condition
    if (this.state.activeEnemies.length === 0 && this.state.spawnQueue.length === 0) {
      this.state.gamePhase = 'INTERMISSION';
      this.intermissionTimer = 120; // 2 seconds at 60 FPS
    }
  }

  private updatePlayerMovement(): void {
    const p = this.state.player;
    
    let dx = 0;
    let dy = 0;
    let nextDir: Direction | null = null;
    
    if (this.activeKeys.has('w') || this.activeKeys.has('arrowup')) {
      dy = -1;
      nextDir = Direction.UP;
    } else if (this.activeKeys.has('s') || this.activeKeys.has('arrowdown')) {
      dy = 1;
      nextDir = Direction.DOWN;
    } else if (this.activeKeys.has('a') || this.activeKeys.has('arrowleft')) {
      dx = -1;
      nextDir = Direction.LEFT;
    } else if (this.activeKeys.has('d') || this.activeKeys.has('arrowright')) {
      dx = 1;
      nextDir = Direction.RIGHT;
    }

    if (nextDir !== null) {
      p.isMoving = true;
      
      // Snapping assist perpendicularly
      if (p.direction !== nextDir) {
        const snapGrid = 16;
        const snapThreshold = 6;
        
        if (nextDir === Direction.LEFT || nextDir === Direction.RIGHT) {
          const remainder = (p.y - 2) % snapGrid;
          if (remainder !== 0) {
            if (remainder < snapThreshold) {
              p.y -= remainder;
            } else if (snapGrid - remainder < snapThreshold) {
              p.y += (snapGrid - remainder);
            }
          }
        } else if (nextDir === Direction.UP || nextDir === Direction.DOWN) {
          const remainder = (p.x - 2) % snapGrid;
          if (remainder !== 0) {
            if (remainder < snapThreshold) {
              p.x -= remainder;
            } else if (snapGrid - remainder < snapThreshold) {
              p.x += (snapGrid - remainder);
            }
          }
        }
      }
      
      p.direction = nextDir;

      let currentSpeed = 1.0 + 0.25 * (p.treadTier || 0);
      const onIce = this.checkOnIce(p.x, p.y, p.width, p.height);
      if (onIce) {
        currentSpeed = currentSpeed * 1.5;
      }

      const nextX = p.x + dx * currentSpeed;
      const nextY = p.y + dy * currentSpeed;

      if (!this.checkCollisionForTank('player', nextX, nextY, p.width, p.height)) {
        p.x = nextX;
        p.y = nextY;
      } else {
        p.isMoving = false;
      }
    } else {
      p.isMoving = false;
    }
  }

  private checkOnIce(x: number, y: number, width: number, height: number): boolean {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const col = Math.floor(cx / 32);
    const row = Math.floor(cy / 32);
    
    if (row >= 0 && row < 13 && col >= 0 && col < 13) {
      return this.state.grid[row][col].type === TileType.ICE;
    }
    return false;
  }

  private rectsOverlap(x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number): boolean {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  private checkCollisionForTank(tankId: string, x: number, y: number, width: number, height: number): boolean {
    const left = x;
    const right = x + width;
    const top = y;
    const bottom = y + height;

    // Bounds limit
    if (left < 0 || right > 416 || top < 0 || bottom > 416) {
      return true;
    }

    // Grid cells check
    const startCol = Math.max(0, Math.floor(left / 32));
    const endCol = Math.min(12, Math.floor((right - 1) / 32));
    const startRow = Math.max(0, Math.floor(top / 32));
    const endRow = Math.min(12, Math.floor((bottom - 1) / 32));

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r === 12 && c === 6) {
          return true; // base area eagle
        }
        
        const tile = this.state.grid[r][c];
        if (tile.type === TileType.STEEL || tile.type === TileType.WATER) {
          return true;
        }

        if (tile.type === TileType.BRICK) {
          const tileX = c * 32;
          const tileY = r * 32;

          for (let qr = 0; qr < 2; qr++) {
            for (let qc = 0; qc < 2; qc++) {
              if (tile.quadrants[qr][qc]) {
                const ql = tileX + qc * 16;
                const qrBound = ql + 16;
                const qt = tileY + qr * 16;
                const qb = qt + 16;

                if (left < qrBound && right > ql && top < qb && bottom > qt) {
                  return true;
                }
              }
            }
          }
        }
      }
    }

    // Check player overlap (if it's not the player)
    const p = this.state.player;
    if (tankId !== 'player') {
      if (p.lives >= 0 && this.rectsOverlap(left, top, width, height, p.x, p.y, p.width, p.height)) {
        return true;
      }
    }

    // Check active enemies (that are fully spawned)
    for (const enemy of this.state.activeEnemies) {
      if (enemy.id === tankId || enemy.spawnTimer > 0) continue;
      if (this.rectsOverlap(left, top, width, height, enemy.x, enemy.y, enemy.width, enemy.height)) {
        return true;
      }
    }

    return false;
  }

  private updateSpawning(): void {
    if (this.spawnClock > 0) {
      this.spawnClock--;
    }

    if (this.spawnClock <= 0) {
      const activeCount = this.state.activeEnemies.length;
      
      if (activeCount < 4 && this.state.spawnQueue.length > 0) {
        // Find free spawn coordinates
        const freeSpawns: number[] = [];
        
        for (let i = 0; i < this.spawnPoints.length; i++) {
          const pt = this.spawnPoints[i];
          let occupied = false;
          
          // Check player tank
          const p = this.state.player;
          if (p.lives >= 0 && this.rectsOverlap(pt.x, pt.y, 28, 28, p.x, p.y, p.width, p.height)) {
            occupied = true;
          }
          
          // Check other enemies
          for (const enemy of this.state.activeEnemies) {
            if (this.rectsOverlap(pt.x, pt.y, 28, 28, enemy.x, enemy.y, enemy.width, enemy.height)) {
              occupied = true;
              break;
            }
          }
          
          if (!occupied) {
            freeSpawns.push(i);
          }
        }
        
        if (freeSpawns.length > 0) {
          const spawnIndex = freeSpawns[Math.floor(Math.random() * freeSpawns.length)];
          const pt = this.spawnPoints[spawnIndex];
          const type = this.state.spawnQueue.shift()!;
          
          let speed = 1.0;
          let health = 1;
          if (type === 'FAST') {
            speed = 2.0;
          } else if (type === 'HEAVY') {
            speed = 0.6;
            health = 3;
          } else if (type === 'FLASHER') {
            speed = 1.0;
          }

          const id = Math.random().toString(36).substring(2, 9);
          
          this.state.activeEnemies.push({
            id,
            type,
            x: pt.x,
            y: pt.y,
            direction: Direction.DOWN,
            speed,
            width: 28,
            height: 28,
            health,
            maxHealth: health,
            isMoving: true,
            fireCooldown: 60 + Math.random() * 120, // 1 to 3 seconds
            flashTimer: 0,
            spawnTimer: 60, // 1 second warning animation
            targetToggleTimer: type === 'FAST' ? 180 : undefined,
            isTrackingPlayer: type === 'FAST' ? false : undefined,
            heavyFiringTimer: type === 'HEAVY' ? 0 : undefined,
            blockedTimer: 0
          });

          // Reset spawn clock based on level config spawnIntervalTicks
          const currentLvlConfig = LevelManager.getLevelConfig(this.state.currentLevel);
          this.spawnClock = currentLvlConfig.spawnIntervalTicks;
        }
      }
    }
  }

  private updateEnemies(): void {
    for (const enemy of this.state.activeEnemies) {
      if (enemy.spawnTimer > 0) {
        enemy.spawnTimer--;
        continue;
      }
      
      // Update flash timer
      if (enemy.flashTimer > 0) {
        enemy.flashTimer--;
      }

      // Archetype specific timers
      if (enemy.type === 'FAST') {
        if (enemy.targetToggleTimer !== undefined && enemy.targetToggleTimer > 0) {
          enemy.targetToggleTimer--;
          if (enemy.targetToggleTimer <= 0) {
            enemy.isTrackingPlayer = !enemy.isTrackingPlayer;
            enemy.targetToggleTimer = 180; // toggle every 3s
          }
        }
      }

      // Move AI tank
      this.updateEnemyMovement(enemy);
      
      // Shoot
      this.updateEnemyShooting(enemy);
    }
  }

  private isBrickAhead(enemy: EnemyTank): boolean {
    const lookAhead = 4;
    let bx = enemy.x;
    let by = enemy.y;
    let bw = enemy.width;
    let bh = enemy.height;
    
    if (enemy.direction === Direction.UP) {
      by -= lookAhead;
      bh = lookAhead;
    } else if (enemy.direction === Direction.DOWN) {
      by += enemy.height;
      bh = lookAhead;
    } else if (enemy.direction === Direction.LEFT) {
      bx -= lookAhead;
      bw = lookAhead;
    } else if (enemy.direction === Direction.RIGHT) {
      bx += enemy.width;
      bw = lookAhead;
    }
    
    const startCol = Math.max(0, Math.floor(bx / 32));
    const endCol = Math.min(12, Math.floor((bx + bw - 1) / 32));
    const startRow = Math.max(0, Math.floor(by / 32));
    const endRow = Math.min(12, Math.floor((by + bh - 1) / 32));
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const tile = this.state.grid[r][c];
        if (tile.type === TileType.BRICK) {
          const tileX = c * 32;
          const tileY = r * 32;
          for (let qr = 0; qr < 2; qr++) {
            for (let qc = 0; qc < 2; qc++) {
              if (tile.quadrants[qr][qc]) {
                const ql = tileX + qc * 16;
                const qrBound = ql + 16;
                const qt = tileY + qr * 16;
                const qb = qt + 16;
                if (bx < qrBound && bx + bw > ql && by < qb && by + bh > qt) {
                  return true;
                }
              }
            }
          }
        }
      }
    }
    return false;
  }

  private updateEnemyMovement(enemy: EnemyTank): void {
    // HEAVY wall blast action
    if (enemy.type === 'HEAVY' && enemy.heavyFiringTimer !== undefined && enemy.heavyFiringTimer > 0) {
      enemy.heavyFiringTimer--;
      enemy.isMoving = false;
      
      // Face wall and rapid blast
      if (enemy.fireCooldown <= 0) {
        this.fireEnemyBullet(enemy);
        enemy.fireCooldown = 30; // rapid rate
      } else {
        enemy.fireCooldown--;
      }
      return;
    }

    let speed = enemy.speed;
    const onIce = this.checkOnIce(enemy.x, enemy.y, enemy.width, enemy.height);
    if (onIce) {
      speed = enemy.speed * 1.5;
    }

    // Micro-grid intersection decision point
    const isIntersection = (enemy.x - 2) % 16 === 0 && (enemy.y - 2) % 16 === 0;
    
    if (isIntersection) {
      enemy.direction = this.getLowestCostDirection(enemy);
    }

    let dx = 0;
    let dy = 0;
    if (enemy.direction === Direction.UP) dy = -1;
    else if (enemy.direction === Direction.DOWN) dy = 1;
    else if (enemy.direction === Direction.LEFT) dx = -1;
    else if (enemy.direction === Direction.RIGHT) dx = 1;

    const nextX = enemy.x + dx * speed;
    const nextY = enemy.y + dy * speed;

    const collided = this.checkCollisionForTank(enemy.id, nextX, nextY, enemy.width, enemy.height);

    if (!collided) {
      enemy.x = nextX;
      enemy.y = nextY;
      enemy.isMoving = true;
      enemy.blockedTimer = 0;
    } else {
      enemy.isMoving = false;
      
      // HEAVY specific blast trigger on brick collision
      if (enemy.type === 'HEAVY' && this.isBrickAhead(enemy)) {
        enemy.heavyFiringTimer = 45;
        this.fireEnemyBullet(enemy);
        enemy.fireCooldown = 25;
        return;
      }

      // Check if blocked by another active enemy tank (anti-clumping logic)
      const isBlockedByEnemy = this.checkBlockedByEnemy(enemy, nextX, nextY);
      if (isBlockedByEnemy) {
        if (enemy.blockedTimer === undefined) enemy.blockedTimer = 0;
        enemy.blockedTimer++;
        
        if (enemy.blockedTimer > 20) { // blocked for 0.3s
          const directions = [
            { dir: Direction.UP, dx: 0, dy: -1 },
            { dir: Direction.DOWN, dx: 0, dy: 1 },
            { dir: Direction.LEFT, dx: -1, dy: 0 },
            { dir: Direction.RIGHT, dx: 1, dy: 0 },
          ];
          
          const passableAlts = directions.filter(d => {
            const tx = enemy.x + d.dx * enemy.speed;
            const ty = enemy.y + d.dy * enemy.speed;
            return !this.checkCollisionForTank(enemy.id, tx, ty, enemy.width, enemy.height);
          });
          
          if (passableAlts.length > 0) {
            enemy.direction = passableAlts[Math.floor(Math.random() * passableAlts.length)].dir;
          }
          enemy.blockedTimer = 0;
          return;
        }
      }

      // General snap and redirect behavior for normal obstacles
      const snapGrid = 16;
      enemy.x = Math.round((enemy.x - 2) / snapGrid) * snapGrid + 2;
      enemy.y = Math.round((enemy.y - 2) / snapGrid) * snapGrid + 2;
      
      enemy.direction = this.getLowestCostDirection(enemy);
    }
  }

  private checkBlockedByEnemy(enemy: EnemyTank, x: number, y: number): boolean {
    for (const other of this.state.activeEnemies) {
      if (other.id === enemy.id || other.spawnTimer > 0) continue;
      if (this.rectsOverlap(x, y, enemy.width, enemy.height, other.x, other.y, other.width, other.height)) {
        return true;
      }
    }
    return false;
  }

  private getLowestCostDirection(enemy: EnemyTank): Direction {
    const r = Math.floor((enemy.y + enemy.height / 2) / 16);
    const c = Math.floor((enemy.x + enemy.width / 2) / 16);
    
    // Choose cost matrix map
    let flowField = this.baseFlowField;
    if (enemy.type === 'HEAVY') {
      flowField = this.heavyFlowField;
    } else if (enemy.type === 'FAST' && enemy.isTrackingPlayer && this.playerFlowField.length > 0) {
      flowField = this.playerFlowField;
    }
    
    const directions = [
      { dir: Direction.UP, dr: -1, dc: 0, dx: 0, dy: -1 },
      { dir: Direction.DOWN, dr: 1, dc: 0, dx: 0, dy: 1 },
      { dir: Direction.LEFT, dr: 0, dc: -1, dx: -1, dy: 0 },
      { dir: Direction.RIGHT, dr: 0, dc: 1, dx: 1, dy: 0 },
    ];
    
    // Check if FLASHER should randomly deviate at macro-grid intersection
    const isMacro = (enemy.x - 2) % 32 === 0 && (enemy.y - 2) % 32 === 0;
    if (enemy.type === 'FLASHER' && isMacro && Math.random() < 0.15) {
      const passable = directions.filter(d => {
        const tx = enemy.x + d.dx * enemy.speed;
        const ty = enemy.y + d.dy * enemy.speed;
        return !this.checkCollisionForTank(enemy.id, tx, ty, enemy.width, enemy.height);
      });
      if (passable.length > 0) {
        return passable[Math.floor(Math.random() * passable.length)].dir;
      }
    }
    
    let bestDir = enemy.direction;
    let minCost = 9999;
    
    for (const d of directions) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      
      if (nr < 0 || nr >= 26 || nc < 0 || nc >= 26) {
        continue;
      }
      
      const cost = flowField[nr][nc];
      const tx = enemy.x + d.dx * enemy.speed;
      const ty = enemy.y + d.dy * enemy.speed;
      
      const collided = this.checkCollisionForTank(enemy.id, tx, ty, enemy.width, enemy.height);
      
      if (!collided && cost < minCost) {
        minCost = cost;
        bestDir = d.dir;
      }
    }
    
    return bestDir;
  }

  private updateEnemyShooting(enemy: EnemyTank): void {
    if (enemy.fireCooldown > 0) {
      enemy.fireCooldown--;
    }

    if (enemy.fireCooldown <= 0) {
      this.fireEnemyBullet(enemy);
      
      // Cooldown reset
      let rate = 150;
      if (enemy.type === 'HEAVY') {
        rate = 80 + Math.random() * 50;
      } else if (enemy.type === 'FAST') {
        rate = 120 + Math.random() * 100;
      } else {
        rate = 150 + Math.random() * 100;
      }
      enemy.fireCooldown = rate;
    }
  }

  private fireEnemyBullet(enemy: EnemyTank): void {
    let bx = enemy.x + enemy.width / 2;
    let by = enemy.y + enemy.height / 2;
    const bSpeed = enemy.type === 'HEAVY' ? 8 : 5;
    const offset = 14;

    if (enemy.direction === Direction.UP) by -= offset;
    else if (enemy.direction === Direction.DOWN) by += offset;
    else if (enemy.direction === Direction.LEFT) bx -= offset;
    else if (enemy.direction === Direction.RIGHT) bx += offset;

    this.bullets.push({
      x: bx,
      y: by,
      vx: enemy.direction === Direction.LEFT ? -bSpeed : enemy.direction === Direction.RIGHT ? bSpeed : 0,
      vy: enemy.direction === Direction.UP ? -bSpeed : enemy.direction === Direction.DOWN ? bSpeed : 0,
      direction: enemy.direction,
      active: true,
      radius: 3,
      owner: 'ENEMY'
    });
  }

  private spawnDropItem(x: number, y: number, type: 'SILICON' | 'FERRO' | 'KINETIC_CORE'): void {
    const id = Math.random().toString(36).substring(2, 9);
    this.state.dropItems.push({
      id,
      x,
      y,
      type,
      lifeTimer: 600, // 10 seconds
      vx: 0,
      vy: 0
    });
  }

  private triggerFlakExplosion(bx: number, by: number): void {
    this.flakExplosions.push({
      x: bx,
      y: by,
      timer: 15
    });

    // Clear brick quadrants in a 3x3 micro-grid area centered around the bullet coords (16px spacing)
    const br = Math.floor(by / 16);
    const bc = Math.floor(bx / 16);

    let mapAltered = false;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = br + dr;
        const nc = bc + dc;

        if (nr < 0 || nr >= 26 || nc < 0 || nc >= 26) continue;

        const mr = Math.floor(nr / 2);
        const mc = Math.floor(nc / 2);
        const tile = this.state.grid[mr]?.[mc];

        if (tile && tile.type === TileType.BRICK) {
          const qr = nr % 2;
          const qc = nc % 2;
          if (tile.quadrants[qr][qc]) {
            tile.quadrants[qr][qc] = false;
            mapAltered = true;

            // Trigger minor random silicon shards reward chance for flak collaterals
            if (Math.random() < 0.25) {
              const qx = mc * 32 + qc * 16 + 8;
              const qy = mr * 32 + qr * 16 + 8;
              this.spawnDropItem(qx, qy, 'SILICON');
            }

            const anyLeft = tile.quadrants[0][0] || tile.quadrants[0][1] || tile.quadrants[1][0] || tile.quadrants[1][1];
            if (!anyLeft) {
              tile.type = TileType.EMPTY;
            }
          }
        }
      }
    }

    if (mapAltered) {
      this.recalculateStaticFlowFields();
    }
  }

  private updateBullets(): void {
    // 1. Bullet vs Bullet collisions
    for (let i = 0; i < this.bullets.length; i++) {
      const b1 = this.bullets[i];
      if (!b1.active) continue;
      
      for (let j = i + 1; j < this.bullets.length; j++) {
        const b2 = this.bullets[j];
        if (!b2.active) continue;
        
        if (b1.owner !== b2.owner) {
          const dist = Math.hypot(b1.x - b2.x, b1.y - b2.y);
          if (dist < (b1.radius + b2.radius + 2)) {
            b1.active = false;
            b2.active = false;
            break;
          }
        }
      }
    }

    // 2. Physics & damage updates
    let mapAltered = false;
    
    for (const b of this.bullets) {
      if (!b.active) continue;

      b.x += b.vx;
      b.y += b.vy;

      // Boundary check
      if (b.x < 0 || b.x > 416 || b.y < 0 || b.y > 416) {
        b.active = false;
        continue;
      }

      // Base core collision (Eagle)
      if (b.y >= 12 * 32 && b.y < 13 * 32 && b.x >= 6 * 32 && b.x < 7 * 32) {
        if (!this.baseDestroyed) {
          this.baseDestroyed = true;
          b.active = false;
          continue;
        }
      }

      // Player collision
      if (b.owner === 'ENEMY') {
        const p = this.state.player;
        if (p.lives >= 0) {
          if (
            b.x >= p.x && b.x <= p.x + p.width &&
            b.y >= p.y && b.y <= p.y + p.height
          ) {
            b.active = false;
            if (p.flashTimer <= 0) {
              p.lives--;
              if (p.lives >= 0) {
                p.x = 6 * 32 + 2;
                p.y = 11 * 32 + 2;
                p.direction = Direction.UP;
                p.flashTimer = 90; // Invincible flash (1.5 seconds)
              }
            }
            continue;
          }
        }
      }

      // Enemies collision
      if (b.owner === 'PLAYER') {
        let hitEnemy = false;
        for (const enemy of this.state.activeEnemies) {
          if (enemy.spawnTimer > 0) continue;
          
          if (
            b.x >= enemy.x && b.x <= enemy.x + enemy.width &&
            b.y >= enemy.y && b.y <= enemy.y + enemy.height
          ) {
            b.active = false;
            hitEnemy = true;
            
            // Flak payload trigger on hit
            if (this.state.player.proximityFlak) {
              this.triggerFlakExplosion(b.x, b.y);
            }

            enemy.health--;
            if (enemy.health > 0) {
              enemy.flashTimer = 15; // Hit flash feedback
            } else {
              // Destroyed
              this.state.activeEnemies = this.state.activeEnemies.filter(e => e.id !== enemy.id);
              this.state.killCount++;
              
              // Resource loot drop spawning
              if (enemy.type === 'HEAVY') {
                this.spawnDropItem(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'FERRO');
              } else if (enemy.type === 'FLASHER') {
                this.spawnDropItem(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'KINETIC_CORE');
              }
            }
            break;
          }
        }
        if (hitEnemy) continue;
      }

      // Grid collision
      const col = Math.floor(b.x / 32);
      const row = Math.floor(b.y / 32);

      if (row >= 0 && row < 13 && col >= 0 && col < 13) {
        const tile = this.state.grid[row][col];

        if (tile.type === TileType.STEEL) {
          // Steel triggers flak too
          if (b.owner === 'PLAYER' && this.state.player.proximityFlak) {
            this.triggerFlakExplosion(b.x, b.y);
          }
          b.active = false;
        } 
        else if (tile.type === TileType.BRICK) {
          const tileX = col * 32;
          const tileY = row * 32;
          
          const qc = Math.floor((b.x - tileX) / 16);
          const qr = Math.floor((b.y - tileY) / 16);
          
          if (qc >= 0 && qc < 2 && qr >= 0 && qr < 2) {
            if (tile.quadrants[qr][qc]) {
              tile.quadrants[qr][qc] = false;
              mapAltered = true;

              // Spawn SILICON loot with 25% probability
              if (b.owner === 'PLAYER' && Math.random() < 0.25) {
                const qx = tileX + qc * 16 + 8;
                const qy = tileY + qr * 16 + 8;
                this.spawnDropItem(qx, qy, 'SILICON');
              }

              const anyLeft = tile.quadrants[0][0] || tile.quadrants[0][1] || tile.quadrants[1][0] || tile.quadrants[1][1];
              if (!anyLeft) {
                tile.type = TileType.EMPTY;
              }

              // Flak explodes
              if (b.owner === 'PLAYER' && this.state.player.proximityFlak) {
                this.triggerFlakExplosion(b.x, b.y);
                b.active = false;
              }
              // Piercing allows going through 1 brick (stops at 2nd)
              else if (b.owner === 'PLAYER' && this.state.player.kineticPiercing) {
                if (b.penetrationCount === undefined) b.penetrationCount = 0;
                b.penetrationCount++;
                if (b.penetrationCount >= 2) {
                  b.active = false;
                }
              } else {
                b.active = false;
              }
            }
          }
        }
      }
    }

    this.bullets = this.bullets.filter(b => b.active);
    
    // Recalculate static flow fields if any brick got destroyed
    if (mapAltered) {
      this.recalculateStaticFlowFields();
    }
  }

  private updateDropItems(): void {
    const p = this.state.player;
    const px = p.x + p.width / 2;
    const py = p.y + p.height / 2;
    
    for (const d of this.state.dropItems) {
      d.lifeTimer--;
      
      const dist = Math.hypot(px - d.x, py - d.y);
      
      // Magnetic pull within 96 pixels (3 macro tiles)
      if (dist < 96) {
        const dx = px - d.x;
        const dy = py - d.y;
        
        // Accumulate pull velocity
        d.vx += (dx / dist) * 0.4;
        d.vy += (dy / dist) * 0.4;
        
        // Speed cap
        const speed = Math.hypot(d.vx, d.vy);
        if (speed > 6) {
          d.vx = (d.vx / speed) * 6;
          d.vy = (d.vy / speed) * 6;
        }
        
        d.x += d.vx;
        d.y += d.vy;
      }
      
      // Collection intersection
      if (this.rectsOverlap(p.x, p.y, p.width, p.height, d.x - 4, d.y - 4, 8, 8)) {
        d.lifeTimer = 0; // mark for deletion
        
        // Award quantities
        let rewardText = '';
        if (d.type === 'SILICON') {
          this.state.resources.siliconShards += 5;
          rewardText = '+5 SILICON';
        } else if (d.type === 'FERRO') {
          this.state.resources.ferroAlloys += 1;
          rewardText = '+1 FERRO';
        } else if (d.type === 'KINETIC_CORE') {
          this.state.resources.kineticCores += 1;
          rewardText = '+1 CORE';
        }

        // Spawn floating text particle
        this.state.floatingTexts.push({
          id: Math.random().toString(36).substring(2, 9),
          x: d.x,
          y: d.y - 10,
          text: rewardText,
          timer: 60
        });
      }
    }
    
    // Filter active items
    this.state.dropItems = this.state.dropItems.filter(d => d.lifeTimer > 0);
  }

  private updateFloatingTexts(): void {
    for (const f of this.state.floatingTexts) {
      f.timer--;
      f.y -= 0.5; // slow drift upwards
    }
    this.state.floatingTexts = this.state.floatingTexts.filter(f => f.timer > 0);
  }

  private updateFlakExplosions(): void {
    for (const ex of this.flakExplosions) {
      ex.timer--;
    }
    this.flakExplosions = this.flakExplosions.filter(ex => ex.timer > 0);
  }

  private render(): void {
    // Clear screen
    this.ctx.fillStyle = '#050508';
    this.ctx.fillRect(0, 0, 416, 416);

    // Pass 1: Render ICE floor under everything
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        if (this.state.grid[r][c].type === TileType.ICE) {
          this.drawTile(r, c, this.state.grid[r][c]);
        }
      }
    }

    // Pass 2: Render rest of terrain elements (except Bushes which cover tanks)
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const tile = this.state.grid[r][c];
        if (tile.type !== TileType.BUSH && tile.type !== TileType.ICE) {
          this.drawTile(r, c, tile);
        }
      }
    }

    // Draw base Eagle
    this.drawEagleBase(12 * 32, 6 * 32);

    // Draw Player Tank
    this.drawPlayerTank();

    // Draw Enemy Tanks
    for (const enemy of this.state.activeEnemies) {
      this.drawEnemyTank(enemy);
    }

    // Draw Resource Drops
    for (const item of this.state.dropItems) {
      this.drawDropItem(item);
    }

    // Draw Projectiles
    this.drawBullets();

    // Draw Flak shockwaves
    this.drawFlakExplosions();

    // Pass 3: Render Bushes on top (tanks hide under them)
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        if (this.state.grid[r][c].type === TileType.BUSH) {
          this.drawTile(r, c, this.state.grid[r][c]);
        }
      }
    }

    // Draw Floating Text particles
    this.drawFloatingTexts();

    // Pass 4: F3 Flow Field Debug Layer Overlay
    if (this.state.debugMode) {
      this.drawDebugOverlay();
    }

    // Campaign Screen Overlays
    if (this.state.gamePhase === 'GAMEOVER') {
      this.drawGameOverScreen();
    } else if (this.state.gamePhase === 'INTERMISSION') {
      this.drawIntermissionScreen();
    } else if (this.state.gamePhase === 'VICTORY') {
      this.drawVictoryScreen();
    }
  }

  private drawTile(row: number, col: number, tile: MacroTile): void {
    const x = col * 32;
    const y = row * 32;
    const ctx = this.ctx;

    switch (tile.type) {
      case TileType.STEEL:
        ctx.fillStyle = '#64748b';
        ctx.fillRect(x, y, 32, 32);
        
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, 28, 28);
        
        ctx.fillStyle = '#475569';
        ctx.fillRect(x + 6, y + 6, 20, 20);
        
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(x + 6, y + 6, 4, 4);
        ctx.fillRect(x + 22, y + 6, 4, 4);
        break;

      case TileType.BRICK:
        for (let qr = 0; qr < 2; qr++) {
          for (let qc = 0; qc < 2; qc++) {
            if (tile.quadrants[qr][qc]) {
              const qx = x + qc * 16;
              const qy = y + qr * 16;
              
              ctx.fillStyle = '#b91c1c';
              ctx.fillRect(qx, qy, 16, 16);
              
              ctx.fillStyle = '#ef4444';
              ctx.fillRect(qx, qy, 16, 2);
              ctx.fillRect(qx, qy + 8, 16, 2);
              
              ctx.fillStyle = '#450a0a';
              ctx.fillRect(qx + 8, qy, 2, 8);
              ctx.fillRect(qx + 4, qy + 8, 2, 8);
              ctx.fillRect(qx + 12, qy + 8, 2, 8);
              
              ctx.fillStyle = '#7f1d1d';
              ctx.fillRect(qx, qy + 14, 16, 2);
              ctx.fillRect(qx + 14, qy, 2, 16);
            }
          }
        }
        break;

      case TileType.WATER: {
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(x, y, 32, 32);
        
        ctx.fillStyle = '#06b6d4';
        const rippleOffset = Math.sin((this.frameCounter + (col + row) * 10) / 12) * 4;
        
        ctx.fillRect(x + 4, y + 8 + rippleOffset, 10, 2);
        ctx.fillRect(x + 18, y + 14 - rippleOffset, 10, 2);
        ctx.fillRect(x + 8, y + 24 + rippleOffset, 12, 2);
        break;
      }

      case TileType.BUSH:
        ctx.fillStyle = '#15803d';
        ctx.fillRect(x, y, 32, 32);
        
        ctx.fillStyle = '#22c55e';
        this.drawCircle(x + 8, y + 8, 8);
        this.drawCircle(x + 24, y + 8, 8);
        this.drawCircle(x + 8, y + 24, 8);
        this.drawCircle(x + 24, y + 24, 8);
        this.drawCircle(x + 16, y + 16, 10);
        
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(x + 6, y + 6, 3, 3);
        ctx.fillRect(x + 22, y + 22, 3, 3);
        break;

      case TileType.ICE:
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(x, y, 32, 32);
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 28);
        ctx.lineTo(x + 28, y + 4);
        ctx.moveTo(x + 12, y + 28);
        ctx.lineTo(x + 28, y + 12);
        ctx.stroke();
        break;
        
      default:
        break;
    }
  }

  private drawCircle(cx: number, cy: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    this.ctx.fill();
  }

  private drawEagleBase(y: number, x: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#050508';
    ctx.fillRect(x, y, 32, 32);

    if (this.baseDestroyed) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(x + 4, y + 8, 24, 20);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x + 8, y + 12, 16, 12);
      ctx.fillStyle = '#ff073a';
      ctx.fillRect(x + 10, y + 16, 3, 3);
      ctx.fillRect(x + 19, y + 16, 3, 3);
      return;
    }

    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 4);
    ctx.lineTo(x + 28, y + 14);
    ctx.lineTo(x + 24, y + 28);
    ctx.lineTo(x + 8, y + 28);
    ctx.lineTo(x + 4, y + 14);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(x + 6, y + 14, 6, 10);
    ctx.fillRect(x + 20, y + 14, 6, 10);
    
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x + 14, y + 12, 4, 4);
    ctx.fillRect(x + 12, y + 14, 8, 2);
  }

  private drawPlayerTank(): void {
    if (this.baseDestroyed || this.state.player.lives < 0) return;
    
    const p = this.state.player;
    const ctx = this.ctx;

    // Damage flash blinking
    if (p.flashTimer > 0) {
      const show = Math.floor(this.frameCounter / 4) % 2 === 0;
      if (!show) return;
    }
    
    ctx.save();
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    ctx.translate(cx, cy);
    
    let angle = 0;
    if (p.direction === Direction.DOWN) angle = Math.PI;
    else if (p.direction === Direction.LEFT) angle = -Math.PI / 2;
    else if (p.direction === Direction.RIGHT) angle = Math.PI / 2;
    
    ctx.rotate(angle);
    
    const halfW = p.width / 2;
    const halfH = p.height / 2;
    
    // Treads
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-halfW, -halfH, 6, p.height);
    ctx.fillRect(halfW - 6, -halfH, 6, p.height);
    
    ctx.fillStyle = '#15803d';
    const treadOffset = p.isMoving ? (this.frameCounter % 4) : 0;
    for (let ty = -halfH + treadOffset; ty < halfH; ty += 6) {
      ctx.fillRect(-halfW, ty, 6, 2);
      ctx.fillRect(halfW - 6, ty, 6, 2);
    }
    
    // Hull
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(-halfW + 5, -halfH + 4, 18, 20);
    
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(-halfW + 8, -halfH + 6, 12, 16);
    
    // Turret
    ctx.fillStyle = '#14532d';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-2, -2, 4, 4);
    
    // Barrel (Reflected based on active payloads)
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-2, -halfH - 2, 4, halfH + 2);
    
    // Draw visual modifiers for purchased payloads
    if (p.kineticPiercing) {
      // Orange tip muzzle highlight
      ctx.fillStyle = '#ff5e36';
      ctx.fillRect(-3, -halfH - 6, 6, 4);
    } else {
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(-3, -halfH - 4, 6, 3);
    }

    if (p.proximityFlak) {
      // Outer side thruster muzzle bands
      ctx.fillStyle = '#00f2fe';
      ctx.fillRect(-4, -halfH, 2, 6);
      ctx.fillRect(2, -halfH, 2, 6);
    }
    
    ctx.restore();
  }

  private drawEnemyTank(enemy: EnemyTank): void {
    const ctx = this.ctx;
    
    // Warning spawning flashing star animation
    if (enemy.spawnTimer > 0) {
      const cx = enemy.x + enemy.width / 2;
      const cy = enemy.y + enemy.height / 2;
      const flash = Math.floor(this.frameCounter / 5) % 2 === 0;
      
      if (flash) {
        ctx.save();
        ctx.translate(cx, cy);
        
        ctx.fillStyle = '#ff5e36'; // Neon orange star warning
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const r = i % 2 === 0 ? 12 : 5;
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    
    // Physicalized tank
    ctx.save();
    const cx = enemy.x + enemy.width / 2;
    const cy = enemy.y + enemy.height / 2;
    ctx.translate(cx, cy);
    
    let angle = 0;
    if (enemy.direction === Direction.DOWN) angle = Math.PI;
    else if (enemy.direction === Direction.LEFT) angle = -Math.PI / 2;
    else if (enemy.direction === Direction.RIGHT) angle = Math.PI / 2;
    ctx.rotate(angle);
    
    // Colors
    let primaryColor = '#94a3b8'; // Basic silver
    let accentColor = '#475569';
    let highlightColor = '#cbd5e1';
    
    if (enemy.type === 'FAST') {
      primaryColor = '#f59e0b';
      accentColor = '#b45309';
      highlightColor = '#fef08a';
    } else if (enemy.type === 'HEAVY') {
      primaryColor = '#15803d'; // Dark olive
      accentColor = '#14532d';
      highlightColor = '#86efac';
    } else if (enemy.type === 'FLASHER') {
      // Periodic gold / pink flashing
      const flash = Math.floor(this.frameCounter / 8) % 2 === 0;
      if (flash) {
        primaryColor = '#ec4899';
        accentColor = '#9d174d';
        highlightColor = '#fbcfe8';
      } else {
        primaryColor = '#d97706';
        accentColor = '#78350f';
        highlightColor = '#fde68a';
      }
    }
    
    // Visual damage hit flash feedback
    if (enemy.flashTimer > 0) {
      const hitFlash = Math.floor(this.frameCounter / 3) % 2 === 0;
      if (hitFlash) {
        primaryColor = '#ffffff';
        accentColor = '#e2e8f0';
        highlightColor = '#ffffff';
      }
    }
    
    const halfW = enemy.width / 2;
    const halfH = enemy.height / 2;
    
    // Treads
    ctx.fillStyle = accentColor;
    ctx.fillRect(-halfW, -halfH, 5, enemy.height);
    ctx.fillRect(halfW - 5, -halfH, 5, enemy.height);
    
    ctx.fillStyle = '#0f172a';
    for (let ty = -halfH; ty < halfH; ty += 4) {
      ctx.fillRect(-halfW, ty, 5, 1);
      ctx.fillRect(halfW - 5, ty, 5, 1);
    }
    
    // Hull
    ctx.fillStyle = primaryColor;
    ctx.fillRect(-halfW + 4, -halfH + 3, 16, 20);
    
    ctx.fillStyle = highlightColor;
    ctx.fillRect(-halfW + 6, -halfH + 5, 12, 16);
    
    // Turret
    ctx.fillStyle = accentColor;
    ctx.fillRect(-4, -4, 8, 8);
    
    // Barrel
    ctx.fillStyle = primaryColor;
    ctx.fillRect(-2, -halfH - 2, 4, halfH + 2);
    ctx.fillStyle = highlightColor;
    ctx.fillRect(-3, -halfH - 4, 6, 3);
    
    ctx.restore();
  }

  private drawDropItem(item: DropItem): void {
    const ctx = this.ctx;
    
    // Blink if expiring soon (less than 2 seconds / 120 updates)
    if (item.lifeTimer < 120 && Math.floor(this.frameCounter / 8) % 2 === 0) {
      return;
    }
    
    const size = 12;
    // unique pulse offset per drop item based on ID chars
    const charCodeSum = item.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const pulse = Math.sin((this.frameCounter + charCodeSum) / 10) * 1.5;
    
    ctx.save();
    ctx.translate(item.x, item.y);
    
    if (item.type === 'SILICON') {
      // Cyan diamond shard
      ctx.fillStyle = '#00f2fe';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -size / 2 - pulse);
      ctx.lineTo(size / 2 + pulse, 0);
      ctx.lineTo(0, size / 2 + pulse);
      ctx.lineTo(-size / 2 - pulse, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (item.type === 'FERRO') {
      // Orange rectangular alloy plate
      ctx.fillStyle = '#ff5e36';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-size / 2 - pulse / 2, -size / 2 - pulse / 2, size + pulse, size + pulse);
      ctx.strokeRect(-size / 2 - pulse / 2, -size / 2 - pulse / 2, size + pulse, size + pulse);
    } else if (item.type === 'KINETIC_CORE') {
      // Glowing green circular sphere
      ctx.fillStyle = '#39ff14';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, size / 2 + pulse, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // inner glowing core point
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    ctx.restore();
  }

  private drawBullets(): void {
    const ctx = this.ctx;
    
    for (const b of this.bullets) {
      if (!b.active) continue;
      
      ctx.fillStyle = b.owner === 'PLAYER' ? '#ff073a' : '#00f2fe'; // Neon red vs neon blue shells
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = b.owner === 'PLAYER' ? 'rgba(255, 7, 58, 0.4)' : 'rgba(0, 242, 254, 0.4)';
      ctx.beginPath();
      ctx.arc(b.x - (b.vx / 2), b.y - (b.vy / 2), b.radius + 1, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  private drawFlakExplosions(): void {
    const ctx = this.ctx;
    ctx.save();

    for (const ex of this.flakExplosions) {
      const alpha = ex.timer / 15;
      const progress = 1 - (ex.timer / 15);
      const radius = 28 * progress;

      ctx.fillStyle = `rgba(255, 94, 54, ${alpha * 0.25})`;
      ctx.strokeStyle = `rgba(255, 7, 58, ${alpha * 0.85})`;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(ex.x, ex.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawFloatingTexts(): void {
    const ctx = this.ctx;
    ctx.save();
    
    ctx.font = 'bold 8px "Press Start 2P"';
    ctx.textAlign = 'center';
    
    for (const f of this.state.floatingTexts) {
      const alpha = f.timer / 60;
      
      if (f.text.includes('SILICON')) {
        ctx.fillStyle = `rgba(0, 242, 254, ${alpha})`;
      } else if (f.text.includes('FERRO')) {
        ctx.fillStyle = `rgba(255, 94, 54, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(57, 255, 20, ${alpha})`;
      }
      
      ctx.fillText(f.text, f.x, f.y);
    }
    
    ctx.restore();
  }

  private drawDebugOverlay(): void {
    const ctx = this.ctx;
    ctx.save();
    
    // Draw thin micro-grid lines
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 26; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 16, 0);
      ctx.lineTo(i * 16, 416);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, i * 16);
      ctx.lineTo(416, i * 16);
      ctx.stroke();
    }

    // Draw Dijkstra cost numbers inside passable cells
    ctx.font = 'bold 8px "Share Tech Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let r = 0; r < 26; r++) {
      for (let c = 0; c < 26; c++) {
        const cost = this.baseFlowField[r][c];
        if (cost < 9999) {
          ctx.fillStyle = 'rgba(0, 242, 254, 0.55)';
          ctx.fillText(cost.toString(), c * 16 + 8, r * 16 + 8);
        } else {
          // Draw a small red dot for steel/water obstacle cells
          ctx.fillStyle = 'rgba(255, 7, 58, 0.2)';
          ctx.fillRect(c * 16 + 5, r * 16 + 5, 6, 6);
        }
      }
    }
    
    ctx.restore();
  }

  private drawGameOverScreen(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5, 5, 8, 0.9)';
    ctx.fillRect(0, 0, 416, 416);

    ctx.fillStyle = '#ff073a';
    ctx.font = 'bold 18px "Press Start 2P"';
    ctx.textAlign = 'center';
    
    if (this.baseDestroyed) {
      ctx.fillText('SHIELD CORE', 208, 100);
      ctx.fillText('COMPROMISED', 208, 130);
    } else {
      ctx.fillText('TANK DEFEATED', 208, 115);
    }
    
    // Performance Summary card
    ctx.strokeStyle = 'rgba(255, 7, 58, 0.4)';
    ctx.fillStyle = 'rgba(255, 7, 58, 0.05)';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 160, 296, 150);
    ctx.fillRect(60, 160, 296, 150);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Press Start 2P"';
    ctx.fillText('PERFORMANCE LOG', 208, 185);

    ctx.font = '12px "Share Tech Mono"';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText(`LEVEL REACHED:   ${this.state.currentLevel}`, 90, 215);
    ctx.fillText(`SILICON SHARDS:  ${this.state.resources.siliconShards}`, 90, 235);
    ctx.fillText(`FERRO-ALLOYS:    ${this.state.resources.ferroAlloys}`, 90, 255);
    ctx.fillText(`KINETIC CORES:   ${this.state.resources.kineticCores}`, 90, 275);
    
    ctx.textAlign = 'center';
    ctx.font = '11px "Share Tech Mono"';
    ctx.fillStyle = '#ff073a';
    ctx.fillText('CLICK RESTART GAME TO PLAY AGAIN', 208, 350);
  }

  private drawIntermissionScreen(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5, 5, 8, 0.85)';
    ctx.fillRect(0, 0, 416, 416);

    ctx.fillStyle = '#39ff14'; // Bright green
    ctx.font = 'bold 14px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(`STAGE ${this.state.currentLevel} COMPLETE`, 208, 180);

    ctx.fillStyle = '#00f2fe'; // Neon cyan
    ctx.font = '10px "Press Start 2P"';
    ctx.fillText(`PREPARING STAGE ${this.state.currentLevel + 1}...`, 208, 230);
  }

  private drawVictoryScreen(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, 416, 416);

    // Animate digital grid background
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.05)';
    ctx.lineWidth = 1;
    const gridOffset = (this.frameCounter % 32);
    for (let x = gridOffset; x < 416; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 416);
      ctx.stroke();
    }
    for (let y = gridOffset; y < 416; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(416, y);
      ctx.stroke();
    }

    // Animated star sparks
    ctx.fillStyle = '#39ff14';
    for (let i = 0; i < 8; i++) {
      const sparkX = ((i * 73 + this.frameCounter * 0.5) % 356) + 30;
      const sparkY = ((i * 117 + this.frameCounter * 0.3) % 200) + 50;
      const size = 2 + Math.abs(Math.sin((this.frameCounter + i * 20) / 10)) * 3;
      ctx.fillRect(sparkX, sparkY, size, size);
    }

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39ff14'; // Neon Green
    ctx.font = 'bold 20px "Press Start 2P"';
    ctx.fillText('VICTORY', 208, 80);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Press Start 2P"';
    ctx.fillText('CAMPAIGN FULLY COMPLETED', 208, 115);

    // Scrolling stats container
    ctx.save();
    // Clip rect for scrolling stats
    ctx.beginPath();
    ctx.rect(50, 140, 316, 180);
    ctx.clip();

    const startY = 320;
    const speed = 0.5;
    const totalHeight = 220;
    const scrollY = startY - ((this.frameCounter * speed) % totalHeight);

    ctx.textAlign = 'center';
    ctx.font = '11px "Press Start 2P"';
    ctx.fillStyle = '#00f2fe';
    ctx.fillText('CAMPAIGN METRICS', 208, scrollY);

    ctx.font = '12px "Share Tech Mono"';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`LEVELS CONQUERED: 20 / 20`, 208, scrollY + 30);
    ctx.fillText(`TOTAL ENEMY KILLS: ${this.state.killCount}`, 208, scrollY + 55);
    ctx.fillText(`SILICON COLLECTED: ${this.state.resources.siliconShards}`, 208, scrollY + 80);
    ctx.fillText(`FERRO-ALLOYS HARVESTED: ${this.state.resources.ferroAlloys}`, 208, scrollY + 105);
    ctx.fillText(`KINETIC CORES ACQUIRED: ${this.state.resources.kineticCores}`, 208, scrollY + 130);
    ctx.fillText(`LIVES REMAINING: ${this.state.player.lives}`, 208, scrollY + 155);

    ctx.restore();

    // Glass border overlay
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 138, 320, 184);

    // Restart Game prompt at bottom
    ctx.textAlign = 'center';
    ctx.font = '11px "Share Tech Mono"';
    ctx.fillStyle = '#39ff14';
    const blink = Math.floor(this.frameCounter / 20) % 2 === 0;
    if (blink) {
      ctx.fillText('PRESS RESTART GAME TO PLAY AGAIN', 208, 360);
    }
  }
}
