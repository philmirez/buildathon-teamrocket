/**
 * Paragraph-level document diff.
 *
 * The model never gets to decide *what* changed — this does, deterministically,
 * before any LLM call. A policy tool that invents a clause change is worse than
 * useless, so every change the UI shows traces back to a hunk computed here.
 *
 * Paragraphs (not lines) are the unit because legal documents are written in
 * them: it keeps the LCS small and the hunks semantically whole.
 */

const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Split on blank lines, keeping numbered clauses that sit on their own line. */
export function splitParagraphs(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+\n/g, "\n").trim())
    .filter(Boolean);
}

/** Longest common subsequence over normalized paragraphs. */
function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  const A = a.map(normalize);
  const B = b.map(normalize);

  // Trim identical head and tail so the matrix stays small.
  let head = 0;
  while (head < n && head < m && A[head] === B[head]) head++;
  let tail = 0;
  while (tail < n - head && tail < m - head && A[n - 1 - tail] === B[m - 1 - tail]) tail++;

  const aMid = A.slice(head, n - tail);
  const bMid = B.slice(head, m - tail);
  const rows = aMid.length;
  const cols = bMid.length;

  const table = new Int32Array((rows + 1) * (cols + 1));
  const at = (i, j) => i * (cols + 1) + j;
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[at(i, j)] =
        aMid[i] === bMid[j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const ops = [];
  for (let k = 0; k < head; k++) ops.push({ type: "eq", a: k, b: k });

  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (aMid[i] === bMid[j]) {
      ops.push({ type: "eq", a: head + i, b: head + j });
      i++;
      j++;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      ops.push({ type: "del", a: head + i });
      i++;
    } else {
      ops.push({ type: "ins", b: head + j });
      j++;
    }
  }
  while (i < rows) ops.push({ type: "del", a: head + i++ });
  while (j < cols) ops.push({ type: "ins", b: head + j++ });

  for (let k = 0; k < tail; k++) {
    ops.push({ type: "eq", a: n - tail + k, b: m - tail + k });
  }
  return ops;
}

/** Dice coefficient over word bigrams — used to pair a deletion with its rewrite. */
function similarity(a, b) {
  const grams = (s) => {
    const w = normalize(s).split(" ");
    const out = new Set();
    for (let i = 0; i < w.length - 1; i++) out.add(w[i] + " " + w[i + 1]);
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return normalize(a) === normalize(b) ? 1 : 0;
  let hits = 0;
  for (const g of A) if (B.has(g)) hits++;
  return (2 * hits) / (A.size + B.size);
}

/**
 * Group raw ops into hunks. Adjacent deletions and insertions that read as
 * rewrites of each other are paired into one "modified" hunk rather than
 * reported as an unrelated removal plus addition.
 */
export function buildHunks(aParas, bParas) {
  const ops = lcsOps(aParas, bParas);
  const hunks = [];

  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "eq") {
      k++;
      continue;
    }

    const dels = [];
    const ins = [];
    while (k < ops.length && ops[k].type !== "eq") {
      if (ops[k].type === "del") dels.push(aParas[ops[k].a]);
      else ins.push(bParas[ops[k].b]);
      k++;
    }

    const used = new Set();
    dels.forEach((before) => {
      let best = -1;
      let bestScore = 0;
      ins.forEach((after, idx) => {
        if (used.has(idx)) return;
        const score = similarity(before, after);
        if (score > bestScore) {
          bestScore = score;
          best = idx;
        }
      });
      if (best >= 0 && bestScore >= 0.35) {
        used.add(best);
        hunks.push({ kind: "modified", before, after: ins[best] });
      } else {
        hunks.push({ kind: "removed", before, after: "" });
      }
    });
    ins.forEach((after, idx) => {
      if (!used.has(idx)) hunks.push({ kind: "added", before: "", after });
    });
  }

  return hunks.map((h, i) => ({ id: i + 1, ...h }));
}

/** Word-level diff, for highlighting exactly what moved inside one hunk. */
export function wordDiff(before, after) {
  const split = (s) => String(s || "").split(/(\s+)/).filter((t) => t !== "");
  const A = split(before);
  const B = split(after);
  const n = A.length;
  const m = B.length;

  // Guard against pathological inputs; the UI falls back to plain quotes.
  if (n * m > 900000) return null;

  const key = (s) => s.toLowerCase().replace(/[^\w]/g, "");
  const table = new Int32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] =
        key(A[i]) === key(B[j])
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const out = [];
  const push = (t, text) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.text += text;
    else out.push({ t, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(A[i]) === key(B[j])) push("eq", B[j++]), i++;
    else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) push("del", A[i++]);
    else push("ins", B[j++]);
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("ins", B[j++]);
  return out;
}

/** Headline counts for the summary strip. */
export function diffStats(hunks) {
  return {
    total: hunks.length,
    modified: hunks.filter((h) => h.kind === "modified").length,
    added: hunks.filter((h) => h.kind === "added").length,
    removed: hunks.filter((h) => h.kind === "removed").length,
  };
}
