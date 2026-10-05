import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import catalog from '../data/catalog.json';
import { calculate, CalculatorInput, DEFAULT_INPUT, ScenarioResult, Strategy } from './calculator';
import './styles.css';

type SavedScenario = { id: string; createdAt: string; input: CalculatorInput; results: ScenarioResult[] };

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

function loadSaved(): SavedScenario[] {
  try { return JSON.parse(localStorage.getItem('ai-calculator-scenarios') || '[]'); } catch { return []; }
}

function BenchmarkBar({ label, value }: { label: string; value: number }) {
  return <div className="benchmark-row"><span>{label}</span><div className="benchmark-track"><div className="benchmark-fill" style={{ width: `${value}%` }} /></div><strong>{value}</strong></div>;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(localStorage.getItem('ai-calculator-theme') || 'dark');
  const [saved, setSaved] = useState<SavedScenario[]>(loadSaved);
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_INPUT);

  const results = useMemo(() => calculate(input), [input]);
  const selectedModel = (catalog.models as any[]).find(m => m.id === input.modelId);
  const inferenceServers = (catalog.serverProfiles as any[]).filter(s => s.role === 'inference');
  const effectiveServerId = results[0]?.serverProfileId;
  const effectiveServer = inferenceServers.find(s => s.id === effectiveServerId);

  const setField = (field: keyof CalculatorInput, value: string | number) => setInput(prev => ({ ...prev, [field]: value }));

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('ai-calculator-theme', next);
  };

  const toggleLanguage = () => {
    const next = i18n.language.startsWith('it') ? 'en' : 'it';
    i18n.changeLanguage(next);
    localStorage.setItem('ai-calculator-language', next);
  };

  const saveScenario = () => {
    const entry: SavedScenario = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), input, results };
    const next = [entry, ...saved].slice(0, 30);
    setSaved(next);
    localStorage.setItem('ai-calculator-scenarios', JSON.stringify(next));
  };

  const restore = (entry: SavedScenario) => setInput({ ...DEFAULT_INPUT, ...entry.input });

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('AI Infrastructure Calculator', 14, 18);
    doc.setFontSize(10);
    let y = 30;
    const headerLines = [
      `Model: ${selectedModel?.name}`,
      `Benchmarks: coding ${selectedModel?.benchmarks?.coding}/100 | general ${selectedModel?.benchmarks?.general}/100 | thinking ${selectedModel?.benchmarks?.thinking}/100`,
      `Users: ${input.averageUsers} | Concurrent: ${input.concurrentUsers}`,
      `Average context: ${input.averageContextTokens.toLocaleString()} | Max context: ${input.maxContextTokens.toLocaleString()}`,
      `Sizing profile: ${input.strategy}`,
      `Hardware: ${effectiveServer?.name || results[0]?.serverName}`,
      `Electricity: ${input.electricityEurPerKwh.toFixed(3)} EUR/kWh | PUE: ${input.pue.toFixed(2)} | Fixed cooling: ${euro.format(input.coolingAnnualEur)}/year`
    ];
    headerLines.forEach(line => { doc.text(line, 14, y); y += 6; });
    y += 4;
    results.forEach(r => {
      if (y > 235) { doc.addPage(); y = 20; }
      doc.setFontSize(12); doc.text(r.id.toUpperCase(), 14, y); y += 6;
      doc.setFontSize(10);
      [
        `Inference: ${r.inferenceNodes} x ${r.serverName} (${r.totalGpuCount} GPUs, ${r.totalVramGb.toLocaleString()} GB VRAM)`,
        `LLMProxy servers: ${r.proxyServers}`,
        `Estimated concurrent capacity: ${r.estimatedConcurrentCapacity}`,
        `Peak IT load: ${r.estimatedItKw.toFixed(1)} kW`,
        `CAPEX: ${euro.format(r.capexEur)}`,
        `Monthly planning cost: ${euro.format(r.monthlyEur)}`,
        `Annual planning cost: ${euro.format(r.annualEur)}`,
        `4-year TCO: ${euro.format(r.fourYearTcoEur)}`,
        `Annual electricity: ${euro.format(r.annualElectricityEur)} | cooling: ${euro.format(r.annualCoolingEur)} | maintenance: ${euro.format(r.annualMaintenanceEur)}`
      ].forEach(line => { doc.text(line, 18, y); y += 5; });
      r.warnings.forEach(w => { const wrapped = doc.splitTextToSize(`Warning: ${w}`, 170); doc.text(wrapped, 18, y); y += wrapped.length * 5; });
      y += 5;
    });
    doc.save(`ai-calculator-${Date.now()}.pdf`);
  };

  const exportExcel = () => {
    const summary = results.map(r => ({
      Scenario: r.id, Model: selectedModel?.name, CodingIndex: selectedModel?.benchmarks?.coding, GeneralIndex: selectedModel?.benchmarks?.general,
      ThinkingIndex: selectedModel?.benchmarks?.thinking, AverageUsers: input.averageUsers, ConcurrentUsers: input.concurrentUsers,
      AverageContext: input.averageContextTokens, MaxContext: input.maxContextTokens, Strategy: input.strategy, Hardware: r.serverName,
      ServerUnitPriceEUR: Math.round(r.serverUnitPriceEur), ProxyServers: r.proxyServers, InferenceNodes: r.inferenceNodes,
      NodesPerReplica: r.nodesPerReplica, GPUs: r.totalGpuCount, VRAM_GB: r.totalVramGb, EstimatedConcurrentCapacity: r.estimatedConcurrentCapacity,
      PeakIT_kW: Number(r.estimatedItKw.toFixed(2)), CapexEUR: Math.round(r.capexEur), MonthlyEUR: Math.round(r.monthlyEur), AnnualEUR: Math.round(r.annualEur),
      FourYearTCO_EUR: Math.round(r.fourYearTcoEur), AnnualElectricityEUR: Math.round(r.annualElectricityEur), AnnualCoolingEUR: Math.round(r.annualCoolingEur),
      AnnualMaintenanceEUR: Math.round(r.annualMaintenanceEur)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Scenarios');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((catalog.models as any[]).map(m => ({
      Name: m.name, Vendor: m.vendor, License: m.license, TotalParamsB: m.parametersTotalB, ActiveParamsB: m.parametersActiveB,
      NativeContext: m.nativeContextTokens, MaxContext: m.maxExtendedContextTokens, CodingIndex: m.benchmarks.coding,
      GeneralIndex: m.benchmarks.general, ThinkingIndex: m.benchmarks.thinking, MinimumHardwareTier: m.minHardwareTier
    }))), 'Models');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inferenceServers.map(s => ({
      Name: s.name, Tier: s.hardwareTier, GPUs: s.gpuCount, VRAM_GB: s.totalVramGb, RAM_GB: s.ramGb, PeakWatts: s.peakWatts,
      NetworkGbps: s.networkGbps, PurchaseEUR: s.estimatedPurchaseEur, Cooling: s.cooling, PriceAsOf: s.priceAsOf, SourceClass: s.sourceClass
    }))), 'Hardware');
    XLSX.writeFile(wb, `ai-calculator-${Date.now()}.xlsx`);
  };

  return <div className={theme}>
    <main className="shell">
      <header className="topbar">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /><div><h1>{t('title')}</h1><p>{t('subtitle')}</p></div></div>
        <div className="toolbar"><span className="data-date">{t('dataUpdated')}: {catalog.meta.lastUpdated}</span><button onClick={toggleLanguage}>{i18n.language.startsWith('it') ? 'EN' : 'IT'}</button><button onClick={toggleTheme}>{theme === 'dark' ? t('light') : t('dark')}</button></div>
      </header>

      <section className="panel">
        <div className="section-title"><div><span className="step">1</span><h2>{t('workload')}</h2></div><small>{t('workloadHint')}</small></div>
        <div className="grid inputs">
          <label>{t('model')}<select value={input.modelId} onChange={e => setField('modelId', e.target.value)}>{(catalog.models as any[]).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>{t('users')}<input type="number" min="1" value={input.averageUsers} onChange={e => setField('averageUsers', +e.target.value)} /></label>
          <label>{t('concurrent')}<input type="number" min="1" value={input.concurrentUsers} onChange={e => setField('concurrentUsers', +e.target.value)} /></label>
          <label>{t('avgContext')}<input type="number" min="1024" step="1000" value={input.averageContextTokens} onChange={e => setField('averageContextTokens', +e.target.value)} /></label>
          <label>{t('maxContext')}<input type="number" min="1024" step="1000" value={input.maxContextTokens} onChange={e => setField('maxContextTokens', +e.target.value)} /></label>
          <label>{t('outputTokens')}<input type="number" min="1" step="500" value={input.averageOutputTokens} onChange={e => setField('averageOutputTokens', +e.target.value)} /></label>
          <label>{t('strategy')}<select value={input.strategy} onChange={e => setField('strategy', e.target.value as Strategy)}><option value="conservative">{t('conservative')}</option><option value="balanced">{t('balanced')}</option><option value="performance">{t('performance')}</option></select></label>
        </div>
        <div className="model-detail-grid">
          <div className="model-card"><div className="eyebrow">{selectedModel?.vendor} · {selectedModel?.license}</div><strong>{selectedModel?.name}</strong><span>{selectedModel?.parametersTotalB}B / {selectedModel?.parametersActiveB}B active · {(selectedModel?.nativeContextTokens || 0).toLocaleString()} native context</span><small>{selectedModel?.notes}</small></div>
          <div className="benchmark-card"><div className="eyebrow">{t('benchmarkTitle')}</div><BenchmarkBar label={t('coding')} value={selectedModel?.benchmarks?.coding || 0} /><BenchmarkBar label={t('general')} value={selectedModel?.benchmarks?.general || 0} /><BenchmarkBar label={t('thinking')} value={selectedModel?.benchmarks?.thinking || 0} /><small>{t('benchmarkDisclaimer')}</small></div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title"><div><span className="step">2</span><h2>{t('hardwareAndCosts')}</h2></div><small>{t('hardwareHint')}</small></div>
        <div className="grid inputs">
          <label>{t('hardware')}<select value={input.serverProfileId} onChange={e => setField('serverProfileId', e.target.value)}><option value="auto">{t('autoHardware')}</option>{inferenceServers.map(s => <option key={s.id} value={s.id}>{s.name} · {euro.format(s.estimatedPurchaseEur)}</option>)}</select></label>
          <label>{t('electricity')}<input type="number" min="0" step="0.01" value={input.electricityEurPerKwh} onChange={e => setField('electricityEurPerKwh', +e.target.value)} /></label>
          <label>{t('pue')}<input type="number" min="1" step="0.05" value={input.pue} onChange={e => setField('pue', +e.target.value)} /></label>
          <label>{t('coolingFixed')}<input type="number" min="0" step="1000" value={input.coolingAnnualEur} onChange={e => setField('coolingAnnualEur', +e.target.value)} /></label>
          <label>{t('serverPriceOverride')}<input type="number" min="0" step="1000" value={input.inferenceServerPriceOverrideEur} onChange={e => setField('inferenceServerPriceOverrideEur', +e.target.value)} /></label>
          <label>{t('proxyPrice')}<input type="number" min="0" step="500" value={input.proxyServerPriceEur} onChange={e => setField('proxyServerPriceEur', +e.target.value)} /></label>
          <label>{t('amortization')}<input type="number" min="1" max="10" step="1" value={input.hardwareAmortizationYears} onChange={e => setField('hardwareAmortizationYears', +e.target.value)} /></label>
          <label>{t('maintenance')}<input type="number" min="0" max="50" step="1" value={input.maintenancePercent} onChange={e => setField('maintenancePercent', +e.target.value)} /></label>
          <label>{t('fitout')}<input type="number" min="0" step="5000" value={input.onPremFitoutEur} onChange={e => setField('onPremFitoutEur', +e.target.value)} /></label>
        </div>
        {effectiveServer && <div className="hardware-highlight"><div><span className="pill">{input.serverProfileId === 'auto' ? t('autoSelected') : t('selected')}</span><h3>{effectiveServer.name}</h3><p>{effectiveServer.gpuCount} GPU · {effectiveServer.totalVramGb.toLocaleString()} GB VRAM · {number.format(effectiveServer.peakWatts / 1000)} kW peak · {effectiveServer.cooling}</p></div><div className="price-block"><strong>{euro.format(input.inferenceServerPriceOverrideEur > 0 ? input.inferenceServerPriceOverrideEur : effectiveServer.estimatedPurchaseEur)}</strong><span>{t('perServer')}</span></div></div>}
      </section>

      <section>
        <div className="section-title standalone"><div><span className="step">3</span><h2>{t('scenarios')}</h2></div><small>{t('scenarioHint')}</small></div>
        <div className="grid cards">{results.map(r => <article className={`card ${r.id === 'onprem' ? 'recommended' : ''}`} key={r.id}>
          <div className="card-head"><h3>{t(r.id)}</h3>{r.id === 'onprem' && <span className="pill">{t('ownership')}</span>}</div>
          <div className="hero">{euro.format(r.monthlyEur)}<small>/ {t('monthly').toLowerCase()}</small></div>
          <dl><div><dt>{t('hardware')}</dt><dd>{r.inferenceNodes} × {r.serverName}</dd></div><div><dt>{t('proxy')}</dt><dd>{r.proxyServers}</dd></div><div><dt>GPU / VRAM</dt><dd>{r.totalGpuCount} / {r.totalVramGb.toLocaleString()} GB</dd></div><div><dt>{t('capacity')}</dt><dd>~{r.estimatedConcurrentCapacity}</dd></div><div><dt>{t('power')}</dt><dd>{r.estimatedItKw.toFixed(1)} kW</dd></div><div><dt>{t('capex')}</dt><dd>{euro.format(r.capexEur)}</dd></div><div><dt>{t('electricityAnnual')}</dt><dd>{euro.format(r.annualElectricityEur)}</dd></div><div><dt>{t('coolingAnnual')}</dt><dd>{euro.format(r.annualCoolingEur)}</dd></div><div><dt>{t('annual')}</dt><dd>{euro.format(r.annualEur)}</dd></div><div className="tco"><dt>{t('fourYearTco')}</dt><dd>{euro.format(r.fourYearTcoEur)}</dd></div></dl>
          {r.warnings.length > 0 && <div className="warning"><strong>{t('warnings')}</strong>{r.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>}
          <details><summary>{t('assumptions')}</summary>{r.notes.map((n, i) => <p key={i}>{n}</p>)}</details>
        </article>)}</div>
      </section>

      <section className="panel catalog-panel">
        <div className="section-title"><div><span className="step">4</span><h2>{t('catalogs')}</h2></div><small>{t('catalogHint')}</small></div>
        <details open><summary>{t('modelCatalog')} ({(catalog.models as any[]).length})</summary><div className="table-wrap"><table><thead><tr><th>{t('model')}</th><th>{t('parameters')}</th><th>{t('context')}</th><th>{t('coding')}</th><th>{t('general')}</th><th>{t('thinking')}</th><th>{t('tier')}</th></tr></thead><tbody>{(catalog.models as any[]).map(m => <tr key={m.id}><td><strong>{m.name}</strong><small>{m.vendor} · {m.license}</small></td><td>{m.parametersTotalB}B <small>{m.parametersActiveB}B active</small></td><td>{Math.round(m.maxExtendedContextTokens / 1000)}K</td><td>{m.benchmarks.coding}</td><td>{m.benchmarks.general}</td><td>{m.benchmarks.thinking}</td><td>{m.minHardwareTier}</td></tr>)}</tbody></table></div></details>
        <details><summary>{t('hardwareCatalog')} ({inferenceServers.length})</summary><div className="table-wrap"><table><thead><tr><th>{t('hardware')}</th><th>GPU</th><th>VRAM</th><th>{t('power')}</th><th>{t('purchase')}</th><th>{t('cooling')}</th></tr></thead><tbody>{inferenceServers.map(s => <tr key={s.id}><td><strong>{s.name}</strong><small>{s.hardwareTier} · {s.sourceClass}</small></td><td>{s.gpuCount}</td><td>{s.totalVramGb.toLocaleString()} GB</td><td>{number.format(s.peakWatts / 1000)} kW</td><td>{euro.format(s.estimatedPurchaseEur)}</td><td>{s.cooling}</td></tr>)}</tbody></table></div></details>
      </section>

      <section className="actions"><button className="primary" onClick={saveScenario}>{t('save')}</button><button onClick={exportPdf}>{t('exportPdf')}</button><button onClick={exportExcel}>{t('exportXlsx')}</button></section>
      <section className="panel"><h2>{t('saved')}</h2>{saved.length === 0 ? <p>—</p> : <div className="saved-list">{saved.map(s => <button key={s.id} onClick={() => restore(s)}><strong>{new Date(s.createdAt).toLocaleString()}</strong><span>{(catalog.models as any[]).find(m => m.id === s.input.modelId)?.name} · {s.input.concurrentUsers} concurrent · {s.input.strategy}</span></button>)}</div>}</section>
      <footer><span>{catalog.meta.benchmarkMethod}</span><span>{t('procurementDisclaimer')}</span></footer>
    </main>
  </div>;
}
