# Repository: baccarat-tracker

Below is a ready-to-push Vite + React + TypeScript + Tailwind project with Netlify config. Create a new GitHub repo, add these files, commit, and push. Then connect the repo on Netlify (it will auto-detect the build). 

---

## File tree
```
.
├── netlify.toml
├── package.json
├── postcss.config.js
├── README.md
├── index.html
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── vite.config.ts
├── .gitignore
└── src
    ├── App.tsx
    ├── index.css
    └── main.tsx
```

---

## netlify.toml
```toml
[build]
  command = "npm run build"
  publish = "dist"

[dev]
  command = "npm run dev"
  port = 5173

[[redirects]]
  from = "/app"
  to = "/index.html"
  status = 200
```

---

## package.json
```json
{
  "name": "baccarat-tracker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.2"
  }
}
```

---

## postcss.config.js
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## tailwind.config.js
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

---

## tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": "."
  },
  "include": ["src"]
}
```

---

## tsconfig.node.json
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

---

## vite.config.ts
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
```

---

## .gitignore
```gitignore
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Node
node_modules

# Build output
/dist

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
```

---

## index.html
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Baccarat Decision Pattern Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## src/index.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: light dark; }
body { @apply bg-white text-gray-900; }
```

---

## src/main.tsx
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

---

## src/App.tsx
```tsx
import React, { useMemo, useRef, useState } from "react";

type Outcome = "B" | "P" | "T";
const OUTCOMES: Outcome[] = ["B", "P", "T"];

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const THEORETICAL = { B: 0.4586, P: 0.4462, T: 0.0952 };
const HOUSE_EDGE = { B: 0.0106, P: 0.0124, T: 0.1436 };

function laplace(counts: Record<Outcome, number>, alpha = 1) {
  const total = counts.B + counts.P + counts.T + alpha * 3;
  return { B: (counts.B + alpha) / total, P: (counts.P + alpha) / total, T: (counts.T + alpha) / total };
}

function summarize(outcomes: Outcome[]) {
  const counts = { B: 0, P: 0, T: 0 } as Record<Outcome, number>;
  for (const o of outcomes) counts[o]++;
  const sm = laplace(counts, 1);
  const blended = { B: clamp(0.7 * sm.B + 0.3 * THEORETICAL.B), P: clamp(0.7 * sm.P + 0.3 * THEORETICAL.P), T: clamp(0.7 * sm.T + 0.3 * THEORETICAL.T) };
  const s = blended.B + blended.P + blended.T;
  const probs = { B: blended.B / s, P: blended.P / s, T: blended.T / s };
  const n = outcomes.length; const confidence = clamp(1 - Math.exp(-n / 12));
  let alternations = 0; for (let i = 1; i < outcomes.length; i++) { const a = outcomes[i - 1], b = outcomes[i]; if ((a === "B" || a === "P") && (b === "B" || b === "P") && a !== b) alternations++; }
  const altRate = outcomes.length > 1 ? alternations / (outcomes.length - 1) : 0;
  return { counts, probs, confidence, altRate };
}

function nextPrediction(probs: Record<Outcome, number>) {
  const pick: Outcome = probs.B >= probs.P ? "B" : "P"; const confidence = Math.max(probs.B, probs.P); return { pick, confidence, tieProb: probs.T };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-3 sm:p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) { return <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium">{children}</span>; }

function BeadPlate({ data, cols = 30 }: { data: Outcome[]; cols?: number }) {
  const grid: (Outcome | null)[][] = Array.from({ length: 6 }, () => Array(cols).fill(null));
  let c = 0, r = 0; for (let i = 0; i < data.length && c < cols; i++) { grid[r][c] = data[i]; r++; if (r >= 6) { r = 0; c++; } }
  return (
    <div className="overflow-auto">
      <div className="grid grid-rows-6 gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(14px, 1fr))` }}>
        {grid.flatMap((row, ri) => row.map((cell, ci) => (
          <div key={`${ri}-${ci}`} className="aspect-square w-full flex items-center justify-center">
            {cell && <div className={`h-4 w-4 rounded-full ${cell === "B" ? "bg-blue-500" : cell === "P" ? "bg-red-500" : "bg-gray-400"}`}></div>}
          </div>
        )))}
      </div>
    </div>
  );
}

function BigRoad({ data, maxCols = 30 }: { data: Outcome[]; maxCols?: number }) {
  const filtered = data.filter((d) => d !== "T");
  type Cell = { o: Outcome } | null; const rows = 6; const grid: Cell[][] = Array.from({ length: rows }, () => Array(maxCols).fill(null));
  let col = 0, row = 0; let last: Outcome | null = null;
  for (const o of filtered) {
    if (o !== last) { col++; row = 0; last = o; } else { if (row < rows - 1 && !grid[row + 1][col]) { row++; } else { let x = col + 1; while (x < maxCols && grid[row][x]) x++; if (x >= maxCols) break; col = x; } }
    if (col >= maxCols) break; grid[row][col] = { o };
  }
  return (
    <div className="overflow-auto">
      <div className="grid grid-rows-6 gap-1" style={{ gridTemplateColumns: `repeat(${maxCols}, minmax(16px,
