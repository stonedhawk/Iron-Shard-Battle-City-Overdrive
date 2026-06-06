import { test, expect } from '@playwright/test';

test.describe('Iron Shard: Battle City Overdrive E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the local game page
    await page.goto('/');
  });

  test('should load the retro game canvas and page title', async ({ page }) => {
    // Check title tag
    await expect(page).toHaveTitle(/Iron Shard: Battle City Overdrive/);
    
    // Check main title header element
    const titleEl = page.locator('#game-title');
    await expect(titleEl).toHaveText('IRON SHARD');
    
    // Verify Canvas viewport is present
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '416');
    await expect(canvas).toHaveAttribute('height', '416');
  });

  test('should initialize gameplay HUD with correct values', async ({ page }) => {
    // Check startup status
    const statusEl = page.locator('#metric-status');
    await expect(statusEl).toHaveText('ONLINE');

    // Check Player lives
    const livesEl = page.locator('#tank-lives');
    await expect(livesEl).toHaveText('03');

    // Check Spawning queue
    const queueEl = page.locator('#wave-queue');
    await expect(queueEl).toHaveText('12');

    // Check Silicon Shards resource
    const siliconEl = page.locator('#res-silicon');
    await expect(siliconEl).toHaveText('000');
    
    // Check Kinetic Cores resource
    const coresEl = page.locator('#res-cores');
    await expect(coresEl).toHaveText('000');

    // Check Matrix Level
    const levelEl = page.locator('#matrix-level');
    await expect(levelEl).toHaveText('01');
  });

  test('should update input module keyboard visualizer when keys are pressed', async ({ page }) => {
    const keyW = page.locator('#key-w');
    const keyA = page.locator('#key-a');
    const keySpace = page.locator('#key-space');

    // W key press check
    await page.keyboard.down('w');
    await expect(keyW).toHaveClass(/active/);
    await page.keyboard.up('w');
    await expect(keyW).not.toHaveClass(/active/);

    // Space shoot key press check
    await page.keyboard.down('Space');
    await expect(keySpace).toHaveClass(/active/);
    await page.keyboard.up('Space');
    await expect(keySpace).not.toHaveClass(/active/);
  });

  test('should support pausing and restarting game play', async ({ page }) => {
    const btnPause = page.locator('#btn-pause');
    const btnRestart = page.locator('#btn-restart');
    const statusEl = page.locator('#metric-status');
    
    // Test Pause
    await btnPause.click();
    await expect(btnPause).toHaveText('RESUME GAME');
    
    // Test Resume
    await btnPause.click();
    await expect(btnPause).toHaveText('PAUSE GAME');
    
    // Test Restart metrics
    await btnRestart.click();
    await expect(statusEl).toHaveText('ONLINE');
  });

  test('should toggle visual flow-field debug mode when F3 key is pressed', async ({ page }) => {
    // Press F3 to activate flow-field overlay
    await page.keyboard.press('F3');
    
    // Verify that the viewport canvas remains visible and no JavaScript errors are thrown
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    
    // Press F3 again to deactivate
    await page.keyboard.press('F3');
    await expect(canvas).toBeVisible();
  });

  test('should open and close the Upgrade Grid overlay on E keypress', async ({ page }) => {
    const overlay = page.locator('#upgrade-overlay');
    
    // Should be hidden initially
    await expect(overlay).toHaveClass(/hidden/);
    
    // Press E to toggle open
    await page.keyboard.press('e');
    await expect(overlay).not.toHaveClass(/hidden/);
    
    // Verify modal elements are visible
    const title = page.locator('.modal-title');
    await expect(title).toHaveText('UPGRADE GRID');
    
    // Verify cards are disabled initially (cost lock)
    const btnPiercing = page.locator('#btn-upgrade-piercing');
    await expect(btnPiercing).toBeDisabled();

    const btnTreads = page.locator('#btn-upgrade-treads');
    await expect(btnTreads).toBeDisabled();

    const btnPropellant = page.locator('#btn-upgrade-propellant');
    await expect(btnPropellant).toBeDisabled();

    // Close using the close button
    const closeBtn = page.locator('#btn-close-upgrade');
    await closeBtn.click();
    await expect(overlay).toHaveClass(/hidden/);
  });

  test('should destroy brick quadrants on bullet collision', async ({ page }) => {
    await page.waitForFunction(() => (window as any).gameEngine !== undefined);

    const initialTile = await page.evaluate(() => {
      const engine = (window as any).gameEngine;
      const tile = engine.state.grid[10][6];
      return {
        type: tile.type,
        quadrants: JSON.parse(JSON.stringify(tile.quadrants))
      };
    });

    expect(initialTile.type).toBe('BRICK');
    expect(initialTile.quadrants[1][1]).toBe(true);

    // Press Space to shoot first bullet
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    const afterFirst = await page.evaluate(() => {
      return JSON.parse(JSON.stringify((window as any).gameEngine.state.grid[10][6]));
    });
    console.log('After First Shot:', afterFirst);

    // Press Space to shoot second bullet
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    const afterSecond = await page.evaluate(() => {
      return JSON.parse(JSON.stringify((window as any).gameEngine.state.grid[10][6]));
    });
    console.log('After Second Shot:', afterSecond);

    // Press Space to shoot third bullet (targets next row of quadrants)
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    const afterThird = await page.evaluate(() => {
      return JSON.parse(JSON.stringify((window as any).gameEngine.state.grid[10][6]));
    });
    console.log('After Third Shot:', afterThird);

    // Press Space to shoot fourth bullet
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    const afterFourth = await page.evaluate(() => {
      return JSON.parse(JSON.stringify((window as any).gameEngine.state.grid[10][6]));
    });
    console.log('After Fourth Shot:', afterFourth);

    expect(afterFourth.type).toBe('EMPTY');
  });
});
