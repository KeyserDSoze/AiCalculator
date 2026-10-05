import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import catalog from '../data/catalog.json';
import {
  assessHardware,
  calculate,
  CalculatorInput,
  DEFAULT_INPUT,
  HardwareAssessment,
  HardwareFit,
  ScenarioResult
} from './calculator';
import {
  bestFitCloudOffer,
  cheapestExactCloudOffer,
  cheapestPurchaseOffer,
  getCloudOffers,
  getPurchaseOffers,
  getRfqOffers,
  marketMeta
} from './marketplace';
import { buildBusinessDecision, recommendModels } from './strategy';
import './styles.css';

type SavedScenario = { id: string; createdAt: string; input: CalculatorInput; results: ScenarioResult[] };
type ViewMode = 'executive' | 'technical';
type RecommendationKind = 'minimum' | 'recommended' | 'top';
type Recommendation = { kind: RecommendationKind; assessment: HardwareAssessment; title: string; subtitle: string };
type WhatIf = { id: string; title: string; subtitle: string; nextInput: CalculatorInput; scenario: ScenarioResult };

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

function loadSaved(): SavedScenario[] {
  try { return JSON.parse(localStorage.getItem('ai-calculator-scenarios') || '[]'); } catch { return []; }
}

function nativeMoney(value: number, currency: string) {
  return currency === 'EUR' ? eur2.format(value) : currency === 'USD' ? usd.format(value) : `${value.toFixed(2)} ${currency}`;
}

function BenchmarkBar({ label, value }: { label: string; value: number }) {
  return <div className="benchmark-row"><span>{label}</span><div className="benchmark-track"><div className="benchmark-fill" style={{ width: `${value}%` }} /></div><strong>{Math.round(value)}</strong></div>;
}

function FitBadge({ status, label }: { status: HardwareFit; label: string }) {
  return <span className={`fit-badge fit-${status}`}>{label}</span>;
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="kpi"><small>{label}</small><strong>{value}</strong>{hint && <span>{hint}</span>}</div>;
}

function DecisionCard({ rec, selected, onSelect, tr, fitLabel }: {
  rec: Recommendation;
  selected: boolean;
  onSelect: () => void;
  tr: (itText: string, enText: string) => string;
  fitLabel: (status: HardwareFit) => string;
}) {
  const a = rec.assessment;
  return <article className={`decision-card decision-${rec.kind} ${selected ? 'decision-selected' : ''}`}>
    <div className="decision-topline"><span className={`decision-mark mark-${rec.kind}`}>{rec.kind === 'minimum' ? '01' : rec.kind === 'recommended' ? '02' : '03'}</span><FitBadge status={a.status} label={fitLabel(a.status)} /></div>
    <h3>{rec.title}</h3><p>{rec.subtitle}</p>
    <div className="decision-price">{euro.format(a.estimatedCapexEur)}<small>{tr(' CAPEX inferenza', ' inference CAPEX')}</small></div>
    <div className="decision-grid">
      <span><small>{tr('Nodi', 'Nodes')}</small><b>{a.requiredNodes}</b></span>
      <span><small>GPU</small><b>{a.requiredGpuCount}</b></span>
      <span><small>{tr('Capacità', 'Capacity')}</small><b>~{a.estimatedConcurrentCapacity}</b></span>
      <span><small>N-1</small><b className={a.n1Pass ? 'ok' : 'bad'}>{a.n1Pass ? `OK ~${a.n1ConcurrentCapacity}` : `FAIL ~${a.n1ConcurrentCapacity}`}</b></span>
    </div>
    <div className="decision-reason">{a.reasons[0]}</div>
    <button className={selected ? 'primary' : ''} disabled={a.status === 'impossible'} onClick={onSelect}>{selected ? tr('Selezionato', 'Selected') : tr('Usa configurazione', 'Use configuration')}</button>
  </article>;
}

function WhatIfCard({ item, currentMonthly, onApply, tr }: { item: WhatIf; currentMonthly: number; onApply: () => void; tr: (a: string, b: string) => string }) {
  const delta = item.scenario.monthlyEur - currentMonthly;
  return <article className="whatif-card"><div className="whatif-head"><div><span className="eyebrow">WHAT-IF</span><h3>{item.title}</h3></div><span className={delta <= 0 ? 'delta-good' : 'delta-bad'}>{delta > 0 ? '+' : ''}{euro.format(delta)}/{tr('mese', 'mo')}</span></div><p>{item.subtitle}</p><div className="whatif-kpis"><span><small>{tr('Hardware', 'Hardware')}</small><b>{item.scenario.inferenceNodes} × {item.scenario.serverName}</b></span><span><small>{tr('Mensile', 'Monthly')}</small><b>{euro.format(item.scenario.monthlyEur)}</b></span><span><small>N-1</small><b>{item.scenario.n1Pass ? 'PASS' : 'FAIL'}</b></span></div><button onClick={onApply}>{tr('Applica scenario', 'Apply scenario')}</button></article>;
}

