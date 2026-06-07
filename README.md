# 🛡️ Iron Shard: Battle City Overdrive

[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5_Canvas-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Playwright](https://img.shields.io/badge/Playwright-%232E8B57.svg?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![License](https://img.shields.io/badge/License-MIT-brightgreen.svg?style=for-the-badge)](LICENSE)

**Iron Shard: Battle City Overdrive** is a high-octane, web-native tactical replica and systemic evolution of the classic 8-bit tank combat genre. Built from scratch with modern **TypeScript** and raw **HTML5 Canvas**, the game operates on a frame-independent 60 FPS update loop with zero heavy framework dependencies. 

Experience pixel-perfect grid maneuvers, granular micro-quadrant destructible terrain, dynamic flow field enemy pathfinding, and a real-time quick-buy progression system, all rendered inside a responsive retro CRT scanline wrapper.

---

## 🚀 Key Evolutionary Features

### 🧩 1. Granular Micro-Grid Quadrant Destruction
Unlike original title designs where entire blocks vanish on shell impact, Iron Shard features a sub-divided **26x26 micro-grid**:
- Every $32\times32$ macro-tile (Brick/Steel/Water/etc.) is subdivided into a $2\times2$ grid of $16\times16$ micro-quadrants.
- Shells target, mutate, and destroy specific quadrants based on incoming vectors.
- This creates tactical opportunities: players can carve narrow slots through walls, shoot through tiny gaps, and shape customized pathing corridors.

### 🧭 2. Dijkstra Flow Field Navigation Engine
Enemy tanks possess coordinated tactical routing. Instead of random wanders, they navigate using real-time calculated **Dijkstra Flow Fields**:
- Dijkstra pathfinding calculates traversal cost maps from the central Eagle Base out to the spawns.
- Fields recalculate dynamically whenever the terrain is modified by player or enemy shells.
- Heavy tanks prioritize driving straight to blow up fortress walls, while Fast tanks attempt flanking paths around steel and water blocks.

### ⚡ 3. Real-Time HUD Quick-Buy Upgrades
Accelerate your combat performance without pausing gameplay:
- A continuous telemetry parser evaluates your resources and highlights affordable upgrades directly inside the viewport frame.
- Dedicated keyboard quick-keys allow you to purchase and apply upgrades on-the-fly, spawning drifting canvas notifications over your tank:
  - **`1`** ➔ **Overdrive Treads**: Increase movement speed by $+0.25$ per tier (up to Tier 3).
  - **`2`** ➔ **Hyper-Velocity Propellant**: Increase projectile speed by $+2.0$ per tier (up to Tier 3).
  - **`3`** ➔ **Proximity Flak / Reinforce Base**: Trigger localized $3\times3$ flak explosions on impacts or transform Eagle Base brick walls into impenetrable Steel.

### 🤖 4. Predictive Bounding-Box (AABB) Collision
A customized collision resolution system prevents tank overlaps and guarantees smooth, responsive gameplay:
- Before applying movement ticks, future coordinates are evaluated against all active tank bounding boxes.
- If a collision is predicted, the component of the velocity vector heading into the collision is zeroed out.
- Tanks can back away immediately or slide perpendicularly.
- A 1-pixel inverse-axis separation push acts as a safety backup to resolve any interpenetration immediately.

---

## 🕹️ Controls & Mechanics

Complete the **20-stage progressive campaign**. Protect the central Eagle base.

| Control | Action | Details |
| :--- | :--- | :--- |
| **`W` `A` `S` `D`** / **`Arrows`** | Move Tank | Snap assistance is applied perpendicularly. |
| **`Spacebar`** | Fire Shells | Standard bullets deactivate on impact. Max 2 active shells. |
| **`E`** / **`Tab`** | Upgrade Modal | Pauses the game and displays detailed cost cards. |
| **`1`** | Quick-Buy Treads | Cost: 10 Silicon, 1 Ferro. |
| **`2`** | Quick-Buy Propellant | Cost: 12 Silicon, 1 Ferro. |
| **`3`** | Quick-Buy Flak/Base | Priority: Flak (25 Silicon, 1 Core), then Base (5 Ferro). |
| **`F3`** | Debug Flow Fields | Toggles visual Dijkstra vector grid overlays. |

### Environmental Grid Costs
- 🧊 **Ice**: Provides a $1.5\times$ speed boost but introduces inertia sliding.
- 🌿 **Bushes**: Conceals player and enemy tanks completely.
- 🌊 **Water**: Blocks tank movement but lets shells pass through cleanly.

---

## 📂 Directory Structure Map

```text
├── .github/workflows/deploy.yml   # CI/CD production build & deployment pipeline
├── e2e/                           # End-to-End browser simulation suites
│   └── game.spec.ts               # Core physics, HUD metrics, and quick-buy spec
├── src/
│   ├── assets/                    # Graphic and vector styling resources
│   ├── engine/
│   │   ├── FlowField.ts           # Dijkstra static cost & vector calculators
│   │   ├── GameEngine.ts          # Core tick processor, physics loop & render pass
│   │   ├── LevelManager.ts        # Procedural map generation & progression config
│   │   └── Types.ts               # Interfaces, states, and enums
│   ├── main.ts                    # Telemetry DOM bindings & keyboard listeners
│   └── style.css                  # Retro HUD layout, glow filters & CRT effects
├── index.html                     # Telemetry panel & game viewport frame
└── vite.config.ts                 # Production output and directory configuration
```

---

## 🛠️ Local Development & Operations

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18 or newer recommended).

### 1. Set Up Dependencies
```bash
npm install
```

### 2. Launch Local Dev Server
```bash
npm run dev
```
Open `http://localhost:5173/Iron-Shard-Battle-City-Overdrive/` in your browser.

### 3. Compile Production Bundle
```bash
npm run build
```

### 4. Execute E2E Playwright Tests
Run headlessly to validate all game systems, upgrades, base destruction checks, and telemetry readouts:
```bash
npx playwright test
```

---

## ⚙️ Automated CI/CD Pages Deployment
The repository includes a GitHub Actions configuration at `.github/workflows/deploy.yml`. 

On every push to the `main` branch, it compiles code, executes assets bundlers, and deploys the static build files (`dist/`) directly to **GitHub Pages**, ensuring public gameplay access is always up to date.

---

## 📄 License
This project is licensed under the terms of the [MIT License](LICENSE).
