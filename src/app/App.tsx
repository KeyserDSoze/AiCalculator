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
  ScenarioResult,
  Strategy
} from './calculator';
import {
  cheapestExactCloudOffer,
  cheapestPurchaseOffer,
  getCloudOffers,
  getPurchaseOffers,
  getRfqOffers,
  marketMeta
} from './marketplace';
import './styles.css';

type SavedScenario = { id: string; createdAt: string; input: CalculatorInput; results: ScenarioResult[] };
type ViewMode = 'executive' | 'technical';
type RecommendationKind = 'minimum' | 'recommended' | 'top';

type Recommendation = {
  kind: RecommendationKind;
  assessment: HardwareAssessment;
  title: string;
  subtitle: string;
};

type WhatIf = {
  id: string;
  title: string;
  subtitle: string;
  nextInput: CalculatorInput;
  scenario: ScenarioResult;
  assessment?: HardwareAssessment;
};

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
  return <div className="benchmark-row"><span>{label}</span><div className="benchmark-track"><div className="benchmark-fill" style={{ width: `${value}%` }} /></div><strong>{value}</strong></div>;
}

function FitBadge({ status, label }: { status: HardwareFit; label: string }) {
  return <span className={`fit-badge fit-${status}`}>{label}</span>;
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="kpi"><small>{label}</small><strong>{value}</strong>{hint && <span>{hint}</span>}</div>;
}

function RecommendationCard({ rec, selected, onSelect, tr, fitLabel }: {
  rec: Recommendation;
  selected: boolean;
  onSelect: () => void;
  tr: (itText: string, enText: string) => string;
  fitLabel: (status: HardwareFit) => string;
}) {
  const a = rec.assessment;
  return <article className={`decision-card decision-${rec.kind} ${selected ? 'decision-selected' : ''}`}>
    <div className="decision-topline"><span className={`decision-mark mark-${rec.kind}`}>{rec.kind === 'minimum' ? '01' : rec.kind === 'recommended' ? '02' : '03'}</span><FitBadge status={a.status} label={fitLabel(a.status)} /></div>
    <h3>{rec.title}</h3>
    <p>{rec.subtitle}</p>
    <div className="decision-price">{euro.format(a.estimatedCapexEur)}<small>{tr(' CAPEX inferenza', ' inference CAPEX')}</small></div>
    <div className="decision-grid">
      <span><small>{tr('Nodi', 'Nodes')}</small><b>{a.requiredNodes}</b></span>
      <span><small>GPU</small><b>{a.requiredGpuCount}</b></span>
      <span><small>{tr('Capacità', 'Capacity')}</small><b>~{a.estimatedConcurrentCapacity}</b></span>
      <span><small>{tr('Margine', 'Headroom')}</small><b>{pct.format(a.capacityHeadroomPct)}%</b></span>
    </div>
    <div className="decision-reason">{a.reasons[0]}</div>
    <button className={selected ? 'primary' : ''} disabled={a.status === 'impossible'} onClick={onSelect}>{selected ? tr('Selezionato', 'Selected') : tr('Usa questa configurazione', 'Use this configuration')}</button>
  </article>;
}

