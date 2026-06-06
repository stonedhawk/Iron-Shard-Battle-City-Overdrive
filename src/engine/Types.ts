export const Direction = {
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;

export type Direction = typeof Direction[keyof typeof Direction];

export const TileType = {
  EMPTY: 'EMPTY',
  BRICK: 'BRICK',
  STEEL: 'STEEL',
  BUSH: 'BUSH',
  WATER: 'WATER',
  ICE: 'ICE',
} as const;

export type TileType = typeof TileType[keyof typeof TileType];

export const EnemyType = {
  BASIC: 'BASIC',
  FAST: 'FAST',
  HEAVY: 'HEAVY',
  FLASHER: 'FLASHER',
} as const;

export type EnemyType = typeof EnemyType[keyof typeof EnemyType];

export type GamePhase = 'MENU' | 'INTRO' | 'PLAYING' | 'INTERMISSION' | 'GAMEOVER' | 'VICTORY';

export interface MacroTile {
  type: TileType;
  quadrants: [
    [boolean, boolean],
    [boolean, boolean]
  ];
}

export interface PlayerTank {
  x: number;
  y: number;
  direction: Direction;
  speed: number;
  width: number;
  height: number;
  isMoving: boolean;
  lives: number;
  health: number;
  flashTimer: number; // Damage invincibility flash timer
  
  // Upgrade state flags
  kineticPiercing: boolean;
  proximityFlak: boolean;
  baseReinforced: boolean;
  treadTier: number;
  propellantTier: number;
}

export interface EnemyTank {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  direction: Direction;
  speed: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  isMoving: boolean;
  fireCooldown: number;  // Ticks before shooting again
  flashTimer: number;    // Hit flashing feedback timer
  spawnTimer: number;    // 60-tick spawning warning timer (physicalizes when 0)
  
  // Tactical AI timers & properties
  targetToggleTimer?: number; // FAST tank toggle timer
  isTrackingPlayer?: boolean;  // FAST tank state
  heavyFiringTimer?: number;  // HEAVY tank block-destruction timer
  blockedTimer?: number;      // Anti-clumping evasion fallback timer
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  active: boolean;
  radius: number;
  owner: 'PLAYER' | 'ENEMY';
  penetrationCount?: number; // Used for Kinetic Piercing upgrades
}

export interface DropItem {
  id: string;
  x: number;
  y: number;
  type: 'SILICON' | 'FERRO' | 'KINETIC_CORE';
  lifeTimer: number; // Ticks before disappearing (e.g. 600 for 10s)
  vx: number;
  vy: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  timer: number; // Ticks to live (e.g. 60)
}

export interface ResourceState {
  siliconShards: number;
  ferroAlloys: number;
  kineticCores: number;
}

export interface GameState {
  grid: MacroTile[][];
  player: PlayerTank;
  activeEnemies: EnemyTank[];
  spawnQueue: EnemyType[];
  killCount: number;
  resources: ResourceState;
  isPaused: boolean;
  debugMode: boolean; // F3 visual flow-field debugger active
  dropItems: DropItem[];
  floatingTexts: FloatingText[];
  
  // Level campaign variables
  currentLevel: number;
  gamePhase: GamePhase;
}
