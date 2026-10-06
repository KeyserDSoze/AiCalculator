import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import expandedModels from '../data/models-expanded.json';
import { calculate, DEFAULT_INPUT, type CalculatorInput, type ScenarioResult } from './calculator';
import './concurrencyAdvisor.css';

const LIVE_INPUT_KEY = 'ai-calculator-live-input';
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findControl(matchers: string[]) {
  const wanted = matchers.map(normalize);
  for (const label of Array.from(document.querySelectorAll('label'))) {
    const text = normalize(label.textContent || '');
    if (!wanted.some(matcher => text.includes(matcher))) continue;
    const control = label.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
    if (control) return control;
  }
  return null;
}

function readNumber(matchers: string[], fallback: number) {
  const value = Number(findControl(matchers)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function readString(matchers: string[], fallback: string) {
  return findControl(matchers)?.value || fallback;
}

function selectedModelId() {
  const visibleName = document.querySelector('.selected-model-strip strong')?.textContent?.trim();
  if (visibleName) {
    const visible = (expandedModels as any[]).find(model => model.name === visibleName);
    if (visible) return visible.id;
  }

  const forceSelect = document.querySelector<HTMLSelectElement>('.model-force-controls select');
  if (forceSelect?.value && (expandedModels as any[]).some(model => model.id === forceSelect.value)) return forceSelect.value;

  const query = new URLSearchParams(window.location.search).get('model');
  if (query && (expandedModels as any[]).some(model => model.id === query)) return query;

  const stored = localStorage.getItem('ai-calculator-model');
  if (stored && (expandedModels as any[]).some(model => model.id === stored)) return stored;
  return DEFAULT_INPUT.modelId;
}

function currentInput(): CalculatorInput {
  const input: CalculatorInput = {
    ...DEFAULT_INPUT,
    modelId: selectedModelId(),
    serverProfileId: 'auto',
    businessProfile: readString(['profilo principale', 'primary profile'], DEFAULT_INPUT.businessProfile) as CalculatorInput['businessProfile'],
    dataSensitivity: readString(['sensibilita dati', 'sensibilità dati', 'data sensitivity'], DEFAULT_INPUT.dataSensitivity) as CalculatorInput['dataSensitivity'],
    regionPreference: readString(['regione preferita', 'preferred region'], DEFAULT_INPUT.regionPreference) as CalculatorInput['regionPreference'],
    averageUsers: readNumber(['utenti', 'users'], DEFAULT_INPUT.averageUsers),
    concurrentUsers: Math.max(1, Math.round(readNumber(['contemporanei', 'concurrent'], DEFAULT_INPUT.concurrentUsers))),
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
    maintenancePercent: readNumber(['maintenance %', 'manutenzione annua'], DEFAULT_INPUT.maintenancePercent),
    hardwareAmortizationYears: readNumber(['ammortamento anni', 'amortization years'], DEFAULT_INPUT.hardwareAmortizationYears),
    onPremFitoutEur: readNumber(['fit-out on-prem', 'on-prem fit-out'], DEFAULT_INPUT.onPremFitoutEur),
    auditRetentionDays: readNumber(['retention audit giorni', 'audit retention days'], DEFAULT_INPUT.auditRetentionDays),
    requestsPerUserPerDay: readNumber(['request per utente/giorno', 'requests per user/day'], DEFAULT_INPUT.requestsPerUserPerDay),
    avgAuditPayloadKb: readNumber(['payload audit medio kb', 'average audit payload kb'], DEFAULT_INPUT.avgAuditPayloadKb),
    proxyServerPriceEur: readNumber(['costo server llmproxy', 'llmproxy server cost'], DEFAULT_INPUT.proxyServerPriceEur),
    inferenceServerPriceOverrideEur: DEFAULT_INPUT.inferenceServerPriceOverrideEur,
    strategy: DEFAULT_INPUT.strategy
  };

  try {
    const live = JSON.parse(localStorage.getItem(LIVE_INPUT_KEY) || '{}');
    if (live?.strategy) input.strategy = live.strategy;
    if (Number.isFinite(Number(live?.inferenceServerPriceOverrideEur))) input.inferenceServerPriceOverrideEur = Number(live.inferenceServerPriceOverrideEur);
  } catch {
    // Ignore malformed local state.
  }

  return input;
}

function onPremAt(input: CalculatorInput, concurrency: number) {
  const results = calculate({ ...input, concurrentUsers: concurrency, serverProfileId: 'auto' });
  return results.find(result => result.id === 'onprem') || results[0];
}

function fingerprint(scenario: ScenarioResult) {
  return `${scenario.serverProfileId}|${scenario.inferenceNodes}|${scenario.totalGpuCount}|${scenario.proxyServers}`;
}

type Band = {
  min: number;
  max: number;
  scenario: ScenarioResult;
};

function buildBands(input: CalculatorInput) {
  const current = Math.max(1, Math.round(input.concurrentUsers));
  const bands: Band[] = [];

  for (let concurrency = 1; concurrency <= current; concurrency += 1) {
    const scenario = onPremAt(input, concurrency);
    const last = bands[bands.length - 1];
    if (last && fingerprint(last.scenario) === fingerprint(scenario)) {
      last.max = concurrency;
    } else {
      bands.push({ min: concurrency, max: concurrency, scenario });
    }
  }

  return bands;
}

function findUpgrade(input: CalculatorInput, currentScenario: ScenarioResult) {
  const current = Math.max(1, Math.round(input.concurrentUsers));
  const stopAt = Math.max(current + 25, Math.ceil(current * 1.8));
  const signature = fingerprint(currentScenario);

  for (let concurrency = current + 1; concurrency <= stopAt; concurrency += 1) {
    const scenario = onPremAt(input, concurrency);
    if (fingerprint(scenario) !== signature) return { concurrency, scenario };
  }
  return null;
}

function setReactInputValue(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, String(value));
  else input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyConcurrency(value: number) {
  const control = findControl(['contemporanei', 'concurrent']);
  if (control instanceof HTMLInputElement) setReactInputValue(control, value);

  try {
    const live = JSON.parse(localStorage.getItem(LIVE_INPUT_KEY) || '{}');
    localStorage.setItem(LIVE_INPUT_KEY, JSON.stringify({ ...live, concurrentUsers: value, serverProfileId: 'auto' }));
  } catch {
    localStorage.setItem(LIVE_INPUT_KEY, JSON.stringify({ concurrentUsers: value, serverProfileId: 'auto' }));
  }
}

function rangeLabel(min: number, max: number, it: boolean) {
  if (min === max) return `${max} ${it ? 'contemporanei' : 'concurrent'}`;
  return `${min}–${max} ${it ? 'contemporanei' : 'concurrent'}`;
}

export default function ConcurrencyAdvisor() {
  const { i18n } = useTranslation();
  const it = i18n.language.startsWith('it');
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const section = document.getElementById('decision');
    if (!section) return;

    let slot = document.getElementById('concurrency-advisor-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'concurrency-advisor-slot';
      slot.className = 'concurrency-advisor-slot';
      section.appendChild(slot);
    }
    setHost(slot);

    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRevision(value => value + 1), 80);
    };
    document.addEventListener('input', refresh, true);
    document.addEventListener('change', refresh, true);
    document.addEventListener('click', refresh, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('input', refresh, true);
      document.removeEventListener('change', refresh, true);
      document.removeEventListener('click', refresh, true);
    };
  }, []);

  const input = useMemo(() => currentInput(), [revision]);
  const bands = useMemo(() => buildBands(input), [input]);
  const currentBand = bands[bands.length - 1];
  const currentScenario = currentBand?.scenario || onPremAt(input, input.concurrentUsers);
  const lowerBands = useMemo(() => bands.slice(0, -1).reverse().slice(0, 4), [bands]);
  const upgrade = useMemo(() => findUpgrade(input, currentScenario), [input, currentScenario]);
  const model = (expandedModels as any[]).find(item => item.id === input.modelId);

  if (!host || !currentScenario) return null;

  return createPortal(
    <div className="concurrency-advisor">
      <div className="concurrency-advisor-head">
        <div>
          <span className="concurrency-eyebrow">{it ? 'ELASTICITÀ DEL DIMENSIONAMENTO' : 'SIZING ELASTICITY'}</span>
          <h3>{it ? 'Quanti contemporanei ti fanno cambiare hardware?' : 'When does concurrency change the hardware?'}</h3>
          <p>{it
            ? `Calcolo automatico per ${model?.name || input.modelId}: ti mostro le soglie in cui ridurre gli utenti contemporanei permette davvero di comprare meno hardware.`
            : `Automatic calculation for ${model?.name || input.modelId}: these thresholds show when lower concurrency actually lets you buy less hardware.`}</p>
        </div>
        <div className="concurrency-now">
          <small>{it ? 'SCENARIO ATTUALE' : 'CURRENT SCENARIO'}</small>
          <strong>{input.concurrentUsers}</strong>
          <span>{it ? 'contemporanei' : 'concurrent'}</span>
        </div>
      </div>

      <div className="concurrency-current-card">
        <div>
          <small>{it ? `FASCIA ATTUALE · ${rangeLabel(currentBand?.min || input.concurrentUsers, currentBand?.max || input.concurrentUsers, it)}` : `CURRENT BAND · ${rangeLabel(currentBand?.min || input.concurrentUsers, currentBand?.max || input.concurrentUsers, it)}`}</small>
          <strong>{currentScenario.inferenceNodes} × {currentScenario.serverName}</strong>
          <span>{currentScenario.totalGpuCount} GPU · {euro.format(currentScenario.capexEur)} CAPEX · {euro.format(currentScenario.fourYearTcoEur)} TCO 4y</span>
        </div>
        <div className="concurrency-current-cost">
          <small>{it ? 'EQUIV. / MESE' : 'EQUIV. / MONTH'}</small>
          <b>{euro.format(currentScenario.monthlyEur)}</b>
        </div>
      </div>

      {lowerBands.length > 0 ? <>
        <div className="concurrency-advisor-caption">
          <b>{it ? 'Se puoi limitare la contemporaneità, queste sono le soglie che fanno davvero scendere l’infrastruttura:' : 'If you can cap concurrency, these are the thresholds that actually reduce infrastructure:'}</b>
        </div>
        <div className="concurrency-band-grid">
          {lowerBands.map((band, index) => {
            const saving = Math.max(0, currentScenario.fourYearTcoEur - band.scenario.fourYearTcoEur);
            const savingPct = currentScenario.fourYearTcoEur > 0 ? (saving / currentScenario.fourYearTcoEur) * 100 : 0;
            return <article className="concurrency-band-card" key={`${band.min}-${band.max}-${band.scenario.serverProfileId}`}>
              <div className="concurrency-band-top">
                <span>{index === 0 ? (it ? 'PRIMO STEP-DOWN' : 'FIRST STEP-DOWN') : (it ? 'STEP-DOWN' : 'STEP-DOWN')}</span>
                <b>{rangeLabel(band.min, band.max, it)}</b>
              </div>
              <h4>{band.scenario.inferenceNodes} × {band.scenario.serverName}</h4>
              <div className="concurrency-band-kpis">
                <span><small>GPU</small><strong>{band.scenario.totalGpuCount}</strong></span>
                <span><small>CAPEX</small><strong>{euro.format(band.scenario.capexEur)}</strong></span>
                <span><small>TCO 4y</small><strong>{euro.format(band.scenario.fourYearTcoEur)}</strong></span>
              </div>
              <div className="concurrency-saving">{it ? 'Risparmio vs oggi' : 'Saving vs today'} <b>{euro.format(saving)} · {savingPct.toFixed(0)}%</b></div>
              <button type="button" onClick={() => applyConcurrency(band.max)}>{it ? `Imposta ${band.max} contemporanei` : `Set ${band.max} concurrent`}</button>
            </article>;
          })}
        </div>
      </> : <div className="concurrency-no-step">
        <b>{it ? 'Ridurre la contemporaneità non cambia ancora l’hardware.' : 'Lower concurrency does not change the hardware yet.'}</b>
        <span>{it ? 'In questo caso il costo è dominato soprattutto dalla dimensione del modello, dalla VRAM minima per replica o dall’N-1.' : 'Here the cost is dominated mainly by model size, minimum VRAM per replica, or N-1 resilience.'}</span>
      </div>}

      {upgrade && <div className="concurrency-upgrade">
        <span>↑</span>
        <div><b>{it ? `Attenzione alla soglia opposta: da ${upgrade.concurrency} contemporanei` : `Opposite threshold: from ${upgrade.concurrency} concurrent users`}</b><small>{it ? `l’Auto passa a ${upgrade.scenario.inferenceNodes} × ${upgrade.scenario.serverName}.` : `Auto moves to ${upgrade.scenario.inferenceNodes} × ${upgrade.scenario.serverName}.`}</small></div>
      </div>}

      <div className="concurrency-method-note">{it
        ? 'Le soglie usano gli stessi parametri correnti di modello, context, output, strategia e N-1. Sono stime di capacity planning: prima dell’acquisto vanno confermate con benchmark sul runtime reale.'
        : 'Thresholds use the current model, context, output, strategy and N-1 settings. They are capacity-planning estimates and should be validated with runtime benchmarks before procurement.'}</div>
    </div>,
    host
  );
}
