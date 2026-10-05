import React, { useEffect, useMemo, useState } from 'react';
import modelsJson from '../data/models-expanded.json';
import { assessHardware, calculate, CalculatorInput, DEFAULT_INPUT } from './calculator';
import { recommendModels } from './strategy';
import { getCloudOffers } from './marketplace';
import './modelComparison.css';

type Model = (typeof modelsJson)[number];
type ComparisonRow = {
  model: Model;
  input: CalculatorInput;
  fitScore: number;
  valueScore: number;
  qualityScore: number;
  compatible: boolean;
  onPrem: ReturnType<typeof calculate>[number];
  rental: ReturnType<typeof calculate>[number];
  assessment?: ReturnType<typeof assessHardware>[number];
  bestCloud?: ReturnType<typeof getCloudOffers>[number];
};

const models = modelsJson as Model[];
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const COMPARE_KEY = 'ai-calculator-compare-models';
const LIVE_INPUT_KEY = 'ai-calculator-live-input';

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function valueScore(model: Model) {
  const b = model.benchmarks;
  const quality = ((b.coding || 0) + (b.general || 0) + (b.thinking || 0)) / 3;
  const active = Math.max(0.5, model.parametersActiveB || model.parametersTotalB);
  const total = Math.max(0.5, model.parametersTotalB);
  const efficiency = clamp(112 - Math.log10(active) * 24 - Math.log10(total) * 6);
  return clamp(quality * 0.78 + efficiency * 0.22);
}

function qualityScore(model: Model) {
  const b = model.benchmarks;
  return ((b.coding || 0) + (b.general || 0) + (b.thinking || 0)) / 3;
}

