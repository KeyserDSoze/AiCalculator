import React, { useEffect, useMemo, useState } from 'react';
import models from '../data/models-expanded.json';
import './modelCatalog.css';

type SortMode = 'value' | 'size' | 'coding' | 'general' | 'thinking';
type SizeMode = 'all' | 'tiny' | 'small' | 'medium' | 'large' | 'frontier';

type Model = (typeof models)[number];

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function valueScore(model: Model) {
  const b = model.benchmarks;
  const quality = ((b.coding || 0) + (b.general || 0) + (b.thinking || 0)) / 3;
  const active = Math.max(0.5, model.parametersActiveB || model.parametersTotalB);
  const total = Math.max(0.5, model.parametersTotalB);
  const efficiency = clamp(112 - Math.log10(active) * 24 - Math.log10(total) * 6);
  return clamp(quality * 0.78 + efficiency * 0.22);
}

function sizeClass(model: Model): Exclude<SizeMode, 'all'> {
  const total = model.parametersTotalB;
  if (total <= 4) return 'tiny';
  if (total <= 15) return 'small';
  if (total <= 40) return 'medium';
  if (total <= 150) return 'large';
  return 'frontier';
}

function paramsLabel(model: Model) {
  const total = `${model.parametersTotalB}B`;
  const active = model.parametersActiveB;
  return active && active < model.parametersTotalB ? `${total} · ${active}B active` : total;
}

function contextLabel(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

export default function ModelCatalogOverlay() {
  const params = new URLSearchParams(window.location.search);
  const persisted = params.get('model') || localStorage.getItem('ai-calculator-model') || '';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [vendor, setVendor] = useState('all');
  const [size, setSize] = useState<SizeMode>('all');
  const [sort, setSort] = useState<SortMode>('value');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const vendors = useMemo(() => Array.from(new Set(models.map(m => m.vendor))).sort(), []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models
      .filter(m => vendor === 'all' || m.vendor === vendor)
      .filter(m => size === 'all' || sizeClass(m) === size)
      .filter(m => !q || `${m.name} ${m.vendor} ${m.family} ${m.kind}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        if (sort === 'size') return a.parametersTotalB - b.parametersTotalB;
        if (sort === 'coding') return b.benchmarks.coding - a.benchmarks.coding;
        if (sort === 'general') return b.benchmarks.general - a.benchmarks.general;
        if (sort === 'thinking') return b.benchmarks.thinking - a.benchmarks.thinking;
        return valueScore(b) - valueScore(a);
      });
  }, [search, vendor, size, sort]);

  const selectModel = (id: string) => {
    localStorage.setItem('ai-calculator-model', id);
    const url = new URL(window.location.href);
    url.searchParams.set('model', id);
    window.location.assign(url.toString());
  };

  return <>
    <button className="model-catalog-fab" onClick={() => setOpen(true)} aria-label="Open model catalog">
      <span>◫</span><b>Model catalog</b><em>{models.length}</em>
    </button>
    {open && <div className="model-catalog-backdrop" onMouseDown={() => setOpen(false)}>
      <aside className="model-catalog-drawer" onMouseDown={e => e.stopPropagation()}>
        <header>
          <div><span className="catalog-eyebrow">OPEN / OPEN-WEIGHT MODELS</span><h2>Model catalog</h2><p>Confronta dimensione, parametri attivi, context e capability. I punteggi sono indici di planning 0–100, non benchmark assoluti.</p></div>
          <button className="catalog-close" onClick={() => setOpen(false)}>×</button>
        </header>

        <div className="catalog-toolbar">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca Qwen, Llama, 14B, coder…" />
          <select value={vendor} onChange={e => setVendor(e.target.value)}><option value="all">Tutti i vendor</option>{vendors.map(v => <option key={v} value={v}>{v}</option>)}</select>
          <select value={size} onChange={e => setSize(e.target.value as SizeMode)}>
            <option value="all">Tutte le dimensioni</option>
            <option value="tiny">Tiny · ≤4B</option>
            <option value="small">Small · 4–15B</option>
            <option value="medium">Medium · 15–40B</option>
            <option value="large">Large · 40–150B</option>
            <option value="frontier">Frontier · &gt;150B</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as SortMode)}>
            <option value="value">Ordina: valore</option>
            <option value="size">Ordina: più piccolo</option>
            <option value="coding">Ordina: coding</option>
            <option value="general">Ordina: general</option>
            <option value="thinking">Ordina: thinking</option>
          </select>
        </div>

        <div className="catalog-summary"><strong>{visible.length}</strong> modelli visibili <span>·</span> <b>46</b> modelli censiti <span>·</span> dense + MoE</div>

        <div className="model-catalog-list">
          {visible.map(model => {
            const selected = persisted === model.id;
            const score = Math.round(valueScore(model));
            return <article className={`catalog-model-card ${selected ? 'catalog-selected' : ''}`} key={model.id}>
              <div className="catalog-model-main">
                <div className="catalog-title-row"><div><span>{model.vendor} · {model.family}</span><h3>{model.name}</h3></div><div className="catalog-value"><small>VALUE</small><b>{score}</b></div></div>
                <div className="catalog-specs">
                  <span><small>PARAMETRI</small><b>{paramsLabel(model)}</b></span>
                  <span><small>ARCHITETTURA</small><b>{model.architecture.toUpperCase()}</b></span>
                  <span><small>CONTEXT MAX</small><b>{contextLabel(model.maxExtendedContextTokens)}</b></span>
                  <span><small>LICENZA</small><b>{model.license}</b></span>
                </div>
                <div className="catalog-scores"><span>Coding <b>{model.benchmarks.coding}</b></span><span>General <b>{model.benchmarks.general}</b></span><span>Thinking <b>{model.benchmarks.thinking}</b></span></div>
                <p>{model.notes}</p>
              </div>
              <div className="catalog-actions"><span className={`size-pill size-${sizeClass(model)}`}>{sizeClass(model)}</span><button className={selected ? 'selected' : ''} onClick={() => selectModel(model.id)}>{selected ? 'In uso' : 'Usa modello'}</button></div>
            </article>;
          })}
        </div>
      </aside>
    </div>}
  </>;
}
