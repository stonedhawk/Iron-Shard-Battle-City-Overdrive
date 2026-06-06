import { TileType } from './Types';
import type { MacroTile } from './Types';

export interface GridCoord {
  r: number;
  c: number;
}

export class FlowField {
  /**
   * Computes a Dijkstra map cost field for a 26x26 micro-grid.
   * costMap[r][c] represents the shortest path cost from cell (r, c) to the nearest target.
   * Value 9999 represents unreachable cells or infinite obstacles.
   */
  public static generateDijkstraMap(
    grid: MacroTile[][],
    targets: GridCoord[],
    brickCost: number
  ): number[][] {
    const size = 26;
    
    // Initialize cost map with infinity (9999)
    const costs: number[][] = Array.from({ length: size }, () => Array(size).fill(9999));
    
    // SPFA queue for path relaxation
    const queue: [number, number][] = [];
    
    // Set target points to cost 0
    for (const target of targets) {
      if (target.r >= 0 && target.r < size && target.c >= 0 && target.c < size) {
        costs[target.r][target.c] = 0;
        queue.push([target.r, target.c]);
      }
    }
    
    const dirs = [
      [-1, 0], // UP
      [1, 0],  // DOWN
      [0, -1], // LEFT
      [0, 1]   // RIGHT
    ];
    
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      const currentCost = costs[r][c];
      
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        
        // Bounds checking
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) {
          continue;
        }
        
        // Target cells remain 0
        const isTarget = targets.some(t => t.r === nr && t.c === nc);
        if (isTarget) {
          continue;
        }
        
        // Check map obstacle costs
        const mr = Math.floor(nr / 2);
        const mc = Math.floor(nc / 2);
        const tile = grid[mr]?.[mc];
        
        if (!tile) {
          continue;
        }
        
        let cellCost = 1;
        if (tile.type === TileType.STEEL || tile.type === TileType.WATER) {
          continue; // Impassable
        } else if (tile.type === TileType.BRICK) {
          const qr = nr % 2;
          const qc = nc % 2;
          if (tile.quadrants[qr][qc]) {
            cellCost = brickCost; // medium cost (15) or ignore (1)
          }
        }
        
        const nextCost = currentCost + cellCost;
        if (nextCost < costs[nr][nc]) {
          costs[nr][nc] = nextCost;
          queue.push([nr, nc]);
        }
      }
    }
    
    return costs;
  }
}