function contextLabel(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

function paramsLabel(model: Model) {
  const active = model.parametersActiveB || model.parametersTotalB;
  return active < model.parametersTotalB ? `${model.parametersTotalB}B / ${active}B attivi` : `${model.parametersTotalB}B`;
}

function readValue(nodes: Element[], index: number) {
  const field = nodes[index]?.querySelector('input,select') as HTMLInputElement | HTMLSelectElement | null;
  return field?.value;
}

function readLiveInput(): CalculatorInput {
  let base: CalculatorInput = { ...DEFAULT_INPUT };
  try {
    const saved = JSON.parse(localStorage.getItem(LIVE_INPUT_KEY) || '{}');
    base = { ...base, ...saved };
  } catch { /* ignore malformed local state */ }

  const company = Array.from(document.querySelectorAll('#company .business-inputs label'));
  if (company.length >= 12) {
    base = {
      ...base,
      businessProfile: (readValue(company, 0) || base.businessProfile) as CalculatorInput['businessProfile'],
      dataSensitivity: (readValue(company, 1) || base.dataSensitivity) as CalculatorInput['dataSensitivity'],
      regionPreference: (readValue(company, 2) || base.regionPreference) as CalculatorInput['regionPreference'],
      averageUsers: Number(readValue(company, 3)) || base.averageUsers,
      concurrentUsers: Number(readValue(company, 4)) || base.concurrentUsers,
      averageContextTokens: Number(readValue(company, 5)) || base.averageContextTokens,
      maxContextTokens: Number(readValue(company, 6)) || base.maxContextTokens,
      averageOutputTokens: Number(readValue(company, 7)) || base.averageOutputTokens,
      availabilityMode: (readValue(company, 8) || base.availabilityMode) as CalculatorInput['availabilityMode'],
      currentAnnualAiSpendEur: Number(readValue(company, 9)) || 0,
      annualGrowthPct: Number(readValue(company, 10)) || 0,
      planningHorizonYears: Number(readValue(company, 11)) || base.planningHorizonYears
    };
  }

  const technical = Array.from(document.querySelectorAll('#technical .technical-inputs label'));
  if (technical.length >= 8) {
    base = {
      ...base,
      gpuUtilizationPct: Number(readValue(technical, 0)) || base.gpuUtilizationPct,
      cloudAllocatedUptimePct: Number(readValue(technical, 1)) || base.cloudAllocatedUptimePct,
      electricityEurPerKwh: Number(readValue(technical, 2)) || 0,
      pue: Number(readValue(technical, 3)) || base.pue,
      coolingAnnualEur: Number(readValue(technical, 4)) || 0,
      maintenancePercent: Number(readValue(technical, 5)) || 0,
      hardwareAmortizationYears: Number(readValue(technical, 6)) || base.hardwareAmortizationYears,
      onPremFitoutEur: Number(readValue(technical, 7)) || 0
    };
  }

  // The second technical-inputs block contains audit/control-plane assumptions.
  const blocks = Array.from(document.querySelectorAll('#technical .technical-inputs'));
  const auditLabels = blocks[1] ? Array.from(blocks[1].querySelectorAll('label')) : [];
  if (auditLabels.length >= 4) {
    base = {
      ...base,
      auditRetentionDays: Number(readValue(auditLabels, 0)) || base.auditRetentionDays,
      requestsPerUserPerDay: Number(readValue(auditLabels, 1)) || base.requestsPerUserPerDay,
      avgAuditPayloadKb: Number(readValue(auditLabels, 2)) || base.avgAuditPayloadKb,
      proxyServerPriceEur: Number(readValue(auditLabels, 3)) || base.proxyServerPriceEur
    };
  }

  return base;
}

function initialIds() {
  try {
    const persisted = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
    if (Array.isArray(persisted)) {
      const valid = persisted.filter((id: unknown) => typeof id === 'string' && models.some(m => m.id === id));
      if (valid.length >= 2) return valid.slice(0, 4);
    }
  } catch { /* ignore */ }

  const current = new URLSearchParams(window.location.search).get('model') || localStorage.getItem('ai-calculator-model') || DEFAULT_INPUT.modelId;
  const compatible = models.filter(m => m.maxExtendedContextTokens >= DEFAULT_INPUT.maxContextTokens);
  const compact = (compatible.filter(m => m.parametersTotalB <= 40).length ? compatible.filter(m => m.parametersTotalB <= 40) : models.filter(m => m.parametersTotalB <= 40))
    .slice().sort((a, b) => valueScore(b) - valueScore(a))[0];
  const medium = (compatible.filter(m => m.parametersTotalB > 40 && m.parametersTotalB <= 150).length ? compatible.filter(m => m.parametersTotalB > 40 && m.parametersTotalB <= 150) : models.filter(m => m.parametersTotalB > 40 && m.parametersTotalB <= 150))
    .slice().sort((a, b) => valueScore(b) - valueScore(a))[0];
  const quality = (compatible.length ? compatible : models).slice().sort((a, b) => qualityScore(b) - qualityScore(a))[0];
  return Array.from(new Set([current, compact?.id, medium?.id, quality?.id].filter(Boolean) as string[])).slice(0, 4);
}

function fitText(status?: string) {
  if (status === 'top') return 'TOP';
  if (status === 'recommended') return 'CONSIGLIATO';
  if (status === 'strained') return 'SOTTO SFORZO';
  return 'IMPOSSIBILE';
}

export default function ModelComparisonOverlay() {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>(initialIds);
  const [refreshKey, setRefreshKey] = useState(0);
  const theme = localStorage.getItem('ai-calculator-theme') || 'dark';

  useEffect(() => {
    const onOpen = () => { setRefreshKey(v => v + 1); setOpen(true); };
    const onChanged = () => {
      try {
        const next = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
        if (Array.isArray(next)) setIds(next.filter((id: string) => models.some(m => m.id === id)).slice(0, 4));
      } catch { /* ignore */ }
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('ai-calculator-open-comparison', onOpen as EventListener);
    window.addEventListener('ai-calculator-compare-changed', onChanged as EventListener);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('ai-calculator-open-comparison', onOpen as EventListener);
      window.removeEventListener('ai-calculator-compare-changed', onChanged as EventListener);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
  }, [ids]);

  const liveInput = useMemo(() => readLiveInput(), [open, refreshKey]);

  const rows = useMemo<ComparisonRow[]>(() => ids.map(id => {
    const model = models.find(m => m.id === id)!;
    const candidateInput: CalculatorInput = { ...liveInput, modelId: id, serverProfileId: 'auto' };
    const results = calculate(candidateInput);
    const onPrem = results.find(r => r.id === 'onprem') || results[0];
    const rental = results.find(r => r.id === 'rental') || results[2] || results[0];
    const fit = recommendModels(candidateInput).find(r => r.modelId === id);
    const assessment = assessHardware(candidateInput).find(a => a.serverProfileId === onPrem.serverProfileId);
    const offers = assessment ? getCloudOffers(candidateInput, assessment) : [];
    const exactRegional = offers.filter(o => o.compatibility === 'exact' && o.regionCompatible);
    const exact = offers.filter(o => o.compatibility === 'exact');
    const bestCloud = (exactRegional.length ? exactRegional : exact.length ? exact : offers).slice().sort((a, b) => a.monthlyTotalEur - b.monthlyTotalEur)[0];
    return {
      model,
      input: candidateInput,
      fitScore: fit?.score || 0,
      valueScore: valueScore(model),
      qualityScore: qualityScore(model),
      compatible: candidateInput.maxContextTokens <= model.maxExtendedContextTokens,
      onPrem,
      rental,
      assessment,
      bestCloud
    };
  }), [ids, liveInput]);

  const awards = useMemo(() => {
    const valid = rows.filter(r => r.compatible);
    if (!valid.length) return {} as Record<string, string[]>;
    const awardMap: Record<string, string[]> = {};
    const add = (id: string, label: string) => { awardMap[id] = [...(awardMap[id] || []), label]; };
    add(valid.slice().sort((a, b) => b.fitScore - a.fitScore)[0].model.id, 'Miglior fit');
    add(valid.slice().sort((a, b) => b.valueScore - a.valueScore)[0].model.id, 'Miglior valore');
    add(valid.slice().sort((a, b) => a.onPrem.fourYearTcoEur - b.onPrem.fourYearTcoEur)[0].model.id, 'TCO più basso');
    add(valid.slice().sort((a, b) => a.model.parametersTotalB - b.model.parametersTotalB)[0].model.id, 'Più compatto');
    add(valid.slice().sort((a, b) => a.onPrem.estimatedAverageKw - b.onPrem.estimatedAverageKw)[0].model.id, 'Meno energia');
    return awardMap;
  }, [rows]);

  const cheapestTco = useMemo(() => {
    const valid = rows.filter(r => r.compatible);
    return valid.length ? Math.min(...valid.map(r => r.onPrem.fourYearTcoEur)) : 0;
  }, [rows]);

  const replaceId = (index: number, id: string) => {
    if (ids.includes(id) && ids[index] !== id) return;
    setIds(prev => prev.map((value, i) => i === index ? id : value));
  };

  const removeId = (index: number) => setIds(prev => prev.filter((_, i) => i !== index));

  const addSlot = () => {
    const candidate = models.slice().sort((a, b) => valueScore(b) - valueScore(a)).find(m => !ids.includes(m.id));
    if (candidate && ids.length < 4) setIds(prev => [...prev, candidate.id]);
  };

  const useModel = (row: ComparisonRow) => {
    const persisted = { ...readLiveInput(), modelId: row.model.id, serverProfileId: 'auto' };
    localStorage.setItem(LIVE_INPUT_KEY, JSON.stringify(persisted));
    localStorage.setItem('ai-calculator-model', row.model.id);
    const url = new URL(window.location.href);
    url.searchParams.set('model', row.model.id);
    window.location.assign(url.toString());
  };

  const groupedVendors = useMemo(() => Array.from(new Set(models.map(m => m.vendor))).sort(), []);

  return <div className={`model-compare-root ${theme === 'light' ? 'comparison-light' : ''}`}>
    <button className="model-compare-fab" onClick={() => { setRefreshKey(v => v + 1); setOpen(true); }}>
      <span>⇄</span><b>Confronta modelli</b><em>{ids.length}</em>
    </button>

    {open && <div className="model-compare-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="model-compare-modal" onMouseDown={e => e.stopPropagation()}>
        <header className="compare-header">
          <div><span className="compare-eyebrow">MODEL × HARDWARE × COST</span><h2>Confronto modelli</h2><p>Stesso workload, modelli diversi: qualità, dimensione, hardware, energia, cloud e TCO nello stesso confronto.</p></div>
          <div className="compare-header-actions"><button onClick={() => setRefreshKey(v => v + 1)}>↻ Aggiorna dagli input</button><button className="compare-close" onClick={() => setOpen(false)}>×</button></div>
        </header>

        <div className="compare-workload-strip">
          <span><small>UTENTI</small><b>{liveInput.averageUsers}</b></span>
          <span><small>CONCURRENT</small><b>{liveInput.concurrentUsers}</b></span>
          <span><small>CONTEXT AVG / MAX</small><b>{contextLabel(liveInput.averageContextTokens)} / {contextLabel(liveInput.maxContextTokens)}</b></span>
          <span><small>OUTPUT</small><b>{liveInput.averageOutputTokens.toLocaleString('it-IT')} tok</b></span>
          <span><small>RESILIENZA</small><b>{liveInput.availabilityMode.toUpperCase()}</b></span>
        </div>

        <div className="compare-selectors">
          {ids.map((id, index) => <div className="compare-selector" key={`${index}-${id}`}>
            <span>MODELLO {index + 1}</span>
            <select value={id} onChange={e => replaceId(index, e.target.value)}>
              {groupedVendors.map(vendor => <optgroup label={vendor} key={vendor}>{models.filter(m => m.vendor === vendor).map(model => <option key={model.id} value={model.id}>{model.name} · {paramsLabel(model)}</option>)}</optgroup>)}
            </select>
            {ids.length > 2 && <button onClick={() => removeId(index)} aria-label="Remove comparison model">−</button>}
          </div>)}
          {ids.length < 4 && <button className="compare-add" onClick={addSlot}>+ Aggiungi modello</button>}
        </div>

        <div className="compare-cards">
          {rows.map(row => {
            const delta = row.compatible && cheapestTco ? row.onPrem.fourYearTcoEur - cheapestTco : 0;
            const active = row.model.parametersActiveB || row.model.parametersTotalB;
            return <article className={`compare-card ${!row.compatible ? 'compare-incompatible' : ''}`} key={row.model.id}>
              <div className="compare-card-top">
                <div><span>{row.model.vendor} · {row.model.family}</span><h3>{row.model.name}</h3></div>
                <div className="compare-fit"><small>FIT</small><b>{Math.round(row.fitScore)}</b></div>
              </div>
              <div className="compare-awards">{!row.compatible ? <span className="award bad">CONTEXT INCOMPATIBILE</span> : (awards[row.model.id] || []).map(label => <span className="award" key={label}>{label}</span>)}</div>
              <div className="compare-scoreline"><span>Coding <b>{row.model.benchmarks.coding}</b></span><span>General <b>{row.model.benchmarks.general}</b></span><span>Thinking <b>{row.model.benchmarks.thinking}</b></span><span>Value <b>{Math.round(row.valueScore)}</b></span></div>
              <div className="compare-spec-grid">
                <span><small>PARAMETRI</small><b>{paramsLabel(row.model)}</b></span>
                <span><small>ARCHITETTURA</small><b>{String(row.model.architecture).toUpperCase()}</b></span>
                <span><small>CONTEXT MAX</small><b>{contextLabel(row.model.maxExtendedContextTokens)}</b></span>
                <span><small>ACTIVE / TOTAL</small><b>{Math.round(active / row.model.parametersTotalB * 100)}%</b></span>
              </div>
              <div className="compare-divider" />
              <div className="compare-hardware">
                <div><small>HARDWARE AUTO</small><strong>{row.compatible ? `${row.onPrem.inferenceNodes} × ${row.onPrem.serverName}` : 'Non valido per il context richiesto'}</strong></div>
                <span className={`hardware-state state-${row.onPrem.hardwareFit}`}>{fitText(row.onPrem.hardwareFit)}</span>
              </div>
              <div className="compare-infra-grid">
                <span><small>GPU</small><b>{row.compatible ? row.onPrem.totalGpuCount : '—'}</b></span>
                <span><small>CAPACITÀ</small><b>{row.compatible ? `~${row.onPrem.estimatedConcurrentCapacity}` : '—'}</b></span>
                <span><small>N-1</small><b>{row.compatible ? (row.onPrem.n1Pass ? `PASS ~${row.onPrem.n1ConcurrentCapacity}` : 'FAIL') : '—'}</b></span>
                <span><small>AVG / PEAK</small><b>{row.compatible ? `${number.format(row.onPrem.estimatedAverageKw)} / ${number.format(row.onPrem.estimatedItKw)} kW` : '—'}</b></span>
              </div>
              <div className="compare-cost-grid">
                <span><small>CAPEX ON-PREM</small><b>{row.compatible ? euro.format(row.onPrem.capexEur) : '—'}</b></span>
                <span><small>ON-PREM / MESE</small><b>{row.compatible ? euro.format(row.onPrem.monthlyEur) : '—'}</b></span>
                <span className="tco-cell"><small>TCO 4 ANNI</small><b>{row.compatible ? euro.format(row.onPrem.fourYearTcoEur) : '—'}</b>{row.compatible && delta > 0 && <em>+{euro.format(delta)} vs migliore</em>}</span>
                <span><small>CLOUD MIGLIORE</small><b>{row.compatible ? (row.bestCloud ? `${euro.format(row.bestCloud.monthlyTotalEur)}/m` : `${euro.format(row.rental.monthlyEur)}/m`) : '—'}</b>{row.compatible && row.bestCloud && <em>{row.bestCloud.provider}</em>}</span>
              </div>
              <button className="compare-use" disabled={!row.compatible} onClick={() => useModel(row)}>{row.compatible ? 'Usa questo modello nel calcolatore' : `Richiede max ≤ ${contextLabel(row.model.maxExtendedContextTokens)}`}</button>
            </article>;
          })}
        </div>

        {rows.length >= 2 && <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>Metrica</th>{rows.map(r => <th key={r.model.id}>{r.model.name}</th>)}</tr></thead><tbody>
          <tr><td>Fit aziendale</td>{rows.map(r => <td key={r.model.id}>{Math.round(r.fitScore)}/100</td>)}</tr>
          <tr><td>Value score</td>{rows.map(r => <td key={r.model.id}>{Math.round(r.valueScore)}/100</td>)}</tr>
          <tr><td>Parametri totali / attivi</td>{rows.map(r => <td key={r.model.id}>{paramsLabel(r.model)}</td>)}</tr>
          <tr><td>Hardware</td>{rows.map(r => <td key={r.model.id}>{r.compatible ? `${r.onPrem.inferenceNodes} × ${r.onPrem.serverName}` : 'Context incompatibile'}</td>)}</tr>
          <tr><td>GPU totali</td>{rows.map(r => <td key={r.model.id}>{r.compatible ? r.onPrem.totalGpuCount : '—'}</td>)}</tr>
          <tr><td>Capacità stimata</td>{rows.map(r => <td key={r.model.id}>{r.compatible ? `~${r.onPrem.estimatedConcurrentCapacity}` : '—'}</td>)}</tr>
          <tr><td>Potenza media</td>{rows.map(r => <td key={r.model.id}>{r.compatible ? `${number.format(r.onPrem.estimatedAverageKw)} kW` : '—'}</td>)}</tr>
          <tr><td>CAPEX on-prem</td>{rows.map(r => <td key={r.model.id}>{r.compatible ? euro.format(r.onPrem.capexEur) : '—'}</td>)}</tr>
          <tr><td>TCO 4 anni</td>{rows.map(r => <td key={r.model.id}><b>{r.compatible ? euro.format(r.onPrem.fourYearTcoEur) : '—'}</b></td>)}</tr>
          <tr><td>Cloud pubblico migliore</td>{rows.map(r => <td key={r.model.id}>{r.compatible ? (r.bestCloud ? `${r.bestCloud.provider} · ${euro.format(r.bestCloud.monthlyTotalEur)}/m` : `${euro.format(r.rental.monthlyEur)}/m`) : '—'}</td>)}</tr>
        </tbody></table></div>}

        <footer className="compare-footer">I capability score sono indici di planning. Hardware, capacità e costi usano lo stesso workload corrente per rendere il confronto coerente. Prima del procurement: benchmark reale sul runtime scelto e RFQ.</footer>
      </section>
    </div>}
  </div>;
}
