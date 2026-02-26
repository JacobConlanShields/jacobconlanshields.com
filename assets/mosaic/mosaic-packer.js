export function packMosaic(cards, containerWidth, gap, pinned = null) {
  const placed = [];
  const positions = {};
  const maxX = Math.max(0, containerWidth);

  const jitterSeed = pinned ? `${pinned.id}:${Math.round(pinned.x / 8)}:${Math.round(pinned.y / 8)}` : "base";

  if (pinned) {
    const x = clamp(pinned.x, 0, Math.max(0, maxX - pinned.w));
    const y = Math.max(0, pinned.y);
    const rect = { id: pinned.id, x, y, w: pinned.w, h: pinned.h };
    placed.push(rect);
    positions[pinned.id] = { x, y };
  }

  const ordered = cards
    .filter((card) => !pinned || card.id !== pinned.id)
    .slice()
    .sort((a, b) => (b.h * b.w) - (a.h * a.w) || b.h - a.h || a.id.localeCompare(b.id));

  for (const card of ordered) {
    const candidates = candidateXs(placed, card.w, maxX, gap);
    let best = null;

    for (const x of candidates) {
      const y = lowestYForX(placed, x, card.w, card.h, gap);
      const height = resultingHeight(placed, y, card.h);
      const jitter = seededJitter(`${jitterSeed}:${card.id}:${x}:${y}`);
      const score = height + jitter;

      if (!best
        || score < best.score
        || (score === best.score && (y < best.y || (y === best.y && x < best.x)))) {
        best = { x, y, score };
      }
    }

    const rect = { id: card.id, x: best.x, y: best.y, w: card.w, h: card.h };
    placed.push(rect);
    positions[card.id] = { x: best.x, y: best.y };
  }

  const height = placed.reduce((acc, rect) => Math.max(acc, rect.y + rect.h), 0);
  return { positions, height };
}

function candidateXs(placed, width, maxWidth, gap) {
  const maxX = Math.max(0, maxWidth - width);
  const set = new Set([0]);
  for (const rect of placed) {
    set.add(clamp(rect.x + rect.w + gap, 0, maxX));
  }
  return [...set].sort((a, b) => a - b);
}

function lowestYForX(placed, x, w, h, gap) {
  let y = 0;

  while (true) {
    let bumped = false;
    for (const rect of placed) {
      if (overlap1D(x, x + w, rect.x, rect.x + rect.w)) {
        if (overlap1D(y, y + h, rect.y, rect.y + rect.h)) {
          y = rect.y + rect.h + gap;
          bumped = true;
        }
      }
    }
    if (!bumped) return y;
  }
}

function resultingHeight(placed, y, h) {
  return placed.reduce((acc, rect) => Math.max(acc, rect.y + rect.h), y + h);
}

function overlap1D(a0, a1, b0, b1) {
  return a0 < b1 && a1 > b0;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function seededJitter(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff * 0.001;
}
