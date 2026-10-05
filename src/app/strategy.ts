import catalog from '../data/catalog.json';
import type { CalculatorInput, ScenarioResult } from './calculator';

export interface ModelRecommendation {
  modelId: string;
  name: string;
  vendor: string;
  score: number;
  coding: number;
  general: number;
  thinking: number;
  contextScore: number;
  efficiencyScore: number;
  rationale: string[];
}

export interface PortfolioRoute {
  role: 'primary' | 'economy' | 'reasoning';
  modelId: string;
  name: string;
  trafficPct: number;
  reason: string;
}

export interface BusinessDecision {
  recommendedMode: 'onprem' | 'colo' | 'rental' | 'hybrid';
  recommendedLabel: string;
  confidencePct: number;
  currentFourYearCostEur: number;
  recommendedFourYearCostEur: number;
  savingsFourYearEur: number;
  breakEvenMonths: number | null;
  hybridMonthlyEur: number;
  hybridFourYearEur: number;
  localTrafficPct: number;
  cloudTrafficPct: number;
  reasons: string[];
  risks: string[];
  portfolio: PortfolioRoute[];
}

const profileWeights: Record<CalculatorInput['businessProfile'], { coding: number; general: number; thinking: number; context: number; efficiency: number }> = {
  coding: { coding: 0.50, general: 0.12, thinking: 0.23, context: 0.08, efficiency: 0.07 },
  knowledge: { coding: 0.08, general: 0.45, thinking: 0.18, context: 0.20, efficiency: 0.09 },
  agentic: { coding: 0.32, general: 0.18, thinking: 0.34, context: 0.10, efficiency: 0.06 },
  reasoning: { coding: 0.08, general: 0.20, thinking: 0.56, context: 0.10, efficiency: 0.06 },
  mixed: { coding: 0.24, general: 0.31, thinking: 0.27, context: 0.10, efficiency: 0.08 }
};

function confidenceBonus(confidence: string) {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 0 : -3;
}

export function recommendModels(input: CalculatorInput): ModelRecommendation[] {
  const weights = profileWeights[input.businessProfile] || profileWeights.mixed;
  return (catalog.models as any[]).map(model => {
    const contextScore = Math.max(0, Math.min(100, (model.maxExtendedContextTokens / Math.max(1, input.maxContextTokens)) * 100));
    const active = model.parametersActiveB || model.parametersTotalB || 1;
    const efficiencyScore = Math.max(20, Math.min(100, 105 - Math.log10(Math.max(1, active)) * 28));
    const b = model.benchmarks || {};
    let score = (b.coding || 0) * weights.coding + (b.general || 0) * weights.general + (b.thinking || 0) * weights.thinking + contextScore * weights.context + efficiencyScore * weights.efficiency;
    score += confidenceBonus(b.confidence || 'medium');
    if (input.maxContextTokens > model.maxExtendedContextTokens) score -= 35;
    if (input.businessProfile === 'coding' && String(model.kind).includes('coding')) score += 5;
    if (input.businessProfile === 'reasoning' && String(model.kind).includes('reasoning')) score += 5;
    if (input.businessProfile === 'agentic' && (String(model.kind).includes('agentic') || String(model.kind).includes('coding'))) score += 4;
    score = Math.max(0, Math.min(100, score));
    const rationale = [
      `Coding ${b.coding || 0} · General ${b.general || 0} · Thinking ${b.thinking || 0}`,
      `${Math.round(model.maxExtendedContextTokens / 1000)}K max context`,
      `${model.parametersActiveB || model.parametersTotalB}B active parameters`
    ];
    if (input.maxContextTokens > model.maxExtendedContextTokens) rationale.unshift('Context richiesto oltre il limite dichiarato');
    return { modelId: model.id, name: model.name, vendor: model.vendor, score, coding: b.coding || 0, general: b.general || 0, thinking: b.thinking || 0, contextScore, efficiencyScore, rationale } as ModelRecommendation;
  }).sort((a, b) => b.score - a.score);
}

function localShareFor(input: CalculatorInput) {
  const baseBySensitivity = {
    public: 0.35,
    internal: 0.60,
    confidential: 0.78,
    restricted: 0.92
  }[input.dataSensitivity];
  const profileDelta = input.businessProfile === 'coding' || input.businessProfile === 'knowledge' ? 0.05 : input.businessProfile === 'reasoning' ? -0.05 : 0;
  return Math.max(0.2, Math.min(0.98, baseBySensitivity + profileDelta));
}

function modeLabel(mode: BusinessDecision['recommendedMode']) {
  return mode === 'onprem' ? 'On-prem' : mode === 'colo' ? 'Colocation' : mode === 'rental' ? 'Cloud' : 'Hybrid';
}

