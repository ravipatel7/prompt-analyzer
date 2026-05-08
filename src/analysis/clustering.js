'use strict';

function tokenize(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

function clusterPrompts(prompts, threshold = 0.6) {
  // Limit for performance
  const sample = prompts.slice(0, 500);
  const tokenSets = sample.map(p => tokenize(p));

  const clusters = [];

  for (let i = 0; i < sample.length; i++) {
    let assigned = false;
    for (const cluster of clusters) {
      const sim = jaccardSimilarity(tokenSets[i], tokenSets[cluster.centroidIdx]);
      if (sim >= threshold) {
        cluster.members.push(i);
        cluster.totalSimilarity += sim;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({ centroidIdx: i, members: [i], totalSimilarity: 1.0 });
    }
  }

  return clusters
    .filter(c => c.members.length > 1)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, 10)
    .map(c => ({
      representative: sample[c.centroidIdx],
      count: c.members.length,
      examples: c.members.slice(0, 3).map(i => sample[i]),
      avgSimilarity: c.totalSimilarity / c.members.length,
    }));
}

module.exports = { tokenize, jaccardSimilarity, clusterPrompts };