function WhatIfCard({ item, currentMonthly, onApply, tr }: {
  item: WhatIf;
  currentMonthly: number;
  onApply: () => void;
  tr: (itText: string, enText: string) => string;
}) {
  const delta = item.scenario.monthlyEur - currentMonthly;
  return <article className="whatif-card">
    <div className="whatif-head"><div><span className="eyebrow">WHAT-IF</span><h3>{item.title}</h3></div><span className={delta <= 0 ? 'delta-good' : 'delta-bad'}>{delta <= 0 ? '' : '+'}{euro.format(delta)}/{tr('mese', 'mo')}</span></div>
    <p>{item.subtitle}</p>
    <div className="whatif-kpis">
      <span><small>{tr('Hardware', 'Hardware')}</small><b>{item.scenario.inferenceNodes} × {item.scenario.serverName}</b></span>
      <span><small>{tr('Mensile', 'Monthly')}</small><b>{euro.format(item.scenario.monthlyEur)}</b></span>
      <span><small>{tr('TCO 4 anni', '4-year TCO')}</small><b>{euro.format(item.scenario.fourYearTcoEur)}</b></span>
    </div>
    <button onClick={onApply}>{tr('Applica scenario', 'Apply scenario')}</button>
  </article>;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const it = i18n.language.startsWith('it');
  const tr = (itText: string, enText: string) => it ? itText : enText;
  const fitLabel = (status: HardwareFit) => ({
    impossible: tr('Impossibile', 'Impossible'),
    strained: tr('Sotto sforzo', 'Strained'),
    recommended: tr('Consigliato', 'Recommended'),
    top: 'Top'
  }[status]);

  const [theme, setTheme] = useState(localStorage.getItem('ai-calculator-theme') || 'dark');
  const [viewMode, setViewMode] = useState<ViewMode>('executive');
  const [saved, setSaved] = useState<SavedScenario[]>(loadSaved);
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_INPUT);
  const [offerLimit, setOfferLimit] = useState(5);
  const [pricingFilter, setPricingFilter] = useState<'all' | 'on-demand' | 'reserved'>('all');

  const results = useMemo(() => calculate(input), [input]);
  const onPrem = results.find(r => r.id === 'onprem') || results[0];
  const hardwareAssessments = useMemo(() => assessHardware(input), [input]);
  const selectedModel = (catalog.models as any[]).find(m => m.id === input.modelId);
  const inferenceServers = (catalog.serverProfiles as any[]).filter(s => s.role === 'inference');
  const effectiveServerId = onPrem?.serverProfileId;
  const effectiveServer = inferenceServers.find(s => s.id === effectiveServerId);
  const selectedAssessment = hardwareAssessments.find(a => a.serverProfileId === effectiveServerId) || hardwareAssessments[0];

  const cloudOffers = useMemo(() => selectedAssessment ? getCloudOffers(input, selectedAssessment) : [], [input, selectedAssessment]);
  const purchaseOffers = useMemo(() => selectedAssessment ? getPurchaseOffers(selectedAssessment) : [], [selectedAssessment]);
  const rfqOffers = useMemo(() => selectedAssessment ? getRfqOffers(selectedAssessment) : [], [selectedAssessment]);
  const bestCloud = useMemo(() => selectedAssessment ? cheapestExactCloudOffer(input, selectedAssessment) : undefined, [input, selectedAssessment]);
  const bestPurchase = useMemo(() => selectedAssessment ? cheapestPurchaseOffer(selectedAssessment) : undefined, [selectedAssessment]);

  const visibleCloudOffers = useMemo(() => cloudOffers
    .filter(o => pricingFilter === 'all' || o.pricingClass === pricingFilter)
    .slice()
    .sort((a, b) => a.monthlyTotalEur - b.monthlyTotalEur)
    .slice(0, offerLimit), [cloudOffers, pricingFilter, offerLimit]);

  const recommendations = useMemo<Recommendation[]>(() => {
    const feasible = hardwareAssessments.filter(a => a.status !== 'impossible');
    if (!feasible.length) return [];
    const minimum = feasible.slice().sort((a, b) => a.estimatedCapexEur - b.estimatedCapexEur)[0];
    const balancedPool = feasible.filter(a => a.status === 'recommended');
    const recommended = (balancedPool.length ? balancedPool : feasible.filter(a => a.status === 'top')).slice().sort((a, b) => a.estimatedCapexEur - b.estimatedCapexEur)[0] || minimum;
    const topPool = feasible.filter(a => a.status === 'top');
    const top = (topPool.length ? topPool : feasible).slice().sort((a, b) => b.capacityHeadroomPct - a.capacityHeadroomPct || b.estimatedConcurrentCapacity - a.estimatedConcurrentCapacity)[0];
    const raw: Recommendation[] = [
      { kind: 'minimum', assessment: minimum, title: tr('Minimo accettabile', 'Minimum viable'), subtitle: tr('La configurazione con CAPEX più basso che rimane tecnicamente utilizzabile.', 'Lowest-CAPEX configuration that remains technically usable.') },
      { kind: 'recommended', assessment: recommended, title: tr('Scelta consigliata', 'Recommended choice'), subtitle: tr('Il miglior compromesso tra margine, semplicità operativa e costo.', 'Best balance of headroom, operational simplicity and cost.') },
      { kind: 'top', assessment: top, title: tr('Top performance', 'Top performance'), subtitle: tr('Massimo margine per picchi, latenza e crescita futura.', 'Maximum headroom for peaks, latency and future growth.') }
    ];
    return raw.filter((r, index) => raw.findIndex(x => x.assessment.serverProfileId === r.assessment.serverProfileId) === index || index === 1);
  }, [hardwareAssessments, it]);

  const whatIfs = useMemo<WhatIf[]>(() => {
    const variants: Array<{ id: string; title: string; subtitle: string; nextInput: CalculatorInput }> = [
      {
        id: 'context-half',
        title: tr('Context dimezzato', 'Half context'),
        subtitle: tr('Riduce pressione su KV cache e prefill mantenendo lo stesso modello.', 'Reduces KV-cache and prefill pressure while keeping the same model.'),
        nextInput: { ...input, averageContextTokens: Math.max(4096, Math.round(input.averageContextTokens / 2)), maxContextTokens: Math.max(8192, Math.round(input.maxContextTokens / 2)) }
      },
      {
        id: 'concurrency-up',
        title: tr('+50% contemporaneità', '+50% concurrency'),
        subtitle: tr('Stress test per capire quanto costa crescere senza cambiare modello.', 'Stress test to see what growth costs without changing the model.'),
        nextInput: { ...input, concurrentUsers: Math.max(1, Math.ceil(input.concurrentUsers * 1.5)) }
      },
      {
        id: 'economy',
        title: tr('Profilo economico', 'Economy profile'),
        subtitle: tr('Riduce headroom e privilegia il CAPEX minimo.', 'Reduces headroom and prioritizes minimum CAPEX.'),
        nextInput: { ...input, strategy: 'conservative', serverProfileId: 'auto' }
      },
      {
        id: 'performance',
        title: tr('Profilo performance', 'Performance profile'),
        subtitle: tr('Aumenta headroom per picchi e latenza più prevedibile.', 'Adds headroom for peaks and more predictable latency.'),
        nextInput: { ...input, strategy: 'performance', serverProfileId: 'auto' }
      }
    ];
    return variants.map(v => {
      const scenario = calculate(v.nextInput).find(r => r.id === 'onprem') || calculate(v.nextInput)[0];
      const assessment = assessHardware(v.nextInput).find(a => a.serverProfileId === scenario.serverProfileId);
      return { ...v, scenario, assessment };
    });
  }, [input, it]);

  const counts = useMemo(() => hardwareAssessments.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<HardwareFit, number>), [hardwareAssessments]);

  const setField = (field: keyof CalculatorInput, value: string | number) => setInput(prev => ({ ...prev, [field]: value }));
  const useHardware = (id: string) => setInput(prev => ({ ...prev, serverProfileId: id }));
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem('ai-calculator-theme', next); };
  const toggleLanguage = () => { const next = it ? 'en' : 'it'; i18n.changeLanguage(next); localStorage.setItem('ai-calculator-language', next); };
  const saveScenario = () => { const entry: SavedScenario = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), input, results }; const next = [entry, ...saved].slice(0, 30); setSaved(next); localStorage.setItem('ai-calculator-scenarios', JSON.stringify(next)); };
  const restore = (entry: SavedScenario) => setInput({ ...DEFAULT_INPUT, ...entry.input });

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('AI Infrastructure Calculator', 14, 18);
    doc.setFontSize(10);
    let y = 30;
    [
      `Model: ${selectedModel?.name}`,
      `Users: ${input.averageUsers} | Concurrent: ${input.concurrentUsers}`,
      `Average context: ${input.averageContextTokens.toLocaleString()} | Max context: ${input.maxContextTokens.toLocaleString()}`,
      `Sizing profile: ${input.strategy}`,
      `Selected hardware: ${effectiveServer?.name || onPrem?.serverName} (${selectedAssessment?.status || 'recommended'})`,
      `Electricity: ${input.electricityEurPerKwh.toFixed(3)} EUR/kWh | PUE: ${input.pue.toFixed(2)}`
    ].forEach(line => { doc.text(line, 14, y); y += 6; });

    y += 3; doc.setFontSize(12); doc.text('Decision shortlist', 14, y); y += 6; doc.setFontSize(9);
    recommendations.forEach(r => { doc.text(`${r.kind.toUpperCase()} | ${r.assessment.requiredNodes} x ${r.assessment.serverName} | ${euro.format(r.assessment.estimatedCapexEur)} | capacity ~${r.assessment.estimatedConcurrentCapacity}`, 18, y); y += 5; });

    y += 4; doc.setFontSize(12); doc.text('Market offers', 14, y); y += 6; doc.setFontSize(9);
    cloudOffers.slice().sort((a,b) => a.monthlyTotalEur - b.monthlyTotalEur).slice(0, 5).forEach(o => {
      doc.text(`${o.provider} ${o.product} | ${o.pricingClass} | ~${euro.format(o.monthlyTotalEur)}/month | ${o.compatibility}`, 18, y); y += 5;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    purchaseOffers.slice(0, 5).forEach(o => {
      doc.text(`${o.supplier} ${o.product} | ${o.requiredNodes} node(s) = ~${euro.format(o.totalPurchaseEur)}`, 18, y); y += 5;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    y += 4;
    results.forEach(r => {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(12); doc.text(r.id.toUpperCase(), 14, y); y += 6; doc.setFontSize(10);
      [`Inference: ${r.inferenceNodes} x ${r.serverName}`, `LLMProxy servers: ${r.proxyServers}`, `Capacity: ~${r.estimatedConcurrentCapacity}`, `Peak IT load: ${r.estimatedItKw.toFixed(1)} kW`, `CAPEX: ${euro.format(r.capexEur)}`, `Monthly planning cost: ${euro.format(r.monthlyEur)}`, `4-year TCO: ${euro.format(r.fourYearTcoEur)}`].forEach(line => { doc.text(line, 18, y); y += 5; });
      y += 4;
    });
    doc.save(`ai-calculator-${Date.now()}.pdf`);
  };

  const exportExcel = () => {
    const summary = results.map(r => ({ Scenario: r.id, Model: selectedModel?.name, HardwareFit: r.hardwareFit, Hardware: r.serverName, AverageUsers: input.averageUsers, ConcurrentUsers: input.concurrentUsers, AverageContext: input.averageContextTokens, MaxContext: input.maxContextTokens, Strategy: input.strategy, ProxyServers: r.proxyServers, InferenceNodes: r.inferenceNodes, GPUs: r.totalGpuCount, VRAM_GB: r.totalVramGb, EstimatedConcurrentCapacity: r.estimatedConcurrentCapacity, PeakIT_kW: Number(r.estimatedItKw.toFixed(2)), CapexEUR: Math.round(r.capexEur), MonthlyEUR: Math.round(r.monthlyEur), AnnualEUR: Math.round(r.annualEur), FourYearTCO_EUR: Math.round(r.fourYearTcoEur) }));
    const decision = recommendations.map(r => ({ Tier: r.kind, Hardware: r.assessment.serverName, Status: r.assessment.status, Nodes: r.assessment.requiredNodes, GPUs: r.assessment.requiredGpuCount, Capacity: r.assessment.estimatedConcurrentCapacity, HeadroomPct: Math.round(r.assessment.capacityHeadroomPct), CapexEUR: Math.round(r.assessment.estimatedCapexEur), Reason: r.assessment.reasons.join(' | ') }));
    const advisor = hardwareAssessments.map(a => ({ Hardware: a.serverName, Status: a.status, NodesRequired: a.requiredNodes, NodesPerReplica: a.nodesPerReplica, GPUs: a.requiredGpuCount, TotalVRAM_GB: a.totalVramGb, Capacity: a.estimatedConcurrentCapacity, HeadroomPct: Math.round(a.capacityHeadroomPct), ModelMemoryGB: Math.round(a.modelMemoryGb), MemoryUtilizationPct: Math.round(a.memoryUtilizationPct), CapexEUR: Math.round(a.estimatedCapexEur), PeakKW: Number(a.peakKw.toFixed(1)), Reasons: a.reasons.join(' | ') }));
    const cloud = cloudOffers.map(o => ({ Provider: o.provider, Product: o.product, Pricing: o.pricingClass, Compatibility: o.compatibility, Region: o.regions.join(', '), NativeRate: o.nativeUnitPrice, Currency: o.currency, Unit: o.unit, UnitRateEUR: Number(o.unitPriceEur.toFixed(2)), EstimatedHourlyEUR: Number(o.hourlyTotalEur.toFixed(2)), EstimatedMonthlyEUR: Math.round(o.monthlyTotalEur), EstimatedAnnualEUR: Math.round(o.annualTotalEur), UtilizationPct: Math.round(o.utilizationPct), Billing: o.billing, SourceDate: o.sourceDate, Source: o.sourceUrl, Notes: o.notes }));
    const purchase = purchaseOffers.map(o => ({ Supplier: o.supplier, Product: o.product, NativeUnitPrice: o.nativeUnitPrice, Currency: o.currency, UnitPriceEUR: Math.round(o.unitPriceEur), NodesRequired: o.requiredNodes, TotalPurchaseEUR: Math.round(o.totalPurchaseEur), Region: o.region, Availability: o.availability, LeadTime: o.leadTime, SourceDate: o.sourceDate, Source: o.sourceUrl, Notes: o.notes }));
    const whatIf = whatIfs.map(w => ({ Scenario: w.title, Hardware: w.scenario.serverName, Nodes: w.scenario.inferenceNodes, MonthlyEUR: Math.round(w.scenario.monthlyEur), FourYearTCO_EUR: Math.round(w.scenario.fourYearTcoEur), DeltaMonthlyEUR: Math.round(w.scenario.monthlyEur - onPrem.monthlyEur) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Scenarios');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(decision), 'Decision Shortlist');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(whatIf), 'What If');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(advisor), 'Hardware Advisor');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cloud), 'Cloud Offers');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchase), 'Purchase Offers');
    XLSX.writeFile(wb, `ai-calculator-${Date.now()}.xlsx`);
  };

  return <div className={theme}>
    <div className="app-bg" />
    <main className="shell">
      <header className="topbar">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /><div><h1>{t('title')}</h1><p>{tr('Decision engine per infrastrutture LLM.', 'Decision engine for LLM infrastructure.')}</p></div></div>
        <div className="toolbar">
          <span className="data-date">{t('dataUpdated')}: {catalog.meta.lastUpdated}</span>
          <div className="mode-switch"><button className={viewMode === 'executive' ? 'active' : ''} onClick={() => setViewMode('executive')}>{tr('Executive', 'Executive')}</button><button className={viewMode === 'technical' ? 'active' : ''} onClick={() => setViewMode('technical')}>{tr('Tecnica', 'Technical')}</button></div>
          <button onClick={toggleLanguage}>{it ? 'EN' : 'IT'}</button>
          <button onClick={toggleTheme}>{theme === 'dark' ? '☀' : '◐'}</button>
        </div>
      </header>

      <section className="hero-dashboard" id="overview">
        <div className="hero-copy">
          <span className="eyebrow">{tr('RACCOMANDAZIONE CORRENTE', 'CURRENT RECOMMENDATION')}</span>
          <div className="hero-title-row"><h2>{effectiveServer?.name || onPrem?.serverName}</h2>{selectedAssessment && <FitBadge status={selectedAssessment.status} label={fitLabel(selectedAssessment.status)} />}</div>
          <p>{selectedAssessment?.reasons[0] || tr('Configurazione calcolata sul workload inserito.', 'Configuration calculated from the current workload.')}</p>
          <div className="hero-actions"><button className="primary" onClick={saveScenario}>{tr('Salva scenario', 'Save scenario')}</button><button onClick={exportPdf}>PDF</button><button onClick={exportExcel}>Excel</button></div>
        </div>
        <div className="hero-kpis">
          <Kpi label={tr('Nodi inferenza', 'Inference nodes')} value={onPrem.inferenceNodes} hint={`${onPrem.totalGpuCount} GPU`} />
          <Kpi label={tr('Capacità stimata', 'Estimated capacity')} value={`~${onPrem.estimatedConcurrentCapacity}`} hint={`${input.concurrentUsers} ${tr('richiesti', 'required')}`} />
          <Kpi label={tr('CAPEX', 'CAPEX')} value={euro.format(onPrem.capexEur)} hint={tr('in casa', 'on-prem')} />
          <Kpi label={tr('TCO 4 anni', '4-year TCO')} value={euro.format(onPrem.fourYearTcoEur)} hint={`${number.format(onPrem.estimatedItKw)} kW peak`} />
        </div>
      </section>

      <nav className="section-nav">
        <a href="#workload">{tr('Workload', 'Workload')}</a>
        <a href="#decision">{tr('Scelta', 'Decision')}</a>
        <a href="#market">{tr('Listini', 'Market')}</a>
        <a href="#whatif">What-if</a>
        <a href="#technical">{tr('Dettagli', 'Details')}</a>
      </nav>

      <section className="panel compact-panel" id="workload">
        <div className="section-title"><div><span className="step">1</span><h2>{tr('Workload', 'Workload')}</h2></div><small>{tr('Modifica gli input e tutto il resto si aggiorna in tempo reale.', 'Change the inputs and every recommendation updates in real time.')}</small></div>
        <div className="grid inputs premium-inputs">
          <label className="input-wide">{t('model')}<select value={input.modelId} onChange={e => setField('modelId', e.target.value)}>{(catalog.models as any[]).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>{t('users')}<input type="number" min="1" value={input.averageUsers} onChange={e => setField('averageUsers', +e.target.value)} /></label>
          <label>{t('concurrent')}<input type="number" min="1" value={input.concurrentUsers} onChange={e => setField('concurrentUsers', +e.target.value)} /></label>
          <label>{t('avgContext')}<input type="number" min="1024" step="1000" value={input.averageContextTokens} onChange={e => setField('averageContextTokens', +e.target.value)} /></label>
          <label>{t('maxContext')}<input type="number" min="1024" step="1000" value={input.maxContextTokens} onChange={e => setField('maxContextTokens', +e.target.value)} /></label>
          <label>{t('strategy')}<select value={input.strategy} onChange={e => setField('strategy', e.target.value as Strategy)}><option value="conservative">{t('conservative')}</option><option value="balanced">{t('balanced')}</option><option value="performance">{t('performance')}</option></select></label>
        </div>
        <div className="model-strip">
          <div><span className="eyebrow">{selectedModel?.vendor} · {selectedModel?.license}</span><strong>{selectedModel?.parametersTotalB}B <small>/ {selectedModel?.parametersActiveB}B active</small></strong><span>{Math.round((selectedModel?.maxExtendedContextTokens || 0) / 1000)}K max context</span></div>
          <div className="mini-bench"><BenchmarkBar label={t('coding')} value={selectedModel?.benchmarks?.coding || 0} /><BenchmarkBar label={t('general')} value={selectedModel?.benchmarks?.general || 0} /><BenchmarkBar label={t('thinking')} value={selectedModel?.benchmarks?.thinking || 0} /></div>
        </div>
      </section>

      <section id="decision">
        <div className="section-title standalone"><div><span className="step">2</span><h2>{tr('Tre scelte, una decisione', 'Three choices, one decision')}</h2></div><small>{tr('Dal minimo sostenibile al massimo margine.', 'From minimum viable to maximum headroom.')}</small></div>
        <div className="decision-grid-wrap">{recommendations.map(rec => <RecommendationCard key={`${rec.kind}-${rec.assessment.serverProfileId}`} rec={rec} selected={effectiveServerId === rec.assessment.serverProfileId} onSelect={() => useHardware(rec.assessment.serverProfileId)} tr={tr} fitLabel={fitLabel} />)}</div>
      </section>

      <section className="panel ownership-panel">
        <div className="section-title"><div><span className="step">3</span><h2>{tr('Dove metterlo e quanto costa', 'Where to run it and what it costs')}</h2></div><small>{tr('Stesso hardware, tre modelli economici.', 'Same hardware, three economic models.')}</small></div>
        <div className="ownership-grid">{results.map(r => <article className={`ownership-card ${r.id === 'onprem' ? 'ownership-primary' : ''}`} key={r.id}>
          <div className="ownership-head"><span>{r.id === 'onprem' ? tr('IN CASA', 'ON-PREM') : r.id === 'colo' ? 'COLOCATION' : 'CLOUD'}</span>{r.id === 'onprem' && <b>{tr('Controllo massimo', 'Maximum control')}</b>}</div>
          <strong className="ownership-price">{euro.format(r.monthlyEur)}<small>/{tr('mese', 'mo')}</small></strong>
          <div className="ownership-stats"><span><small>CAPEX</small><b>{euro.format(r.capexEur)}</b></span><span><small>{tr('Annuale', 'Annual')}</small><b>{euro.format(r.annualEur)}</b></span><span><small>{tr('TCO 4 anni', '4-year TCO')}</small><b>{euro.format(r.fourYearTcoEur)}</b></span></div>
        </article>)}</div>
      </section>

      <section className="panel market-panel" id="market">
        <div className="section-title"><div><span className="step">4</span><h2>{tr('Listini e fornitori', 'Providers and price lists')}</h2></div><small>{tr('Prezzi ordinati dal più conveniente per la configurazione selezionata.', 'Prices ranked from the cheapest for the selected configuration.')}</small></div>
        <div className="market-hero-grid">
          <article className="market-hero"><span className="eyebrow">{tr('MIGLIOR CLOUD COMPATIBILE', 'BEST COMPATIBLE CLOUD')}</span>{bestCloud ? <><h3>{bestCloud.provider}</h3><strong>{euro.format(bestCloud.monthlyTotalEur)}<small>/{tr('mese', 'mo')}</small></strong><p>{bestCloud.product} · {bestCloud.pricingClass}</p><a href={bestCloud.sourceUrl} target="_blank" rel="noreferrer">{tr('Apri listino ↗', 'Open price list ↗')}</a></> : <p>{tr('Nessuna offerta esatta pubblica per questa topologia.', 'No exact public offer for this topology.')}</p>}</article>
          <article className="market-hero"><span className="eyebrow">{tr('MIGLIOR ACQUISTO PUBBLICO', 'BEST PUBLIC PURCHASE')}</span>{bestPurchase ? <><h3>{bestPurchase.supplier}</h3><strong>{euro.format(bestPurchase.totalPurchaseEur)}</strong><p>{bestPurchase.requiredNodes} × {bestPurchase.product}</p><a href={bestPurchase.sourceUrl} target="_blank" rel="noreferrer">{tr('Apri listino ↗', 'Open price list ↗')}</a></> : <p>{tr('Prezzo pubblico non disponibile: richiedere RFQ.', 'No public price: request an RFQ.')}</p>}</article>
        </div>

        <div className="market-controls"><div className="segmented"><button className={pricingFilter === 'all' ? 'active' : ''} onClick={() => setPricingFilter('all')}>{tr('Tutti', 'All')}</button><button className={pricingFilter === 'on-demand' ? 'active' : ''} onClick={() => setPricingFilter('on-demand')}>On-demand</button><button className={pricingFilter === 'reserved' ? 'active' : ''} onClick={() => setPricingFilter('reserved')}>{tr('Riservati', 'Reserved')}</button></div><label>{tr('Mostra', 'Show')}<select value={offerLimit} onChange={e => setOfferLimit(+e.target.value)}><option value={3}>3</option><option value={5}>5</option><option value={10}>10</option><option value={99}>{tr('Tutti', 'All')}</option></select></label><span>USD→EUR {marketMeta.usdToEur}</span></div>

        <div className="offer-list compact-offers">{visibleCloudOffers.length ? visibleCloudOffers.map((o, i) => <article className={`offer-card ${i === 0 ? 'best-offer' : ''}`} key={o.id}>
          <span className="offer-rank">#{i + 1}</span>
          <div className="offer-main"><div className="offer-title"><h3>{o.provider}</h3>{i === 0 && <span className="best-badge">BEST</span>}<span className={`compat compat-${o.compatibility}`}>{o.compatibility}</span></div><strong>{o.product}</strong><p>{o.regions.join(' · ') || '—'} · {o.pricingClass}</p><small>{o.compatibilityNote}</small></div>
          <div className="offer-price"><strong>{nativeMoney(o.nativeUnitPrice, o.currency)}<small>/{o.unit}</small></strong><span>≈ {euro.format(o.hourlyTotalEur)}/{tr('ora', 'hour')}</span><b>{euro.format(o.monthlyTotalEur)}<small>/{tr('mese', 'mo')}</small></b><em>{pct.format(o.utilizationPct)}% util.</em></div>
          <a className="source-link" href={o.sourceUrl} target="_blank" rel="noreferrer">{tr('Listino ↗', 'Pricing ↗')}</a>
        </article>) : <div className="empty-market">{tr('Nessuna offerta pubblica corrisponde al filtro corrente.', 'No public offer matches the current filter.')}</div>}</div>

        {(purchaseOffers.length > 0 || rfqOffers.length > 0) && <details className="procurement-details"><summary>{tr('Acquisto server e RFQ', 'Server purchase and RFQ')}</summary><div className="procurement-grid">{purchaseOffers.slice(0, offerLimit).map((o, i) => <article key={o.id}><span className="eyebrow">#{i + 1} · {o.supplier}</span><h3>{o.product}</h3><strong>{euro.format(o.totalPurchaseEur)}</strong><p>{o.requiredNodes} × {nativeMoney(o.nativeUnitPrice, o.currency)}</p><a href={o.sourceUrl} target="_blank" rel="noreferrer">{tr('Fonte ↗', 'Source ↗')}</a></article>)}{rfqOffers.map(o => <article key={o.id}><span className="eyebrow">RFQ · {o.supplier}</span><h3>{o.product}</h3><strong>{tr('Su preventivo', 'Quote required')}</strong><p>{o.region}</p><a href={o.sourceUrl} target="_blank" rel="noreferrer">{tr('Contatta / fonte ↗', 'Contact / source ↗')}</a></article>)}</div></details>}
      </section>

      <section id="whatif">
        <div className="section-title standalone"><div><span className="step">5</span><h2>{tr('E se cambiassimo qualcosa?', 'What if we changed something?')}</h2></div><small>{tr('Quattro simulazioni immediate senza perdere lo scenario corrente.', 'Four instant simulations without losing the current scenario.')}</small></div>
        <div className="whatif-grid">{whatIfs.map(w => <WhatIfCard key={w.id} item={w} currentMonthly={onPrem.monthlyEur} onApply={() => setInput(w.nextInput)} tr={tr} />)}</div>
      </section>

      <section className="panel" id="technical">
        <div className="section-title"><div><span className="step">6</span><h2>{tr('Dettaglio tecnico', 'Technical detail')}</h2></div><small>{tr('Apri solo ciò che ti serve.', 'Open only what you need.')}</small></div>
        <div className="fit-summary compact-fit-summary"><span className="fit-impossible">{tr('Impossibili', 'Impossible')} {counts.impossible || 0}</span><span className="fit-strained">{tr('Sotto sforzo', 'Strained')} {counts.strained || 0}</span><span className="fit-recommended">{tr('Consigliati', 'Recommended')} {counts.recommended || 0}</span><span className="fit-top">Top {counts.top || 0}</span></div>

        <details open={viewMode === 'technical'}><summary>{tr('Advisor hardware completo', 'Full hardware advisor')}</summary><div className="advisor-grid">{hardwareAssessments.map(a => <article className={`advisor-card status-${a.status} ${effectiveServerId === a.serverProfileId ? 'advisor-selected' : ''}`} key={a.serverProfileId}>
          <div className="advisor-card-head"><div><FitBadge status={a.status} label={fitLabel(a.status)} /><h3>{a.serverName}</h3></div><strong>{euro.format(a.estimatedCapexEur)}</strong></div>
          <div className="advisor-metrics"><span><small>{tr('Nodi', 'Nodes')}</small><b>{a.requiredNodes}</b></span><span><small>{tr('Nodi/replica', 'Nodes/replica')}</small><b>{a.nodesPerReplica}</b></span><span><small>{tr('Capacità', 'Capacity')}</small><b>~{a.estimatedConcurrentCapacity}</b></span><span><small>VRAM</small><b>{pct.format(a.memoryUtilizationPct)}%</b></span><span><small>{tr('Potenza', 'Power')}</small><b>{number.format(a.peakKw)} kW</b></span><span><small>{tr('Margine', 'Headroom')}</small><b>{pct.format(a.capacityHeadroomPct)}%</b></span></div>
          <div className="advisor-reasons">{a.reasons.slice(0, 3).map((reason, i) => <p key={i}>{reason}</p>)}</div>
          <button disabled={a.status === 'impossible'} className={effectiveServerId === a.serverProfileId ? 'primary' : ''} onClick={() => useHardware(a.serverProfileId)}>{effectiveServerId === a.serverProfileId ? tr('Selezionato', 'Selected') : tr('Usa hardware', 'Use hardware')}</button>
        </article>)}</div></details>

        <details><summary>{tr('Costi on-prem configurabili', 'Configurable on-prem costs')}</summary><div className="grid inputs technical-inputs">
          <label>{t('electricity')}<input type="number" min="0" step="0.01" value={input.electricityEurPerKwh} onChange={e => setField('electricityEurPerKwh', +e.target.value)} /></label>
          <label>{t('pue')}<input type="number" min="1" step="0.05" value={input.pue} onChange={e => setField('pue', +e.target.value)} /></label>
          <label>{t('coolingFixed')}<input type="number" min="0" step="1000" value={input.coolingAnnualEur} onChange={e => setField('coolingAnnualEur', +e.target.value)} /></label>
          <label>{t('serverPriceOverride')}<input type="number" min="0" step="1000" value={input.inferenceServerPriceOverrideEur} onChange={e => setField('inferenceServerPriceOverrideEur', +e.target.value)} /></label>
          <label>{t('proxyPrice')}<input type="number" min="0" step="500" value={input.proxyServerPriceEur} onChange={e => setField('proxyServerPriceEur', +e.target.value)} /></label>
          <label>{t('amortization')}<input type="number" min="1" max="10" value={input.hardwareAmortizationYears} onChange={e => setField('hardwareAmortizationYears', +e.target.value)} /></label>
          <label>{t('maintenance')}<input type="number" min="0" max="50" value={input.maintenancePercent} onChange={e => setField('maintenancePercent', +e.target.value)} /></label>
          <label>{t('fitout')}<input type="number" min="0" step="5000" value={input.onPremFitoutEur} onChange={e => setField('onPremFitoutEur', +e.target.value)} /></label>
        </div></details>

        <details><summary>{tr('Catalogo modelli e server', 'Model and server catalog')}</summary><div className="table-wrap"><table><thead><tr><th>{tr('Modello', 'Model')}</th><th>{tr('Parametri', 'Parameters')}</th><th>Context</th><th>Coding</th><th>General</th><th>Thinking</th></tr></thead><tbody>{(catalog.models as any[]).map(m => <tr key={m.id}><td><strong>{m.name}</strong><small>{m.vendor} · {m.license}</small></td><td>{m.parametersTotalB}B<small>{m.parametersActiveB}B active</small></td><td>{Math.round(m.maxExtendedContextTokens / 1000)}K</td><td>{m.benchmarks.coding}</td><td>{m.benchmarks.general}</td><td>{m.benchmarks.thinking}</td></tr>)}</tbody></table></div></details>
      </section>

      <section className="panel saved-panel"><div className="section-title"><div><h2>{tr('Scenari salvati', 'Saved scenarios')}</h2></div><small>{saved.length}/30</small></div>{saved.length === 0 ? <p className="muted">{tr('Nessuno scenario salvato.', 'No saved scenarios.')}</p> : <div className="saved-list">{saved.map(s => <button key={s.id} onClick={() => restore(s)}><strong>{new Date(s.createdAt).toLocaleString()}</strong><span>{(catalog.models as any[]).find(m => m.id === s.input.modelId)?.name} · {s.input.concurrentUsers} concurrent · {s.input.strategy}</span></button>)}</div>}</section>

      <footer><span>{catalog.meta.benchmarkMethod}</span><span>{tr('Prima dell’acquisto: benchmark reale e RFQ del fornitore.', 'Before procurement: benchmark the real runtime and request supplier RFQs.')}</span></footer>
    </main>

    <div className="mobile-actionbar"><button onClick={saveScenario}>{tr('Salva', 'Save')}</button><a href="#decision">{tr('Scelta', 'Decision')}</a><button className="primary" onClick={exportPdf}>PDF</button></div>
  </div>;
}
