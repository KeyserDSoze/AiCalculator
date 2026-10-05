import catalog from '../data/catalog.json';
import expandedModels from '../data/models-expanded.json';

const patched = catalog as any;

// Keep model data in a dedicated file so the catalog can grow without making
// the hardware/cost catalog harder to maintain.
patched.models = expandedModels;

// Small-model tiers: without these, a 1B-14B model would misleadingly start
// from a 4-GPU server even when a much smaller inference host is sufficient.
const existingIds = new Set((patched.serverProfiles || []).map((s: any) => s.id));
const smallServerProfiles = [
  {
    id: 'gpu-1x-rtxpro6000', role: 'inference', name: '1x RTX PRO 6000 Blackwell',
    hardwareTier: 'enterprise', gpuId: 'rtx-pro-6000-blackwell-server', gpuCount: 1,
    totalVramGb: 96, ramGb: 256, storageTb: 4, networkGbps: 25,
    estimatedPurchaseEur: 32000, idleWatts: 260, peakWatts: 1050,
    inferenceIndex: 0.34, rackUnits: 2, cooling: 'air', priceAsOf: '2026-10-05',
    sourceClass: 'planning-estimate',
    notes: 'Planning profile for compact models. Replace with an OEM/reseller quote before procurement.'
  },
  {
    id: 'gpu-2x-rtxpro6000', role: 'inference', name: '2x RTX PRO 6000 Blackwell',
    hardwareTier: 'enterprise', gpuId: 'rtx-pro-6000-blackwell-server', gpuCount: 2,
    totalVramGb: 192, ramGb: 512, storageTb: 8, networkGbps: 100,
    estimatedPurchaseEur: 59000, idleWatts: 430, peakWatts: 1900,
    inferenceIndex: 0.66, rackUnits: 3, cooling: 'air', priceAsOf: '2026-10-05',
    sourceClass: 'planning-estimate',
    notes: 'Planning profile for small/medium models and higher concurrency. Replace with a current quote before procurement.'
  }
].filter(s => !existingIds.has(s.id));

patched.serverProfiles = [
  ...(patched.serverProfiles || []).filter((s: any) => s.role === 'proxy'),
  ...smallServerProfiles,
  ...(patched.serverProfiles || []).filter((s: any) => s.role !== 'proxy')
];
