import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import catalog from '../data/catalog.json';
import { calculate, CalculatorInput, ScenarioResult, Strategy } from './calculator';
import './styles.css';

type SavedScenario = { id: string; createdAt: string; input: CalculatorInput; results: ScenarioResult[] };

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function loadSaved(): SavedScenario[] {
  try { return JSON.parse(localStorage.getItem('ai-calculator-scenarios') || '[]'); } catch { return []; }
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(localStorage.getItem('ai-calculator-theme') || 'dark');
  const [saved, setSaved] = useState<SavedScenario[]>(loadSaved);
  const [input, setInput] = useState<CalculatorInput>({
    modelId: 'qwen3-coder-30b-a3b', averageUsers: 300, concurrentUsers: 30,
    averageContextTokens: 100000, maxContextTokens: 256000, averageOutputTokens: 4000, strategy: 'balanced'
  });

  const results = useMemo(() => calculate(input), [input]);
  const selectedModel = (catalog.models as any[]).find(m => m.id === input.modelId);

  const setField = (field: keyof CalculatorInput, value: string | number) => setInput(prev => ({ ...prev, [field]: value }));

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next); localStorage.setItem('ai-calculator-theme', next);
  };

  const toggleLanguage = () => {
    const next = i18n.language.startsWith('it') ? 'en' : 'it';
    i18n.changeLanguage(next); localStorage.setItem('ai-calculator-language', next);
  };

  const saveScenario = () => {
    const entry: SavedScenario = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), input, results };
    const next = [entry, ...saved].slice(0, 30);
    setSaved(next); localStorage.setItem('ai-calculator-scenarios', JSON.stringify(next));
  };

  const restore = (entry: SavedScenario) => setInput(entry.input);

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('AI Infrastructure Calculator', 14, 18);
    doc.setFontSize(10);
    let y = 30;
    const lines = [
      `Model: ${selectedModel?.name}`,
      `Users: ${input.averageUsers} | Concurrent: ${input.concurrentUsers}`,
      `Average context: ${input.averageContextTokens.toLocaleString()} | Max context: ${input.maxContextTokens.toLocaleString()}`,
      `Sizing profile: ${input.strategy}`
    ];
    lines.forEach(line => { doc.text(line, 14, y); y += 6; });
    y += 5;
    results.forEach(r => {
      doc.setFontSize(12); doc.text(r.id.toUpperCase(), 14, y); y += 6;
      doc.setFontSize(10);
      [`Proxy servers: ${r.proxyServers}`, `Inference nodes: ${r.inferenceNodes}`, `GPUs: ${r.totalGpuCount}`, `VRAM: ${r.totalVramGb} GB`, `Capacity: ${r.estimatedConcurrentCapacity}`, `CAPEX: ${euro.format(r.capexEur)}`, `Monthly: ${euro.format(r.monthlyEur)}`, `Annual: ${euro.format(r.annualEur)}`].forEach(line => { doc.text(line, 18, y); y += 5; });
      r.warnings.forEach(w => { const wrapped = doc.splitTextToSize(`Warning: ${w}`, 170); doc.text(wrapped, 18, y); y += wrapped.length * 5; });
      y += 5;
      if (y > 260) { doc.addPage(); y = 20; }
    });
    doc.save(`ai-calculator-${Date.now()}.pdf`);
  };

  const exportExcel = () => {
    const summary = results.map(r => ({
      Scenario: r.id, Model: selectedModel?.name, AverageUsers: input.averageUsers, ConcurrentUsers: input.concurrentUsers,
      AverageContext: input.averageContextTokens, MaxContext: input.maxContextTokens, Strategy: input.strategy,
      ProxyServers: r.proxyServers, InferenceNodes: r.inferenceNodes, GPUs: r.totalGpuCount, VRAM_GB: r.totalVramGb,
      EstimatedConcurrentCapacity: r.estimatedConcurrentCapacity, CapexEUR: Math.round(r.capexEur), MonthlyEUR: Math.round(r.monthlyEur), AnnualEUR: Math.round(r.annualEur)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Scenarios');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((catalog.models as any[])), 'Models');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((catalog.serverProfiles as any[])), 'Hardware');
    XLSX.writeFile(wb, `ai-calculator-${Date.now()}.xlsx`);
  };

  return <div className={theme}>
    <main className="shell">
      <header>
        <div><h1>{t('title')}</h1><p>{t('subtitle')}</p></div>
        <div className="toolbar"><button onClick={toggleLanguage}>{i18n.language.startsWith('it') ? 'EN' : 'IT'}</button><button onClick={toggleTheme}>{theme === 'dark' ? t('light') : t('dark')}</button></div>
      </header>

      <section className="panel">
        <h2>{t('inputs')}</h2>
        <div className="grid inputs">
          <label>{t('model')}<select value={input.modelId} onChange={e => setField('modelId', e.target.value)}>{(catalog.models as any[]).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>{t('users')}<input type="number" value={input.averageUsers} onChange={e => setField('averageUsers', +e.target.value)} /></label>
          <label>{t('concurrent')}<input type="number" value={input.concurrentUsers} onChange={e => setField('concurrentUsers', +e.target.value)} /></label>
          <label>{t('avgContext')}<input type="number" step="1000" value={input.averageContextTokens} onChange={e => setField('averageContextTokens', +e.target.value)} /></label>
          <label>{t('maxContext')}<input type="number" step="1000" value={input.maxContextTokens} onChange={e => setField('maxContextTokens', +e.target.value)} /></label>
          <label>{t('outputTokens')}<input type="number" step="500" value={input.averageOutputTokens} onChange={e => setField('averageOutputTokens', +e.target.value)} /></label>
          <label>{t('strategy')}<select value={input.strategy} onChange={e => setField('strategy', e.target.value as Strategy)}><option value="conservative">{t('conservative')}</option><option value="balanced">{t('balanced')}</option><option value="performance">{t('performance')}</option></select></label>
        </div>
        <div className="model-card"><strong>{selectedModel?.name}</strong><span>{selectedModel?.kind} · {selectedModel?.parametersTotalB}B / {selectedModel?.parametersActiveB}B active · native context {(selectedModel?.nativeContextTokens || 0).toLocaleString()}</span><small>{selectedModel?.notes}</small></div>
      </section>

      <section>
        <h2>{t('scenarios')}</h2>
        <div className="grid cards">{results.map(r => <article className="card" key={r.id}>
          <h3>{t(r.id)}</h3>
          <div className="hero">{euro.format(r.monthlyEur)}<small>/ {t('monthly').toLowerCase()}</small></div>
          <dl><div><dt>{t('proxy')}</dt><dd>{r.proxyServers}</dd></div><div><dt>{t('inference')}</dt><dd>{r.inferenceNodes} node · {r.totalGpuCount} GPU</dd></div><div><dt>VRAM</dt><dd>{r.totalVramGb} GB</dd></div><div><dt>Capacity</dt><dd>~{r.estimatedConcurrentCapacity}</dd></div><div><dt>{t('capex')}</dt><dd>{euro.format(r.capexEur)}</dd></div><div><dt>{t('annual')}</dt><dd>{euro.format(r.annualEur)}</dd></div></dl>
          {r.warnings.length > 0 && <div className="warning"><strong>{t('warnings')}</strong>{r.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>}
          <details><summary>{t('assumptions')}</summary>{r.notes.map((n, i) => <p key={i}>{n}</p>)}</details>
        </article>)}</div>
      </section>

      <section className="actions"><button className="primary" onClick={saveScenario}>{t('save')}</button><button onClick={exportPdf}>{t('exportPdf')}</button><button onClick={exportExcel}>{t('exportXlsx')}</button></section>

      <section className="panel"><h2>{t('saved')}</h2>{saved.length === 0 ? <p>—</p> : <div className="saved-list">{saved.map(s => <button key={s.id} onClick={() => restore(s)}><strong>{new Date(s.createdAt).toLocaleString()}</strong><span>{(catalog.models as any[]).find(m => m.id === s.input.modelId)?.name} · {s.input.concurrentUsers} concurrent · {s.input.strategy}</span></button>)}</div>}</section>
    </main>
  </div>;
}
