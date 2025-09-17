import React, { useMemo, useRef, useState } from "react";

/**
 * Baccarat Tracker – Better Version (single-file React prototype)
 *
 * What you get:
 * - Quick-entry buttons (Player / Banker / Tie)
 * - Bead Plate (6xN) & simple Big Road–style streak columns
 * - Probability & confidence panel with Laplace smoothing
 * - House-edge reminders + responsible play nudges
 * - Betting system dashboard (Flat / Martingale) with bankroll tracker
 * - Monte Carlo "Test Mode" (run N shoes) with summary stats
 *
 * Notes:
 * - Pure React + TailwindCSS classes. No external state libs.
 * - No external chart lib to keep this drop-in friendly.
 * - This is a prototype focusing on UX & core logic; refine as needed.
 */

// ---------- Types ----------
const OUTCOMES = ["B", "P", "T"] as const;
export type Outcome = typeof OUTCOMES[number];

// ---------- Helpers ----------
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

// Standard baccarat theoretical probabilities (approx., ignoring cut-card / late-shoe effects)
// Source: common baccarat math: Banker ~45.86% (wins after commission), Player ~44.62%, Tie ~9.52% (varies slightly by rule set)
const THEORETICAL = {
  B: 0.4586,
  P: 0.4462,
  T: 0.0952,
};

// House edge (approx)
const HOUSE_EDGE = {
  B: 0.0106, // 1.06%
  P: 0.0124, // 1.24%
  T: 0.1436, // 14.36%
};

function laplaceSmoothingCounts(counts: Record<Outcome, number>, alpha = 1) {
  // Laplace smoothing to avoid overfitting small samples
  const total = counts.B + counts.P + counts.T + alpha * 3;
  return {
    B: (counts.B + alpha) / total,
    P: (counts.P + alpha) / total,
    T: (counts.T + alpha) / total,
  };
}

function summarize(outcomes: Outcome[]) {
  const counts = { B: 0, P: 0, T: 0 } as Record<Outcome, number>;
  for (const o of outcomes) counts[o]++;
  const smoothed = laplaceSmoothingCounts(counts, 1);
  // Simple hybrid: blend smoothed empirical with theoretical (70/30) to avoid wild swings early
  const blended = {
    B: clamp(0.7 * smoothed.B + 0.3 * THEORETICAL.B),
    P: clamp(0.7 * smoothed.P + 0.3 * THEORETICAL.P),
    T: clamp(0.7 * smoothed.T + 0.3 * THEORETICAL.T),
  };
  // Normalize (just in case rounding drift)
  const s = blended.B + blended.P + blended.T;
  const probs = { B: blended.B / s, P: blended.P / s, T: blended.T / s };

  // Confidence (0–1): higher with more data; logistic-like curve
  const n = outcomes.length;
  const confidence = clamp(1 - Math.exp(-n / 12));

  // A light-weight pattern signal: alternation vs streakiness
  let alternations = 0;
  for (let i = 1; i < outcomes.length; i++) {
    const a = outcomes[i - 1];
    const b = outcomes[i];
    if ((a === "B" || a === "P") && (b === "B" || b === "P") && a !== b) alternations++;
  }
  const altRate = outcomes.length > 1 ? alternations / (outcomes.length - 1) : 0;

  return { counts, probs, confidence, altRate };
}

function nextPrediction(probs: Record<Outcome, number>) {
  // Pick the max of B/P (ignore T for primary suggestion; show T as side note)
  const top = probs.B >= probs.P ? ("B" as Outcome) : ("P" as Outcome);
  const confidence = Math.max(probs.B, probs.P);
  return { pick: top, confidence, tieProb: probs.T };
}

