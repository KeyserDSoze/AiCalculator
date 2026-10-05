import { useEffect } from 'react';
import './catalogPatch';
import catalog from '../data/catalog.json';
import expandedModels from '../data/models-expanded.json';
import { assessHardware, calculate, DEFAULT_INPUT, type CalculatorInput } from './calculator';
import { getCloudOffers, getPurchaseOffers } from './marketplace';
import { buildBusinessDecision, recommendModels } from './strategy';
import { exportPremiumPdf } from './premiumPdf';
import './premiumPdf.css';

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

function findControl(matchers: string[]) {
  const labels = Array.from(document.querySelectorAll('label'));
  const wanted = matchers.map(normalize);
  for (const label of labels) {
    const text = normalize(label.textContent || '');
    if (!wanted.some(m => text.includes(m))) continue;
    const control = label.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
    if (control) return control;
  }
  return null;
}

function readNumber(matchers: string[], fallback: number) {
  const control = findControl(matchers);
  if (!control) return fallback;
  const value = Number(control.value);
  return Number.isFinite(value) ? value : fallback;
}

function readString(matchers: string[], fallback: string) {
  const control = findControl(matchers);
  return control?.value || fallback;
}

function selectedModelId() {
  const visibleName = document.querySelector('.selected-model-strip strong')?.textContent?.trim();
  if (visibleName) {
    const model = (expandedModels as any[]).find(m => m.name === visibleName);
    if (model) return model.id;
  }
  const query = new URLSearchParams(window.location.search).get('model');
  if (query && (expandedModels as any[]).some(m => m.id === query)) return query;
  const saved = localStorage.getItem('ai-calculator-model');
  if (saved && (expandedModels as any[]).some(m => m.id === saved)) return saved;
  return DEFAULT_INPUT.modelId;
}

function selectedServerId() {
  const serverName = document.querySelector('.advisor-card.advisor-selected h3')?.textContent?.trim();
  if (!serverName) return 'auto';
  const server = (catalog.serverProfiles as any[]).find(s => s.name === serverName);
  return server?.id || 'auto';
}

function currentInput(): CalculatorInput {
  const input: CalculatorInput = {
    ...DEFAULT_INPUT,
    modelId: selectedModelId(),
    serverProfileId: selectedServerId(),
    businessProfile: readString(['profilo principale', 'primary profile'], DEFAULT_INPUT.businessProfile) as CalculatorInput['businessProfile'],
    dataSensitivity: readString(['sensibilita dati', 'sensibilità dati', 'data sensitivity'], DEFAULT_INPUT.dataSensitivity) as CalculatorInput['dataSensitivity'],
    regionPreference: readString(['regione preferita', 'preferred region'], DEFAULT_INPUT.regionPreference) as CalculatorInput['regionPreference'],
    averageUsers: readNumber(['utenti', 'users'], DEFAULT_INPUT.averageUsers),
    concurrentUsers: readNumber(['contemporanei', 'concurrent'], DEFAULT_INPUT.concurrentUsers),
    averageContextTokens: readNumber(['context medio', 'average context'], DEFAULT_INPUT.averageContextTokens),
    maxContextTokens: readNumber(['context massimo', 'max context'], DEFAULT_INPUT.maxContextTokens),
    averageOutputTokens: readNumber(['output medio token', 'average output tokens'], DEFAULT_INPUT.averageOutputTokens),
    availabilityMode: readString(['disponibilita', 'disponibilità', 'availability'], DEFAULT_INPUT.availabilityMode) as CalculatorInput['availabilityMode'],
    currentAnnualAiSpendEur: readNumber(['spend ai attuale', 'current ai spend'], DEFAULT_INPUT.currentAnnualAiSpendEur),
    annualGrowthPct: readNumber(['crescita annua', 'annual growth'], DEFAULT_INPUT.annualGrowthPct),
    planningHorizonYears: readNumber(['orizzonte anni', 'planning years'], DEFAULT_INPUT.planningHorizonYears),
    gpuUtilizationPct: readNumber(['utilizzo gpu medio', 'average gpu utilization'], DEFAULT_INPUT.gpuUtilizationPct),
    cloudAllocatedUptimePct: readNumber(['cloud uptime fatturato', 'cloud billable uptime'], DEFAULT_INPUT.cloudAllocatedUptimePct),
    electricityEurPerKwh: readNumber(['energia €/kwh', 'electricity €/kwh'], DEFAULT_INPUT.electricityEurPerKwh),
    pue: readNumber(['pue'], DEFAULT_INPUT.pue),
    coolingAnnualEur: readNumber(['cooling fisso', 'fixed cooling'], DEFAULT_INPUT.coolingAnnualEur),
    maintenancePercent: readNumber(['maintenance %'], DEFAULT_INPUT.maintenancePercent),
    hardwareAmortizationYears: readNumber(['ammortamento anni', 'amortization years'], DEFAULT_INPUT.hardwareAmortizationYears),
    onPremFitoutEur: readNumber(['fit-out on-prem', 'on-prem fit-out'], DEFAULT_INPUT.onPremFitoutEur),
    auditRetentionDays: readNumber(['retention audit giorni', 'audit retention days'], DEFAULT_INPUT.auditRetentionDays),
    requestsPerUserPerDay: readNumber(['request per utente/giorno', 'requests per user/day'], DEFAULT_INPUT.requestsPerUserPerDay),
    avgAuditPayloadKb: readNumber(['payload audit medio kb', 'average audit payload kb'], DEFAULT_INPUT.avgAuditPayloadKb),
    proxyServerPriceEur: readNumber(['costo server llmproxy', 'llmproxy server cost'], DEFAULT_INPUT.proxyServerPriceEur),
    inferenceServerPriceOverrideEur: DEFAULT_INPUT.inferenceServerPriceOverrideEur,
    strategy: DEFAULT_INPUT.strategy
  };

  // The current UI does not expose strategy and inference-price override as primary inputs.
  // Preserve a saved live value when another feature has populated it.
  try {
    const live = JSON.parse(localStorage.getItem('ai-calculator-live-input') || '{}');
    if (live?.strategy) input.strategy = live.strategy;
    if (Number.isFinite(Number(live?.inferenceServerPriceOverrideEur))) input.inferenceServerPriceOverrideEur = Number(live.inferenceServerPriceOverrideEur);
  } catch {
    // Ignore malformed local state.
  }

  return input;
}