export default function App() {
  const { i18n } = useTranslation();
  const it = i18n.language.startsWith('it');
  const tr = (itText: string, enText: string) => it ? itText : enText;
  const fitLabel = (status: HardwareFit) => ({ impossible: tr('Impossibile', 'Impossible'), strained: tr('Sotto sforzo', 'Strained'), recommended: tr('Consigliato', 'Recommended'), top: 'Top' }[status]);

  const [theme, setTheme] = useState(localStorage.getItem('ai-calculator-theme') || 'dark');
  const [viewMode, setViewMode] = useState<ViewMode>('executive');
  const [saved, setSaved] = useState<SavedScenario[]>(loadSaved);
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_INPUT);
  const [offerLimit, setOfferLimit] = useState(5);
  const [pricingFilter, setPricingFilter] = useState<'all' | 'on-demand' | 'reserved'>('all');

  const results = useMemo(() => calculate(input), [input]);
  const onPrem = results.find(r => r.id === 'onprem') || results[0];
  const colo = results.find(r => r.id === 'colo') || results[1];
  const rental = results.find(r => r.id === 'rental') || results[2];
  const hardwareAssessments = useMemo(() => assessHardware(input), [input]);
  const modelRecommendations = useMemo(() => recommendModels(input), [input]);
  const businessDecision = useMemo(() => buildBusinessDecision(input, results, modelRecommendations), [input, results, modelRecommendations]);
  const selectedModel = (catalog.models as any[]).find(m => m.id === input.modelId);
  const inferenceServers = (catalog.serverProfiles as any[]).filter(s => s.role === 'inference');
  const effectiveServerId = onPrem?.serverProfileId;
  const effectiveServer = inferenceServers.find(s => s.id === effectiveServerId);
  const selectedAssessment = hardwareAssessments.find(a => a.serverProfileId === effectiveServerId) || hardwareAssessments[0];

  const cloudOffers = useMemo(() => selectedAssessment ? getCloudOffers(input, selectedAssessment) : [], [input, selectedAssessment]);
  const purchaseOffers = useMemo(() => selectedAssessment ? getPurchaseOffers(input, selectedAssessment) : [], [input, selectedAssessment]);
  const rfqOffers = useMemo(() => selectedAssessment ? getRfqOffers(selectedAssessment) : [], [selectedAssessment]);
  const bestCloud = useMemo(() => selectedAssessment ? cheapestExactCloudOffer(input, selectedAssessment) : undefined, [input, selectedAssessment]);
  const bestFitCloud = useMemo(() => selectedAssessment ? bestFitCloudOffer(input, selectedAssessment) : undefined, [input, selectedAssessment]);
  const bestPurchase = useMemo(() => selectedAssessment ? cheapestPurchaseOffer(input, selectedAssessment) : undefined, [input, selectedAssessment]);

  const visibleCloudOffers = useMemo(() => cloudOffers.filter(o => pricingFilter === 'all' || o.pricingClass === pricingFilter).slice().sort((a, b) => a.monthlyTotalEur - b.monthlyTotalEur).slice(0, offerLimit), [cloudOffers, pricingFilter, offerLimit]);

  const recommendations = useMemo<Recommendation[]>(() => {
    const feasible = hardwareAssessments.filter(a => a.status !== 'impossible');
    if (!feasible.length) return [];
    const minimum = feasible.slice().sort((a, b) => a.estimatedCapexEur - b.estimatedCapexEur)[0];
    const balancedPool = feasible.filter(a => a.status === 'recommended');
    const recommended = (balancedPool.length ? balancedPool : feasible.filter(a => a.status === 'top')).slice().sort((a, b) => a.estimatedCapexEur - b.estimatedCapexEur)[0] || minimum;
    const topPool = feasible.filter(a => a.status === 'top');
    const top = (topPool.length ? topPool : feasible).slice().sort((a, b) => b.capacityHeadroomPct - a.capacityHeadroomPct || b.estimatedConcurrentCapacity - a.estimatedConcurrentCapacity)[0];
    return [
      { kind: 'minimum', assessment: minimum, title: tr('Minimo accettabile', 'Minimum viable'), subtitle: tr('CAPEX più basso che resta tecnicamente utilizzabile.', 'Lowest CAPEX that remains technically usable.') },
      { kind: 'recommended', assessment: recommended, title: tr('Scelta consigliata', 'Recommended choice'), subtitle: tr('Compromesso tra margine, semplicità, resilienza e costo.', 'Balance of headroom, simplicity, resilience and cost.') },
      { kind: 'top', assessment: top, title: tr('Top performance', 'Top performance'), subtitle: tr('Massimo margine per picchi, latenza e crescita.', 'Maximum headroom for peaks, latency and growth.') }
    ];
  }, [hardwareAssessments, it]);

  const whatIfs = useMemo<WhatIf[]>(() => {
    const growthConcurrency = Math.ceil(input.concurrentUsers * Math.pow(1 + input.annualGrowthPct / 100, Math.min(3, input.planningHorizonYears)));
    const variants = [
      { id: 'context-half', title: tr('Context dimezzato', 'Half context'), subtitle: tr('Quanto risparmio riducendo KV cache e prefill?', 'What changes if KV-cache and prefill pressure are halved?'), nextInput: { ...input, averageContextTokens: Math.max(4096, Math.round(input.averageContextTokens / 2)), maxContextTokens: Math.max(8192, Math.round(input.maxContextTokens / 2)), serverProfileId: 'auto' } },
      { id: 'growth', title: tr('Crescita a 3 anni', '3-year growth'), subtitle: tr(`Stress test a ~${growthConcurrency} utenti contemporanei.`, `Stress test at ~${growthConcurrency} concurrent users.`), nextInput: { ...input, concurrentUsers: growthConcurrency, serverProfileId: 'auto' } },
      { id: 'n1', title: input.availabilityMode === 'n1' ? tr('Senza ridondanza', 'Without redundancy') : 'N-1', subtitle: tr('Confronta il costo della continuità operativa.', 'Compare the cost of operational resilience.'), nextInput: { ...input, availabilityMode: input.availabilityMode === 'n1' ? 'standard' : 'n1', serverProfileId: 'auto' } },
      { id: 'performance', title: tr('Profilo performance', 'Performance profile'), subtitle: tr('Più headroom per picchi e latenza prevedibile.', 'More headroom for peaks and predictable latency.'), nextInput: { ...input, strategy: 'performance', serverProfileId: 'auto' } }
    ] as Array<{ id: string; title: string; subtitle: string; nextInput: CalculatorInput }>;
    return variants.map(v => ({ ...v, scenario: calculate(v.nextInput).find(r => r.id === 'onprem') || calculate(v.nextInput)[0] }));
  }, [input, it]);

  const counts = useMemo(() => hardwareAssessments.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {} as Record<HardwareFit, number>), [hardwareAssessments]);
  const setField = (field: keyof CalculatorInput, value: string | number) => setInput(prev => ({ ...prev, [field]: value }));
  const useHardware = (id: string) => setInput(prev => ({ ...prev, serverProfileId: id }));
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem('ai-calculator-theme', next); };
  const toggleLanguage = () => { const next = it ? 'en' : 'it'; i18n.changeLanguage(next); localStorage.setItem('ai-calculator-language', next); };
  const saveScenario = () => { const entry: SavedScenario = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), input, results }; const next = [entry, ...saved].slice(0, 30); setSaved(next); localStorage.setItem('ai-calculator-scenarios', JSON.stringify(next)); };
  const restore = (entry: SavedScenario) => setInput({ ...DEFAULT_INPUT, ...entry.input });

  const exportPdf = () => {
    const doc = new jsPDF(); let y = 18;
    doc.setFontSize(18); doc.text('AI Strategy & Infrastructure Calculator', 14, y); y += 10; doc.setFontSize(10);
    [
      `Business profile: ${input.businessProfile} | Data: ${input.dataSensitivity} | Region: ${input.regionPreference}`,
      `Recommended strategy: ${businessDecision.recommendedLabel} | Confidence: ${businessDecision.confidencePct}%`,
      `Model: ${selectedModel?.name} | Concurrent: ${input.concurrentUsers} | Avg/Max context: ${input.averageContextTokens}/${input.maxContextTokens}`,
      `Output: ${input.averageOutputTokens} tokens | Availability: ${input.availabilityMode.toUpperCase()}`,
      `Hardware: ${onPrem.inferenceNodes} x ${onPrem.serverName} | N-1: ${onPrem.n1Pass ? 'PASS' : 'FAIL'}`,
      `On-prem TCO 4y: ${euro.format(onPrem.fourYearTcoEur)} | Cloud TCO 4y: ${euro.format(rental.fourYearTcoEur)} | Hybrid est.: ${euro.format(businessDecision.hybridFourYearEur)}`,
      `Current AI spend: ${euro.format(input.currentAnnualAiSpendEur)}/year | Planned 4y saving: ${euro.format(businessDecision.savingsFourYearEur)}`
    ].forEach(line => { doc.text(line, 14, y); y += 6; });
    y += 3; doc.setFontSize(12); doc.text('Recommended model shortlist', 14, y); y += 6; doc.setFontSize(9);
    modelRecommendations.slice(0, 5).forEach(m => { doc.text(`${m.name} | fit ${m.score.toFixed(0)}/100 | coding ${m.coding} general ${m.general} thinking ${m.thinking}`, 18, y); y += 5; });
    y += 3; doc.setFontSize(12); doc.text('Hardware shortlist', 14, y); y += 6; doc.setFontSize(9);
    recommendations.forEach(r => { doc.text(`${r.kind.toUpperCase()} | ${r.assessment.requiredNodes} x ${r.assessment.serverName} | ${euro.format(r.assessment.estimatedCapexEur)} | N-1 ${r.assessment.n1Pass ? 'PASS' : 'FAIL'}`, 18, y); y += 5; });
    y += 3; doc.setFontSize(12); doc.text('Best market offers', 14, y); y += 6; doc.setFontSize(9);
    cloudOffers.slice(0, 5).forEach(o => { if (y > 270) { doc.addPage(); y = 20; } doc.text(`${o.provider} ${o.product} | ${euro.format(o.monthlyTotalEur)}/month | ${o.compatibility} | ${o.regions.join(', ')}`, 18, y); y += 5; });
    doc.save(`ai-strategy-${Date.now()}.pdf`);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ RecommendedMode: businessDecision.recommendedLabel, ConfidencePct: businessDecision.confidencePct, CurrentAnnualSpendEUR: input.currentAnnualAiSpendEur, Current4yEUR: businessDecision.currentFourYearCostEur, Recommended4yEUR: businessDecision.recommendedFourYearCostEur, Savings4yEUR: businessDecision.savingsFourYearEur, BreakEvenMonths: businessDecision.breakEvenMonths, LocalTrafficPct: businessDecision.localTrafficPct, CloudTrafficPct: businessDecision.cloudTrafficPct }]), 'Executive Decision');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(modelRecommendations.map(m => ({ Model: m.name, Vendor: m.vendor, FitScore: Math.round(m.score), Coding: m.coding, General: m.general, Thinking: m.thinking, ContextScore: Math.round(m.contextScore), Efficiency: Math.round(m.efficiencyScore) }))), 'Model Advisor');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(results.map(r => ({ Scenario: r.id, Hardware: r.serverName, Nodes: r.inferenceNodes, RedundancyNodes: r.redundancyNodes, GPUs: r.totalGpuCount, Capacity: r.estimatedConcurrentCapacity, N1Capacity: r.n1ConcurrentCapacity, N1Pass: r.n1Pass, AvgKW: Number(r.estimatedAverageKw.toFixed(2)), PeakKW: Number(r.estimatedItKw.toFixed(2)), AuditStorageTB: r.controlPlaneStorageTb, CAPEX_EUR: Math.round(r.capexEur), MonthlyEUR: Math.round(r.monthlyEur), FourYearTCO_EUR: Math.round(r.fourYearTcoEur) }))), 'Deployment');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hardwareAssessments.map(a => ({ Hardware: a.serverName, Status: a.status, Nodes: a.requiredNodes, RedundancyNodes: a.redundancyNodes, GPUs: a.requiredGpuCount, Capacity: a.estimatedConcurrentCapacity, N1Capacity: a.n1ConcurrentCapacity, N1Pass: a.n1Pass, VRAMWeightPct: Math.round(a.memoryUtilizationPct), CapexEUR: Math.round(a.estimatedCapexEur), AvgKW: Number(a.averageKw.toFixed(2)), PeakKW: Number(a.peakKw.toFixed(2)), Reasons: a.reasons.join(' | ') }))), 'Hardware Advisor');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cloudOffers.map(o => ({ Provider: o.provider, Product: o.product, Pricing: o.pricingClass, Compatibility: o.compatibility, RegionOK: o.regionCompatible, Regions: o.regions.join(', '), FitScore: o.fitScore, NativeRate: o.nativeUnitPrice, Currency: o.currency, Unit: o.unit, MonthlyEUR: Math.round(o.monthlyTotalEur), AnnualEUR: Math.round(o.annualTotalEur), AllocatedUptimePct: Math.round(o.allocatedUptimePct), Source: o.sourceUrl }))), 'Cloud Offers');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseOffers.map(o => ({ Supplier: o.supplier, Product: o.product, RegionOK: o.regionCompatible, FitScore: o.fitScore, UnitPriceEUR: Math.round(o.unitPriceEur), Nodes: o.requiredNodes, TotalEUR: Math.round(o.totalPurchaseEur), LeadTime: o.leadTime, Source: o.sourceUrl }))), 'Purchase Offers');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(businessDecision.portfolio.map(p => ({ Role: p.role, Model: p.name, TrafficPct: p.trafficPct, Reason: p.reason }))), 'Routing Portfolio');
    XLSX.writeFile(wb, `ai-strategy-${Date.now()}.xlsx`);
  };

  return <div className={theme}><div className="app-bg" /><main className="shell">
    <header className="topbar"><div className="brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /><div><h1>AI Strategy Calculator</h1><p>{tr('Dall’azienda alla strategia AI, ai modelli, all’hardware e ai fornitori.', 'From company requirements to AI strategy, models, hardware and providers.')}</p></div></div><div className="toolbar"><span className="data-date">{tr('Dati', 'Data')}: {catalog.meta.lastUpdated}</span><div className="mode-switch"><button className={viewMode === 'executive' ? 'active' : ''} onClick={() => setViewMode('executive')}>Executive</button><button className={viewMode === 'technical' ? 'active' : ''} onClick={() => setViewMode('technical')}>{tr('Tecnica', 'Technical')}</button></div><button onClick={toggleLanguage}>{it ? 'EN' : 'IT'}</button><button onClick={toggleTheme}>{theme === 'dark' ? '☀' : '◐'}</button></div></header>

    <section className="hero-dashboard" id="overview"><div className="hero-copy"><span className="eyebrow">{tr('STRATEGIA RACCOMANDATA', 'RECOMMENDED STRATEGY')}</span><div className="hero-title-row"><h2>{businessDecision.recommendedLabel}</h2><span className="confidence">{businessDecision.confidencePct}% {tr('confidence', 'confidence')}</span></div><p>{businessDecision.reasons[0] || tr('Strategia calcolata da workload, sensibilità dati, resilienza e costi.', 'Strategy calculated from workload, data sensitivity, resilience and cost.')}</p><div className="hero-actions"><button className="primary" onClick={saveScenario}>{tr('Salva scenario', 'Save scenario')}</button><button onClick={exportPdf}>PDF</button><button onClick={exportExcel}>Excel</button></div></div><div className="hero-kpis"><Kpi label={tr('Hardware', 'Hardware')} value={`${onPrem.inferenceNodes} nodi`} hint={`${onPrem.totalGpuCount} GPU · ${onPrem.serverName}`} /><Kpi label="N-1" value={onPrem.n1Pass ? 'PASS' : 'FAIL'} hint={`~${onPrem.n1ConcurrentCapacity} ${tr('sessioni residue', 'remaining sessions')}`} /><Kpi label={tr('TCO raccomandato 4a', 'Recommended 4y TCO')} value={euro.format(businessDecision.recommendedFourYearCostEur)} hint={input.currentAnnualAiSpendEur > 0 ? `${euro.format(businessDecision.savingsFourYearEur)} ${tr('vs oggi', 'vs today')}` : undefined} /><Kpi label={tr('Break-even on-prem', 'On-prem break-even')} value={businessDecision.breakEvenMonths ? `${Math.round(businessDecision.breakEvenMonths)} mesi` : '—'} hint={`${number.format(onPrem.estimatedAverageKw)} kW avg · ${number.format(onPrem.estimatedItKw)} kW peak`} /></div></section>

    <nav className="section-nav"><a href="#company">{tr('Azienda', 'Company')}</a><a href="#models">{tr('Modelli', 'Models')}</a><a href="#decision">Hardware</a><a href="#deployment">{tr('Strategia', 'Strategy')}</a><a href="#market">{tr('Listini', 'Market')}</a><a href="#whatif">What-if</a><a href="#technical">{tr('Dettagli', 'Details')}</a></nav>

    <section className="panel" id="company"><div className="section-title"><div><span className="step">1</span><h2>{tr('Partiamo dall’azienda', 'Start from the company')}</h2></div><small>{tr('Non serve sapere già quale modello o GPU comprare.', 'You do not need to know the model or GPU in advance.')}</small></div><div className="grid inputs business-inputs">
      <label>{tr('Profilo principale', 'Primary profile')}<select value={input.businessProfile} onChange={e => setField('businessProfile', e.target.value)}><option value="mixed">{tr('Misto aziendale', 'Mixed enterprise')}</option><option value="coding">Coding / software</option><option value="knowledge">Knowledge / documenti / RAG</option><option value="agentic">Agentic / automazioni</option><option value="reasoning">Reasoning / analisi</option></select></label>
      <label>{tr('Sensibilità dati', 'Data sensitivity')}<select value={input.dataSensitivity} onChange={e => setField('dataSensitivity', e.target.value)}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
      <label>{tr('Regione preferita', 'Preferred region')}<select value={input.regionPreference} onChange={e => setField('regionPreference', e.target.value)}><option value="any">Global</option><option value="eu">EU / Europe</option><option value="italy">Italy</option></select></label>
      <label>{tr('Utenti', 'Users')}<input type="number" min="1" value={input.averageUsers} onChange={e => setField('averageUsers', +e.target.value)} /></label>
      <label>{tr('Contemporanei', 'Concurrent')}<input type="number" min="1" value={input.concurrentUsers} onChange={e => setField('concurrentUsers', +e.target.value)} /></label>
      <label>{tr('Context medio', 'Average context')}<input type="number" min="1024" step="1000" value={input.averageContextTokens} onChange={e => setField('averageContextTokens', +e.target.value)} /></label>
      <label>{tr('Context massimo', 'Max context')}<input type="number" min="1024" step="1000" value={input.maxContextTokens} onChange={e => setField('maxContextTokens', +e.target.value)} /></label>
      <label>{tr('Output medio token', 'Average output tokens')}<input type="number" min="1" step="500" value={input.averageOutputTokens} onChange={e => setField('averageOutputTokens', +e.target.value)} /></label>
      <label>{tr('Disponibilità', 'Availability')}<select value={input.availabilityMode} onChange={e => setField('availabilityMode', e.target.value)}><option value="standard">Standard</option><option value="n1">N-1 enterprise</option></select></label>
      <label>{tr('Spend AI attuale €/anno', 'Current AI spend €/year')}<input type="number" min="0" step="10000" value={input.currentAnnualAiSpendEur} onChange={e => setField('currentAnnualAiSpendEur', +e.target.value)} /></label>
      <label>{tr('Crescita annua %', 'Annual growth %')}<input type="number" min="0" max="500" value={input.annualGrowthPct} onChange={e => setField('annualGrowthPct', +e.target.value)} /></label>
      <label>{tr('Orizzonte anni', 'Planning years')}<input type="number" min="1" max="10" value={input.planningHorizonYears} onChange={e => setField('planningHorizonYears', +e.target.value)} /></label>
    </div></section>

    <section id="models"><div className="section-title standalone"><div><span className="step">2</span><h2>{tr('Quali modelli hanno senso', 'Which models make sense')}</h2></div><small>{tr('Ranking costruito sul profilo aziendale; puoi comunque forzare il modello.', 'Ranking based on the business profile; you can still force a model.')}</small></div><div className="model-advisor-grid">{modelRecommendations.slice(0, 4).map((m, i) => <article className={`model-advisor ${input.modelId === m.modelId ? 'selected-card' : ''}`} key={m.modelId}><div className="rankline"><span>#{i + 1}</span><b>{m.score.toFixed(0)}/100</b></div><h3>{m.name}</h3><p>{m.vendor}</p><div className="mini-score-grid"><span>Coding <b>{m.coding}</b></span><span>General <b>{m.general}</b></span><span>Thinking <b>{m.thinking}</b></span></div><small>{m.rationale.slice(1).join(' · ')}</small><button className={input.modelId === m.modelId ? 'primary' : ''} onClick={() => setInput(prev => ({ ...prev, modelId: m.modelId, serverProfileId: 'auto' }))}>{input.modelId === m.modelId ? tr('In uso', 'Selected') : tr('Usa modello', 'Use model')}</button></article>)}</div><div className="selected-model-strip"><div><span className="eyebrow">{selectedModel?.vendor} · {selectedModel?.license}</span><strong>{selectedModel?.name}</strong><small>{selectedModel?.parametersTotalB}B total · {selectedModel?.parametersActiveB}B active · {Math.round((selectedModel?.maxExtendedContextTokens || 0) / 1000)}K context</small></div><div className="mini-bench"><BenchmarkBar label="Coding" value={selectedModel?.benchmarks?.coding || 0} /><BenchmarkBar label="General" value={selectedModel?.benchmarks?.general || 0} /><BenchmarkBar label="Thinking" value={selectedModel?.benchmarks?.thinking || 0} /></div></div></section>

    <section id="decision"><div className="section-title standalone"><div><span className="step">3</span><h2>{tr('Hardware: minimo, consigliato, top', 'Hardware: minimum, recommended, top')}</h2></div><small>{tr('Include ora output token e ridondanza N-1.', 'Now includes output-token pressure and N-1 redundancy.')}</small></div><div className="decision-grid-wrap">{recommendations.map(rec => <DecisionCard key={`${rec.kind}-${rec.assessment.serverProfileId}`} rec={rec} selected={effectiveServerId === rec.assessment.serverProfileId} onSelect={() => useHardware(rec.assessment.serverProfileId)} tr={tr} fitLabel={fitLabel} />)}</div></section>

    <section className="panel" id="deployment"><div className="section-title"><div><span className="step">4</span><h2>{tr('Build, colo, cloud o hybrid?', 'Build, colo, cloud or hybrid?')}</h2></div><small>{tr('La scelta considera anche sensibilità dei dati e spend corrente.', 'The choice also considers data sensitivity and current spend.')}</small></div><div className="ownership-grid four"><article className={businessDecision.recommendedMode === 'onprem' ? 'ownership-card winner' : 'ownership-card'}><span className="eyebrow">ON-PREM</span><strong className="ownership-price">{euro.format(onPrem.monthlyEur)}<small>/{tr('mese', 'mo')}</small></strong><p>{euro.format(onPrem.fourYearTcoEur)} TCO 4y</p><small>{number.format(onPrem.estimatedAverageKw)} kW avg · {onPrem.n1Pass ? 'N-1 PASS' : 'N-1 FAIL'}</small></article><article className={businessDecision.recommendedMode === 'colo' ? 'ownership-card winner' : 'ownership-card'}><span className="eyebrow">COLOCATION</span><strong className="ownership-price">{euro.format(colo.monthlyEur)}<small>/{tr('mese', 'mo')}</small></strong><p>{euro.format(colo.fourYearTcoEur)} TCO 4y</p><small>{tr('Hardware tuo, facility esterna', 'Your hardware, external facility')}</small></article><article className={businessDecision.recommendedMode === 'rental' ? 'ownership-card winner' : 'ownership-card'}><span className="eyebrow">CLOUD</span><strong className="ownership-price">{euro.format(rental.monthlyEur)}<small>/{tr('mese', 'mo')}</small></strong><p>{euro.format(rental.fourYearTcoEur)} TCO 4y</p><small>{input.cloudAllocatedUptimePct}% {tr('uptime fatturato', 'billable uptime')}</small></article><article className={businessDecision.recommendedMode === 'hybrid' ? 'ownership-card winner' : 'ownership-card'}><span className="eyebrow">HYBRID</span><strong className="ownership-price">{euro.format(businessDecision.hybridMonthlyEur)}<small>/{tr('mese', 'mo')}</small></strong><p>{euro.format(businessDecision.hybridFourYearEur)} TCO 4y est.</p><small>{businessDecision.localTrafficPct}% local · {businessDecision.cloudTrafficPct}% cloud</small></article></div><div className="business-case-grid"><article><span className="eyebrow">{tr('PERCHÉ', 'WHY')}</span>{businessDecision.reasons.map((r, i) => <p key={i}>✓ {r}</p>)}</article><article><span className="eyebrow">{tr('PORTAFOGLIO MODELLI', 'MODEL PORTFOLIO')}</span>{businessDecision.portfolio.map(p => <div className="route-row" key={p.role}><b>{p.trafficPct}%</b><span><strong>{p.name}</strong><small>{p.reason}</small></span></div>)}</article></div></section>

    <section className="panel market-panel" id="market"><div className="section-title"><div><span className="step">5</span><h2>{tr('Listini e fornitori', 'Providers and price lists')}</h2></div><small>{tr('Prezzo, topologia e preferenza geografica vengono valutati separatamente.', 'Price, topology and geography are evaluated separately.')}</small></div><div className="market-hero-grid"><article className="market-hero"><span className="eyebrow">{tr('MIGLIOR PREZZO COMPATIBILE', 'BEST COMPATIBLE PRICE')}</span>{bestCloud ? <><h3>{bestCloud.provider}</h3><strong>{euro.format(bestCloud.monthlyTotalEur)}<small>/{tr('mese', 'mo')}</small></strong><p>{bestCloud.product} · {bestCloud.pricingClass}</p><a href={bestCloud.sourceUrl} target="_blank" rel="noreferrer">{tr('Apri listino ↗', 'Open price list ↗')}</a></> : <p>RFQ</p>}</article><article className="market-hero"><span className="eyebrow">{tr('MIGLIOR FIT', 'BEST FIT')}</span>{bestFitCloud ? <><h3>{bestFitCloud.provider}</h3><strong>{bestFitCloud.fitScore}/100</strong><p>{bestFitCloud.regionCompatible ? tr('Regione OK', 'Region OK') : tr('Regione non preferita', 'Region not preferred')} · {bestFitCloud.compatibility}</p><a href={bestFitCloud.sourceUrl} target="_blank" rel="noreferrer">{tr('Apri listino ↗', 'Open price list ↗')}</a></> : <p>—</p>}</article><article className="market-hero"><span className="eyebrow">{tr('MIGLIOR ACQUISTO PUBBLICO', 'BEST PUBLIC PURCHASE')}</span>{bestPurchase ? <><h3>{bestPurchase.supplier}</h3><strong>{euro.format(bestPurchase.totalPurchaseEur)}</strong><p>{bestPurchase.requiredNodes} × {bestPurchase.product}</p><a href={bestPurchase.sourceUrl} target="_blank" rel="noreferrer">{tr('Apri listino ↗', 'Open price list ↗')}</a></> : <p>{tr('Richiedere RFQ', 'Request RFQ')}</p>}</article></div><div className="market-controls"><div className="segmented"><button className={pricingFilter === 'all' ? 'active' : ''} onClick={() => setPricingFilter('all')}>{tr('Tutti', 'All')}</button><button className={pricingFilter === 'on-demand' ? 'active' : ''} onClick={() => setPricingFilter('on-demand')}>On-demand</button><button className={pricingFilter === 'reserved' ? 'active' : ''} onClick={() => setPricingFilter('reserved')}>{tr('Riservati', 'Reserved')}</button></div><label>{tr('Mostra', 'Show')}<select value={offerLimit} onChange={e => setOfferLimit(+e.target.value)}><option value={3}>3</option><option value={5}>5</option><option value={10}>10</option><option value={99}>{tr('Tutti', 'All')}</option></select></label><span>USD→EUR {marketMeta.usdToEur}</span></div><div className="offer-list">{visibleCloudOffers.length ? visibleCloudOffers.map((o, i) => <article className={`offer-card ${i === 0 ? 'best-offer' : ''}`} key={o.id}><span className="offer-rank">#{i + 1}</span><div className="offer-main"><div className="offer-title"><h3>{o.provider}</h3><span className={`compat compat-${o.compatibility}`}>{o.compatibility}</span><span className={o.regionCompatible ? 'region-ok' : 'region-bad'}>{o.regionCompatible ? tr('regione OK', 'region OK') : tr('fuori regione', 'out of region')}</span></div><strong>{o.product}</strong><p>{o.regions.join(' · ') || '—'} · {o.pricingClass}</p><small>{o.compatibilityNote}</small></div><div className="offer-price"><strong>{nativeMoney(o.nativeUnitPrice, o.currency)}<small>/{o.unit}</small></strong><span>≈ {euro.format(o.hourlyTotalEur)}/{tr('ora', 'hour')}</span><b>{euro.format(o.monthlyTotalEur)}<small>/{tr('mese', 'mo')}</small></b><em>{pct.format(o.allocatedUptimePct)}% {tr('uptime fatturato', 'billable uptime')}</em></div><div className="offer-fit"><b>{o.fitScore}</b><small>fit</small></div><a className="source-link" href={o.sourceUrl} target="_blank" rel="noreferrer">{tr('Listino ↗', 'Pricing ↗')}</a></article>) : <div className="empty-market">{tr('Nessuna offerta pubblica corrisponde al filtro.', 'No public offer matches the filter.')}</div>}</div>{(purchaseOffers.length > 0 || rfqOffers.length > 0) && <details className="procurement-details"><summary>{tr('Acquisto server e RFQ', 'Server purchase and RFQ')}</summary><div className="procurement-grid">{purchaseOffers.slice(0, offerLimit).map((o, i) => <article key={o.id}><span className="eyebrow">#{i + 1} · {o.supplier}</span><h3>{o.product}</h3><strong>{euro.format(o.totalPurchaseEur)}</strong><p>{o.requiredNodes} × {nativeMoney(o.nativeUnitPrice, o.currency)} · fit {o.fitScore}/100</p><a href={o.sourceUrl} target="_blank" rel="noreferrer">{tr('Fonte ↗', 'Source ↗')}</a></article>)}{rfqOffers.map(o => <article key={o.id}><span className="eyebrow">RFQ · {o.supplier}</span><h3>{o.product}</h3><strong>{tr('Su preventivo', 'Quote required')}</strong><p>{o.region}</p><a href={o.sourceUrl} target="_blank" rel="noreferrer">{tr('Contatta / fonte ↗', 'Contact / source ↗')}</a></article>)}</div></details>}</section>

    <section id="whatif"><div className="section-title standalone"><div><span className="step">6</span><h2>{tr('What-if e crescita', 'What-if and growth')}</h2></div><small>{tr('Vedi subito cosa cambia prima di comprare.', 'See what changes before buying.')}</small></div><div className="whatif-grid">{whatIfs.map(w => <WhatIfCard key={w.id} item={w} currentMonthly={onPrem.monthlyEur} onApply={() => setInput(w.nextInput)} tr={tr} />)}</div></section>

    <section className="panel" id="technical"><div className="section-title"><div><span className="step">7</span><h2>{tr('Dettaglio tecnico', 'Technical detail')}</h2></div><small>{tr('Costi, energia, audit, cloud uptime e advisor hardware.', 'Costs, energy, audit, cloud uptime and hardware advisor.')}</small></div><div className="fit-summary"><span className="fit-impossible">{tr('Impossibili', 'Impossible')} {counts.impossible || 0}</span><span className="fit-strained">{tr('Sotto sforzo', 'Strained')} {counts.strained || 0}</span><span className="fit-recommended">{tr('Consigliati', 'Recommended')} {counts.recommended || 0}</span><span className="fit-top">Top {counts.top || 0}</span></div>
      <details open={viewMode === 'technical'}><summary>{tr('Advisor hardware completo', 'Full hardware advisor')}</summary><div className="advisor-grid">{hardwareAssessments.map(a => <article className={`advisor-card status-${a.status} ${effectiveServerId === a.serverProfileId ? 'advisor-selected' : ''}`} key={a.serverProfileId}><div className="advisor-card-head"><div><FitBadge status={a.status} label={fitLabel(a.status)} /><h3>{a.serverName}</h3></div><strong>{euro.format(a.estimatedCapexEur)}</strong></div><div className="advisor-metrics"><span><small>{tr('Nodi', 'Nodes')}</small><b>{a.requiredNodes}</b></span><span><small>{tr('Ridondanza', 'Redundancy')}</small><b>+{a.redundancyNodes}</b></span><span><small>N-1</small><b className={a.n1Pass ? 'ok' : 'bad'}>{a.n1Pass ? `PASS ~${a.n1ConcurrentCapacity}` : `FAIL ~${a.n1ConcurrentCapacity}`}</b></span><span><small>VRAM</small><b>{pct.format(a.memoryUtilizationPct)}%</b></span><span><small>{tr('Avg power', 'Avg power')}</small><b>{number.format(a.averageKw)} kW</b></span><span><small>Peak</small><b>{number.format(a.peakKw)} kW</b></span></div><div className="advisor-reasons">{a.reasons.slice(0, 4).map((reason, i) => <p key={i}>{reason}</p>)}</div><button disabled={a.status === 'impossible'} className={effectiveServerId === a.serverProfileId ? 'primary' : ''} onClick={() => useHardware(a.serverProfileId)}>{effectiveServerId === a.serverProfileId ? tr('Selezionato', 'Selected') : tr('Usa hardware', 'Use hardware')}</button></article>)}</div></details>
      <details open={viewMode === 'technical'}><summary>{tr('Assunzioni economiche e operative', 'Economic and operational assumptions')}</summary><div className="grid inputs technical-inputs"><label>{tr('Utilizzo GPU medio %', 'Average GPU utilization %')}<input type="number" min="1" max="100" value={input.gpuUtilizationPct} onChange={e => setField('gpuUtilizationPct', +e.target.value)} /></label><label>{tr('Cloud uptime fatturato %', 'Cloud billable uptime %')}<input type="number" min="1" max="100" value={input.cloudAllocatedUptimePct} onChange={e => setField('cloudAllocatedUptimePct', +e.target.value)} /></label><label>{tr('Energia €/kWh', 'Electricity €/kWh')}<input type="number" min="0" step="0.01" value={input.electricityEurPerKwh} onChange={e => setField('electricityEurPerKwh', +e.target.value)} /></label><label>PUE<input type="number" min="1" step="0.05" value={input.pue} onChange={e => setField('pue', +e.target.value)} /></label><label>{tr('Cooling fisso €/anno', 'Fixed cooling €/year')}<input type="number" min="0" step="1000" value={input.coolingAnnualEur} onChange={e => setField('coolingAnnualEur', +e.target.value)} /></label><label>{tr('Maintenance %', 'Maintenance %')}<input type="number" min="0" max="50" value={input.maintenancePercent} onChange={e => setField('maintenancePercent', +e.target.value)} /></label><label>{tr('Ammortamento anni', 'Amortization years')}<input type="number" min="1" max="10" value={input.hardwareAmortizationYears} onChange={e => setField('hardwareAmortizationYears', +e.target.value)} /></label><label>{tr('Fit-out on-prem €', 'On-prem fit-out €')}<input type="number" min="0" step="5000" value={input.onPremFitoutEur} onChange={e => setField('onPremFitoutEur', +e.target.value)} /></label></div></details>
      <details><summary>{tr('Sizing LLMProxy / audit', 'LLMProxy / audit sizing')}</summary><div className="grid inputs technical-inputs"><label>{tr('Retention audit giorni', 'Audit retention days')}<input type="number" min="1" max="4015" value={input.auditRetentionDays} onChange={e => setField('auditRetentionDays', +e.target.value)} /></label><label>{tr('Request per utente/giorno', 'Requests per user/day')}<input type="number" min="1" value={input.requestsPerUserPerDay} onChange={e => setField('requestsPerUserPerDay', +e.target.value)} /></label><label>{tr('Payload audit medio KB', 'Average audit payload KB')}<input type="number" min="1" step="32" value={input.avgAuditPayloadKb} onChange={e => setField('avgAuditPayloadKb', +e.target.value)} /></label><label>{tr('Costo server LLMProxy €', 'LLMProxy server cost €')}<input type="number" min="0" step="500" value={input.proxyServerPriceEur} onChange={e => setField('proxyServerPriceEur', +e.target.value)} /></label></div><div className="control-plane-summary"><Kpi label="LLMProxy" value={`${onPrem.proxyServers} server`} hint={input.availabilityMode === 'n1' ? 'HA minimum' : 'standard'} /><Kpi label={tr('Audit storage', 'Audit storage')} value={`~${onPrem.controlPlaneStorageTb} TB`} hint={`${input.auditRetentionDays} ${tr('giorni', 'days')}`} /><Kpi label={tr('Potenza media totale', 'Total average power')} value={`${number.format(onPrem.estimatedAverageKw)} kW`} hint={`${number.format(onPrem.estimatedItKw)} kW peak`} /></div></details>
      <details><summary>{tr('Rischi e limiti del modello', 'Risks and model limitations')}</summary><div className="risk-list">{businessDecision.risks.map((r, i) => <p key={i}>⚠ {r}</p>)}{onPrem.warnings.map((w, i) => <p key={`w-${i}`}>⚠ {w}</p>)}</div></details>
    </section>

    <section className="panel saved-panel"><div className="section-title"><div><h2>{tr('Scenari salvati', 'Saved scenarios')}</h2></div><small>{saved.length}/30</small></div>{saved.length === 0 ? <p className="muted">{tr('Nessuno scenario salvato.', 'No saved scenarios.')}</p> : <div className="saved-list">{saved.map(s => <button key={s.id} onClick={() => restore(s)}><strong>{new Date(s.createdAt).toLocaleString()}</strong><span>{(catalog.models as any[]).find(m => m.id === s.input.modelId)?.name} · {s.input.concurrentUsers} concurrent · {s.input.availabilityMode || 'standard'}</span></button>)}</div>}</section>
    <footer><span>{catalog.meta.benchmarkMethod}</span><span>{tr('Prima dell’acquisto: benchmark reale, security review e RFQ.', 'Before procurement: real benchmark, security review and RFQ.')}</span></footer>
  </main><div className="mobile-actionbar"><button onClick={saveScenario}>{tr('Salva', 'Save')}</button><a href="#decision">Hardware</a><button className="primary" onClick={exportPdf}>PDF</button></div></div>;
}
