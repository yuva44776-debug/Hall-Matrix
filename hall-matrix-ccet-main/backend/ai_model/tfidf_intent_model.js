const fs = require('fs');
const path = require('path');

const MODEL_PATH = path.join(__dirname, 'model.json');
let cachedModel = null;

function loadModel() {
  if (!cachedModel) cachedModel = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
  return cachedModel;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function vectorize(text, model) {
  const unigrams = tokenize(text);
  const tokens = [...unigrams];
  for (let i = 0; i < unigrams.length - 1; i++) tokens.push(`${unigrams[i]} ${unigrams[i + 1]}`);
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const vec = new Array(model.vocabulary.length).fill(0);
  const denom = Math.max(tokens.length, 1);
  for (let i = 0; i < model.vocabulary.length; i++) {
    const term = model.vocabulary[i];
    const tf = (counts.get(term) || 0) / denom;
    vec[i] = tf * model.idf[i];
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

function predictIntent(message) {
  const model = loadModel();
  const x = vectorize(message, model);
  const scores = model.classes.map((cls, ci) => {
    const weights = model.coef[ci];
    let score = model.intercept[ci] || 0;
    for (let i = 0; i < x.length; i++) score += weights[i] * x[i];
    return { intent: cls, score };
  });
  const maxScore = Math.max(...scores.map(s => s.score));
  const expScores = scores.map(s => ({ ...s, exp: Math.exp(Math.max(-50, Math.min(50, s.score - maxScore))) }));
  const sum = expScores.reduce((a, s) => a + s.exp, 0) || 1;
  expScores.forEach(s => { s.probability = s.exp / sum; });
  expScores.sort((a, b) => b.probability - a.probability);
  return {
    intent: expScores[0].intent,
    confidence: expScores[0].probability,
    top: expScores.slice(0, 3).map(({ intent, probability }) => ({ intent, confidence: probability }))
  };
}

module.exports = { predictIntent, loadModel };