// ---------- Simulation ----------
function simulateOnce(hands: number, betUnit: number, bankroll: number, system: "flat" | "martingale", bias?: Partial<Record<Outcome, number>>) {
  const pB = bias?.B ?? THEORETICAL.B;
  const pP = bias?.P ?? THEORETICAL.P;
  const pT = bias?.T ?? THEORETICAL.T;
  const results: Outcome[] = [];
  let stake = betUnit;
  let bust = false;
  let peak = bankroll;

  const draw = () => {
    const r = Math.random();
    if (r < pB) return "B" as Outcome;
    if (r < pB + pP) return "P" as Outcome;
    return "T" as Outcome;
  };

  for (let i = 0; i < hands; i++) {
    if (bankroll <= 0) {
      bust = true;
      break;
    }
    const outcome = draw();
    results.push(outcome);

    // Strategy: always bet on Banker/Player with higher prob (ignore Tie)
    const { probs } = summarize(results);
    const betSide: Outcome = probs.B >= probs.P ? "B" : "P";

    // Place bet
    const wager = Math.min(stake, bankroll);
    bankroll -= wager;

    // Resolve
    if (outcome === betSide) {
      // Payout: Banker wins 1:1 with 5% commission (model as 0.95x net), Player wins 1:1
      const win = betSide === "B" ? wager * 1.95 - wager : wager * 2 - wager; // net profit
      bankroll += wager + win; // restore wager + profit
      // reset progression
      stake = betUnit;
    } else if (outcome === "T") {
      // Push on T if betting B/P (varies by table; some push, some lose half; we model push)
      bankroll += wager; // refund
      // stake unchanged
    } else {
      // Loss
      if (system === "martingale") {
        stake = wager * 2;
      } else {
        stake = betUnit;
      }
    }

    if (bankroll > peak) peak = bankroll;
  }

  return { results, final: bankroll, bust, peak };
}

function simulateMany(runs: number, hands: number, betUnit: number, bankroll: number, system: "flat" | "martingale") {
  let busts = 0;
  let totalFinal = 0;
  let best = -Infinity;
  let worst = Infinity;
  for (let i = 0; i < runs; i++) {
    const r = simulateOnce(hands, betUnit, bankroll, system);
    totalFinal += r.final;
    if (r.bust) busts++;
    if (r.final > best) best = r.final;
    if (r.final < worst) worst = r.final;
  }
  const avgFinal = totalFinal / runs;
  return { runs, busts, avgFinal, best, worst, bustRate: busts / runs };
}

// ---------- UI Components ----------
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-3 sm:p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium">{children}</span>;
}

function BeadPlate({ data, cols = 30 }: { data: Outcome[]; cols?: number }) {
  // 6 rows x N columns from left to right, top to bottom
  const grid: (Outcome | null)[][] = Array.from({ length: 6 }, () => Array(cols).fill(null));
  let c = 0, r = 0;
  for (let i = 0; i < data.length && c < cols; i++) {
    grid[r][c] = data[i];
    r++;
    if (r >= 6) {
      r = 0;
      c++;
    }
  }
  const dot = (o: Outcome | null, i: number) => (
    <div key={i} className="aspect-square w-full flex items-center justify-center">
      {o && (
        <div className={`h-4 w-4 rounded-full ${o === "B" ? "bg-blue-500" : o === "P" ? "bg-red-500" : "bg-gray-400"}`}></div>
      )}
    </div>
  );
  return (
    <div className="overflow-auto">
      <div className="grid grid-rows-6 gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(14px, 1fr))` }}>
        {grid.flatMap((row, ri) => row.map((cell, ci) => <div key={`${ri}-${ci}`}>{dot(cell, ci)}</div>))}
      </div>
    </div>
  );
}

