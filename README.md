# Iron Shard: Battle City Overdrive

**Iron Shard: Battle City Overdrive** is an advanced tactical evolution of the classic 8-bit tank combat genre. Built from the ground up using **TypeScript**, **Vite**, and **HTML5 Canvas**, it runs on a custom, frame-independent 60 FPS update loop with zero heavy framework dependencies. Experience pixel-perfect grid maneuvers, deep tactical upgrading, and high-aggression AI routing in a compact, web-native arcade experience.

---

## 🚀 Core Mechanics

### 1. 26x26 Micro-Grid & Quadrant Destruction
Every 32x32 macro-tile on the map is subdivided into a 2x2 quadrant of 16x16 micro-tiles. Brick blocks can be partially destroyed depending on the exact incoming vector of shells, allowing players and enemies to carve narrow corridors through walls and shoot through tiny slots for tactical advantages.

### 2. Dijkstra Flow Field Navigation Engine
Enemy tanks do not wander randomly. They navigate using dynamic Dijkstra cost fields calculated in real time. The flow field recalculates dynamically whenever the terrain is modified, ensuring heavy tanks find paths to demolish your base, while fast tanks attempt flanking maneuvers around steel blocks and water obstacles.

### 3. Core Harvesting & Upgrade Loop
Destroying terrain and elite enemies yields valuable materials:
- **Silicon Shards:** Salvaged from brick quadrants to buy low-tier enhancements.
- **Ferro-Alloys:** Dropped by heavy tanks to construct fortress modifications.
- **Kinetic Cores:** Spawns upon defeating gold-flashing tanks to power high-impact weapons.

Tractor-beam magnetism pulls nearby shards directly to your tank. Spend these resources in the real-time **Upgrade Grid** overlay to unlock modifications like **Kinetic Piercing**, **Proximity Flak**, and **Fortress Reinforcements**.

---

## 🕹️ Controls & How to Play

Engage in a 20-level progressive campaign. Protect the central Eagle Base fortress at all costs.

- **Move:** `W` `A` `S` `D` or `Arrow Keys` (Ice grids provide 1.5x speed sliding, bushes conceal tanks, and water blocks shell vectors but remain impassable).
- **Fire Shells:** `Spacebar` (Max of 2 player shells can be active at one time).
- **Upgrade Grid:** Press `E` or `Tab` to open the upgrade grid overlay mid-combat. The game pauses while the panel is visible.

---

## 💻 Local Development & CI/CD

### Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18 or newer recommended).

### Setup and Running Locally
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173/Iron-Shard-Battle-City-Overdrive/` in your browser.

3. Compile the production bundle:
   ```bash
   npm run build
   ```

### Running E2E Playwright Tests
Validate all core mechanics, state pause flags, and HUD readouts:
```bash
npx playwright test
```

### GitHub Actions Deployment
The project includes a pre-configured CI/CD workflow at `.github/workflows/deploy.yml`. On every push to the `main` branch, the workflow automatically:
- Checks out the code.
- Installs dependencies and runs the build script.
- Deploys the built bundle (`dist/` folder) directly to **GitHub Pages**.

---

## 📄 License

This project is licensed under the **MIT License**. Feel free to use, modify, and distribute the code under the terms of the MIT license.