function isItalian() {
  const company = document.querySelector('#company')?.textContent || '';
  return company.includes('Partiamo dall') || company.includes('Profilo principale');
}

function buildReport() {
  const input = currentInput();
  const it = isItalian();
  const results = calculate(input);
  const onPrem = results.find(r => r.id === 'onprem') || results[0];
  const colo = results.find(r => r.id === 'colo') || results[1];
  const rental = results.find(r => r.id === 'rental') || results[2];
  const hardwareAssessments = assessHardware(input);
  const modelRecommendations = recommendModels(input);
  const businessDecision = buildBusinessDecision(input, results, modelRecommendations);
  const selectedModel = (expandedModels as any[]).find(m => m.id === input.modelId) || (expandedModels as any[])[0];
  const selectedAssessment = hardwareAssessments.find(a => a.serverProfileId === onPrem?.serverProfileId) || hardwareAssessments.find(a => a.status !== 'impossible') || hardwareAssessments[0];

  const feasible = hardwareAssessments.filter(a => a.status !== 'impossible');
  const minimum = feasible.slice().sort((a, b) => a.estimatedCapexEur - b.estimatedCapexEur)[0];
  const recommendedPool = feasible.filter(a => a.status === 'recommended');
  const recommended = (recommendedPool.length ? recommendedPool : feasible.filter(a => a.status === 'top')).slice().sort((a, b) => a.estimatedCapexEur - b.estimatedCapexEur)[0] || minimum;
  const topPool = feasible.filter(a => a.status === 'top');
  const top = (topPool.length ? topPool : feasible).slice().sort((a, b) => b.capacityHeadroomPct - a.capacityHeadroomPct || b.estimatedConcurrentCapacity - a.estimatedConcurrentCapacity)[0] || recommended;
  const recommendations = [
    minimum && { kind: 'minimum', assessment: minimum, title: it ? 'Minimo accettabile' : 'Minimum viable', subtitle: it ? 'CAPEX minimo tecnicamente utilizzabile.' : 'Lowest technically usable CAPEX.' },
    recommended && { kind: 'recommended', assessment: recommended, title: it ? 'Scelta consigliata' : 'Recommended choice', subtitle: it ? 'Equilibrio tra margine, resilienza e costo.' : 'Balance of headroom, resilience and cost.' },
    top && { kind: 'top', assessment: top, title: 'Top performance', subtitle: it ? 'Massimo margine per picchi e crescita.' : 'Maximum headroom for peaks and growth.' }
  ].filter(Boolean) as any[];

  const cloudOffers = selectedAssessment ? getCloudOffers(input, selectedAssessment) : [];
  const purchaseOffers = selectedAssessment ? getPurchaseOffers(input, selectedAssessment) : [];

  exportPremiumPdf({
    it,
    generatedAt: new Date(),
    catalogUpdated: (catalog as any).meta?.lastUpdated,
    input,
    selectedModel,
    onPrem,
    colo,
    rental,
    businessDecision,
    modelRecommendations,
    recommendations,
    selectedAssessment,
    cloudOffers,
    purchaseOffers
  });
}

function tagPdfButtons() {
  document.querySelectorAll('.hero-actions button, .mobile-actionbar button').forEach(node => {
    const button = node as HTMLButtonElement;
    if (button.textContent?.trim() === 'PDF') {
      button.classList.add('premium-pdf-trigger');
      button.title = 'Premium AI Strategy Report';
    }
  });
}

export default function PremiumPdfController() {
  useEffect(() => {
    tagPdfButtons();
    const observer = new MutationObserver(tagPdfButtons);
    observer.observe(document.body, { subtree: true, childList: true });

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button.premium-pdf-trigger') as HTMLButtonElement | null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      buildReport();
    };
    document.addEventListener('click', onClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
