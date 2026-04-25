import { focusStore } from '../store';

let classifier: any = null;
let classifierLoading = false;

async function getClassifier() {
  if (classifier) return classifier;
  if (classifierLoading) {
    // Wait for existing load
    while (classifierLoading) await new Promise(r => setTimeout(r, 100));
    return classifier;
  }
  classifierLoading = true;
  try {
    const { pipeline, env } = await import('@xenova/transformers') as any;
    // Cache models in userData so they survive app restarts
    const { app } = await import('electron');
    env.cacheDir = require('path').join(app.getPath('userData'), 'transformers-cache');
    classifier = await pipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-mnli');
  } finally {
    classifierLoading = false;
  }
  return classifier;
}

export async function autoCategorize(text: string): Promise<string | null> {
  const categories = focusStore.get('categories');
  if (categories.length === 0) return null;

  try {
    const cls    = await getClassifier();
    const labels = categories.map(c => c.name);
    const result = await cls(text.slice(0, 500), labels);
    if (result.scores[0] > 0.4) return result.labels[0] as string;
  } catch (err) {
    console.warn('[autoCategorize] Classification failed:', err);
  }
  return null;
}