export function buildBusinessDecision(input: CalculatorInput, results: ScenarioResult[], modelRecommendations: ModelRecommendation[]): BusinessDecision {
  const onPrem = results.find(r => r.id === 'onprem')!;
  const colo = results.find(r => r.id === 'colo')!;
  const rental = results.find(r => r.id === 'rental')!;
  const currentFourYearCostEur = input.currentAnnualAiSpendEur * 4;
  const localTrafficPct = Math.round(localShareFor(input) * 100);
  const cloudTrafficPct = 100 - localTrafficPct;
  const localShare = localTrafficPct / 100;
  const cloudShare = cloudTrafficPct / 100;
  const hybridMonthlyEur = onPrem.monthlyEur * Math.max(0.55, localShare) + rental.monthlyEur * cloudShare * 0.85;
  const hybridFourYearEur = onPrem.capexEur * Math.max(0.6, localShare) + hybridMonthlyEur * 48;

  let recommendedMode: BusinessDecision['recommendedMode'];
  const candidateCosts: Array<{ mode: BusinessDecision['recommendedMode']; cost: number }> = [
    { mode: 'onprem', cost: onPrem.fourYearTcoEur },
    { mode: 'colo', cost: colo.fourYearTcoEur },
    { mode: 'rental', cost: rental.fourYearTcoEur },
    { mode: 'hybrid', cost: hybridFourYearEur }
  ];

  if (input.dataSensitivity === 'restricted') {
    recommendedMode = onPrem.fourYearTcoEur <= colo.fourYearTcoEur ? 'onprem' : 'colo';
  } else if (input.dataSensitivity === 'confidential') {
    recommendedMode = hybridFourYearEur <= colo.fourYearTcoEur * 1.12 ? 'hybrid' : 'colo';
  } else {
    recommendedMode = candidateCosts.slice().sort((a, b) => a.cost - b.cost)[0].mode;
  }

  const recommendedFourYearCostEur = recommendedMode === 'onprem' ? onPrem.fourYearTcoEur : recommendedMode === 'colo' ? colo.fourYearTcoEur : recommendedMode === 'rental' ? rental.fourYearTcoEur : hybridFourYearEur;
  const savingsFourYearEur = currentFourYearCostEur > 0 ? currentFourYearCostEur - recommendedFourYearCostEur : 0;
  const onPremOngoingMonthly = (onPrem.annualElectricityEur + onPrem.annualCoolingEur + onPrem.annualMaintenanceEur) / 12;
  const monthlyCurrent = input.currentAnnualAiSpendEur / 12;
  const monthlySavingsAgainstOnPrem = monthlyCurrent - onPremOngoingMonthly;
  const breakEvenMonths = monthlySavingsAgainstOnPrem > 0 ? onPrem.capexEur / monthlySavingsAgainstOnPrem : null;

  const top = modelRecommendations[0];
  const economy = modelRecommendations.filter(m => {
    const model = (catalog.models as any[]).find(x => x.id === m.modelId);
    return (model?.parametersActiveB || model?.parametersTotalB || 999) <= 32;
  })[0] || modelRecommendations[1] || top;
  const reasoning = modelRecommendations.slice().sort((a, b) => b.thinking - a.thinking)[0] || top;

  const portfolio: PortfolioRoute[] = [
    { role: 'primary', modelId: top.modelId, name: top.name, trafficPct: 55, reason: 'Default per la maggior parte dei task aziendali.' },
    { role: 'economy', modelId: economy.modelId, name: economy.name, trafficPct: 30, reason: 'Task semplici, classificazione, riassunto e automazioni a costo ridotto.' },
    { role: 'reasoning', modelId: reasoning.modelId, name: reasoning.name, trafficPct: 15, reason: 'Escalation per reasoning complesso e richieste ad alto valore.' }
  ];

  const reasons: string[] = [];
  if (input.dataSensitivity === 'restricted') reasons.push('Dati restricted: privilegio controllo locale/colo e minimizzo dipendenze da cloud pubblico.');
  if (input.dataSensitivity === 'confidential') reasons.push('Dati confidential: strategia ibrida permette di tenere il traffico sensibile locale e usare cloud per overflow/frontier.');
  if (recommendedMode === 'rental') reasons.push('Il cloud resta economicamente competitivo sul TCO previsto e riduce CAPEX iniziale.');
  if (recommendedMode === 'onprem') reasons.push('Il volume previsto giustifica ownership: il TCO favorisce hardware proprio e controllo operativo.');
  if (recommendedMode === 'colo') reasons.push('La colocation separa ownership dell’hardware dai vincoli energetici e di raffreddamento del sito aziendale.');
  if (recommendedMode === 'hybrid') reasons.push(`Routing suggerito: circa ${localTrafficPct}% locale e ${cloudTrafficPct}% cloud/frontier/overflow.`);
  if (input.availabilityMode === 'n1') reasons.push('La configurazione considera capacità ridondata N-1, non solo capacità nominale.');
  if (input.currentAnnualAiSpendEur > 0 && savingsFourYearEur > 0) reasons.push(`Risparmio pianificato a 4 anni rispetto allo spend corrente: circa €${Math.round(savingsFourYearEur).toLocaleString('it-IT')}.`);

  const risks = [
    'Capacità e concorrenza restano stime finché non vengono caricati benchmark runtime reali per modello × precisione × hardware × context.',
    'Prezzi pubblici non includono necessariamente IVA, egress, storage, supporto enterprise, installazione e sconti negoziati.',
    'Il portafoglio multi-modello è una raccomandazione di routing: il dimensionamento fisico è ancora calcolato sul modello selezionato.'
  ];

  let confidencePct = 72;
  if (top && top.score >= 90) confidencePct += 4;
  if (input.availabilityMode === 'n1') confidencePct += 3;
  if (input.currentAnnualAiSpendEur <= 0) confidencePct -= 8;
  confidencePct = Math.max(45, Math.min(90, confidencePct));

  return {
    recommendedMode,
    recommendedLabel: modeLabel(recommendedMode),
    confidencePct,
    currentFourYearCostEur,
    recommendedFourYearCostEur,
    savingsFourYearEur,
    breakEvenMonths,
    hybridMonthlyEur,
    hybridFourYearEur,
    localTrafficPct,
    cloudTrafficPct,
    reasons,
    risks,
    portfolio
  };
}