function BigRoad({ data, maxCols = 30 }: { data: Outcome[]; maxCols?: number }) {
  // Simplified Big Road: only B/P streaks (ignore T). New column on color change.
  const filtered = data.filter((d) => d !== "T");
  type Cell = { o: Outcome } | null;
  const rows = 6;
  const grid: Cell[][] = Array.from({ length: rows }, () => Array(maxCols).fill(null));
  let col = 0, row = 0;
  let last: Outcome | null = null;

  for (const o of filtered) {
    if (o !== last) {
      // start new column
      col++;
      row = 0;
      last = o;
    } else {
      // continue streak downwards until bottom, then wrap by extending to the right (common Big Road behavior)
      if (row < rows - 1 && !grid[row + 1][col]) {
        row++;
      } else {
        // shift to right within same color column
        let x = col + 1;
        while (x < maxCols && grid[row][x]) x++;
        if (x >= maxCols) break;
        col = x;
      }
    }
    if (col >= maxCols) break;
    grid[row][col] = { o };
  }

  return (
    <div className="overflow-auto">
      <div className="grid grid-rows-6 gap-1" style={{ gridTemplateColumns: `repeat(${maxCols}, minmax(16px, 1fr))` }}>
        {grid.flatMap((row, ri) =>
          row.map((cell, ci) => (
            <div key={`${ri}-${ci}`} className="aspect-square w-full flex items-center justify-center">
              {cell && (
                <div className={`h-4 w-4 rounded ${cell.o === "B" ? "bg-blue-500" : "bg-red-500"}`}></div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function BaccaratTracker() {
  const [history, setHistory] = useState<Outcome[]>([]);
  const [betUnit, setBetUnit] = useState(10);
  const [bankroll, setBankroll] = useState(1000);
  const [system, setSystem] = useState<"flat" | "martingale">("flat");
  const [runs, setRuns] = useState(200);
  const [hands, setHands] = useState(80);
  const [simResult, setSimResult] = useState<ReturnType<typeof simulateMany> | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const { counts, probs, confidence, altRate } = useMemo(() => summarize(history), [history]);
  const prediction = useMemo(() => nextPrediction(probs), [probs]);

  const addOutcome = (o: Outcome) => setHistory((h) => [o, ...h]); // newest first for ease of reading
  const clear = () => setHistory([]);

  const importString = (s: string) => {
    // Accept strings like "BPBPTBP..." or spaced "B P T"
    const cleaned = s.toUpperCase().replace(/\s+/g, "");
    const arr: Outcome[] = [];
    for (const ch of cleaned) if (OUTCOMES.includes(ch as Outcome)) arr.push(ch as Outcome);
    setHistory((h) => [...arr.reverse(), ...h]); // keep newest first
  };

  const exportString = () => history.join("");

  const runSim = () => {
    const r = simulateMany(runs, hands, betUnit, bankroll, system);
    setSimResult(r);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Decision Pattern Tracker for Baccarat – Better Version</h1>
          <p className="text-gray-600 mt-1">Fast entry, real-time probabilities, simulations, and casino-style scoreboards.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clear} className="rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50">Clear</button>
          <button
            onClick={() => {
              const s = exportString();
              navigator.clipboard.writeText(s);
            }}
            className="rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Copy History
          </button>
        </div>
      </div>

      {/* Quick Entry */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => addOutcome("B")} className="rounded-2xl bg-blue-600 text-white py-3 font-semibold shadow hover:opacity-95">Banker (B)</button>
        <button onClick={() => addOutcome("P")} className="rounded-2xl bg-red-600 text-white py-3 font-semibold shadow hover:opacity-95">Player (P)</button>
        <button onClick={() => addOutcome("T")} className="rounded-2xl bg-gray-700 text-white py-3 font-semibold shadow hover:opacity-95">Tie (T)</button>
      </div>

      {/* Import / Export */}
      <div className="rounded-2xl border p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input ref={inputRef} placeholder="Paste history e.g. BPPBT..." className="w-full rounded-xl border px-3 py-2" />
        <div className="flex gap-2">
          <button onClick={() => inputRef.current && importString(inputRef.current.value)} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Import</button>
          <button onClick={() => inputRef.current && (inputRef.current.value = exportString())} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Export</button>
        </div>
      </div>

      {/* Summary / Prediction Panel */}
      <div className="grid sm:grid-cols-4 gap-4">
        <Stat label="Hands Tracked" value={`${history.length}`} />
        <Stat label="Counts" value={`B ${counts.B} · P ${counts.P} · T ${counts.T}`} />
        <Stat label="Alternation Rate" value={pct(altRate)} sub="B↔P changes over last hands" />
        <Stat label="Confidence" value={pct(confidence)} sub="Rises with more data" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Next Hand – Probabilities</h2>
            <Pill>Laplace + Theoretical Blend</Pill>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Banker" value={pct(probs.B)} sub={`House edge ~${pct(HOUSE_EDGE.B)}`} />
            <Stat label="Player" value={pct(probs.P)} sub={`House edge ~${pct(HOUSE_EDGE.P)}`} />
            <Stat label="Tie" value={pct(probs.T)} sub={`House edge ~${pct(HOUSE_EDGE.T)}`} />
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-medium">Suggested focus</div>
              <Pill>{prediction.pick === "B" ? "Banker" : "Player"} · {pct(prediction.confidence)}</Pill>
            </div>
            <div className="text-gray-600 mt-1">Tie probability shown for awareness; many tables treat T as push when betting B/P.</div>
          </div>
        </div>

        <div className="rounded-2xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Betting System & Bankroll</h2>
            <Pill>{system === "flat" ? "Flat" : "Martingale"}</Pill>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Bet Unit ($)</span>
              <input type="number" value={betUnit} onChange={(e) => setBetUnit(Math.max(1, Number(e.target.value)))} className="rounded-xl border px-3 py-2"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Bankroll ($)</span>
              <input type="number" value={bankroll} onChange={(e) => setBankroll(Math.max(1, Number(e.target.value)))} className="rounded-xl border px-3 py-2"/>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setSystem("flat")} className={`rounded-xl border px-3 py-2 text-sm ${system === "flat" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>Flat</button>
            <button onClick={() => setSystem("martingale")} className={`rounded-xl border px-3 py-2 text-sm ${system === "martingale" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>Martingale</button>
          </div>

          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">Reminder</div>
            Betting progressions can accelerate losses during streaks. House edge is persistent regardless of pattern chasing.
          </div>
        </div>
      </div>

      {/* Scoreboards */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Bead Plate</h3>
            <Pill>6 x 30</Pill>
          </div>
          <BeadPlate data={[...history].reverse()} cols={30} />
        </div>
        <div className="rounded-2xl border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Big Road (simplified)</h3>
            <Pill>Streak view</Pill>
          </div>
          <BigRoad data={[...history].reverse()} maxCols={30} />
        </div>
      </div>

      {/* Test Mode / Simulation */}
      <div className="rounded-2xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Test Mode – Monte Carlo</h2>
          <Pill>Educational</Pill>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Runs</span>
            <input type="number" value={runs} onChange={(e) => setRuns(Math.max(1, Number(e.target.value)))} className="rounded-xl border px-3 py-2"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Hands per run</span>
            <input type="number" value={hands} onChange={(e) => setHands(Math.max(1, Number(e.target.value)))} className="rounded-xl border px-3 py-2"/>
          </label>
          <div className="self-end">
            <button onClick={runSim} className="rounded-2xl bg-gray-900 text-white px-4 py-2 w-full">Run Simulation</button>
          </div>
        </div>
        {simResult && (
          <div className="grid sm:grid-cols-5 gap-3">
            <Stat label="Runs" value={`${simResult.runs}`} />
            <Stat label="Busts" value={`${simResult.busts}`} sub={`Bust rate ${pct(simResult.bustRate)}`} />
            <Stat label="Avg Final" value={`$${simResult.avgFinal.toFixed(2)}`} />
            <Stat label="Best Final" value={`$${simResult.best.toFixed(2)}`} />
            <Stat label="Worst Final" value={`$${simResult.worst.toFixed(2)}`} />
          </div>
        )}
        <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-medium">Interpretation Tips</div>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Small edges swing outcomes in the short run; long run tends to house advantage.</li>
            <li>Martingale increases bust risk dramatically during losing streaks.</li>
            <li>Use Test Mode to set realistic stop-loss / take-profit rules (add in code as needed).</li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-500 text-center">
        For entertainment & education. Always follow local laws and gamble responsibly.
      </div>
    </div>
  );
}
