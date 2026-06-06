import { EnemyType } from './Types';

export interface LevelConfig {
  levelNumber: number;
  totalEnemyCount: number;
  enemyTypeDistribution: EnemyType[];
  spawnIntervalTicks: number; // Spawn delay in physics frames (60 = 1s)
  tileDensity: {
    BRICK: number;
    STEEL: number;
    WATER: number;
    BUSH: number;
    ICE: number;
  };
}

export class LevelManager {
  /**
   * Generates a data-driven level configuration for levels 1 through 20.
   */
  public static getLevelConfig(levelNumber: number): LevelConfig {
    const lvl = Math.max(1, Math.min(20, levelNumber));
    
    // Programmatic scaling: enemy count starts at 12 and climbs to 50
    const totalEnemyCount = 10 + lvl * 2;
    
    // Spawn interval in frames: lvl 1 = 4.5s (270 frames), scaling down to lvl 20 = 1.5s (90 frames)
    const spawnIntervalTicks = Math.max(90, Math.floor(270 - (lvl - 1) * 9.5));
    
    // Archetype distributions ratios
    let rBasic = 0.6;
    let rFast = 0.2;
    let rHeavy = 0.1;
    let rFlasher = 0.1;
    
    if (lvl >= 1 && lvl <= 4) {
      rBasic = 0.6 - (lvl - 1) * 0.05;
      rFast = 0.3 + (lvl - 1) * 0.02;
      rHeavy = 0.05 + (lvl - 1) * 0.02;
      rFlasher = 0.05 + (lvl - 1) * 0.01;
    } else if (lvl >= 5 && lvl <= 8) {
      rBasic = 0.4 - (lvl - 5) * 0.05;
      rFast = 0.3;
      rHeavy = 0.2 + (lvl - 5) * 0.03;
      rFlasher = 0.1 + (lvl - 5) * 0.02;
    } else if (lvl >= 9 && lvl <= 12) {
      rBasic = 0.2;
      rFast = 0.35;
      rHeavy = 0.3 + (lvl - 9) * 0.02;
      rFlasher = 0.15 + (lvl - 9) * 0.01;
    } else {
      // Levels 13-20
      rBasic = 0.1;
      rFast = 0.3;
      rHeavy = 0.4 + (lvl - 13) * 0.02;
      rFlasher = 0.2;
    }
    
    // Convert ratios to list
    const distribution: EnemyType[] = [];
    const sum = rBasic + rFast + rHeavy + rFlasher;
    const pBasic = rBasic / sum;
    const pFast = rFast / sum;
    const pHeavy = rHeavy / sum;
    
    for (let i = 0; i < totalEnemyCount; i++) {
      const rand = Math.random();
      if (rand < pBasic) {
        distribution.push('BASIC');
      } else if (rand < pBasic + pFast) {
        distribution.push('FAST');
      } else if (rand < pBasic + pFast + pHeavy) {
        distribution.push('HEAVY');
      } else {
        distribution.push('FLASHER');
      }
    }
    
    // Tile Densities
    let brick = 0.30;
    let steel = 0.00;
    let water = 0.00;
    let bush = 0.00;
    let ice = 0.00;
    
    if (lvl >= 1 && lvl <= 4) {
      brick = 0.30 - (lvl - 1) * 0.02;
      steel = 0.02;
      bush = 0.05 + (lvl - 1) * 0.01;
    } else if (lvl >= 5 && lvl <= 8) {
      brick = 0.22 - (lvl - 5) * 0.02;
      steel = 0.05 + (lvl - 5) * 0.01;
      water = 0.06 + (lvl - 5) * 0.02;
      ice = 0.05 + (lvl - 5) * 0.02;
      bush = 0.08;
    } else if (lvl >= 9 && lvl <= 12) {
      brick = 0.16 - (lvl - 9) * 0.01;
      steel = 0.10 + (lvl - 9) * 0.01;
      water = 0.08;
      ice = 0.08;
      bush = 0.04;
    } else {
      // Levels 13-20
      brick = 0.12 - (lvl - 13) * 0.01;
      steel = 0.15 + (lvl - 13) * 0.01;
      water = 0.10 + (lvl - 13) * 0.01;
      ice = 0.10;
      bush = 0.06;
    }
    
    return {
      levelNumber: lvl,
      totalEnemyCount,
      enemyTypeDistribution: distribution,
      spawnIntervalTicks,
      tileDensity: {
        BRICK: Math.max(0, brick),
        STEEL: Math.max(0, steel),
        WATER: Math.max(0, water),
        BUSH: Math.max(0, bush),
        ICE: Math.max(0, ice)
      }
    };
  }
}
