import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import models from '../data/models-expanded.json';
import './modelForceChooser.css';

const LIVE_INPUT_KEY = 'ai-calculator-live-input';

function contextLabel(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

function paramsLabel(model: (typeof models)[number]) {
  const active = model.parametersActiveB;
  return active && active < model.parametersTotalB
    ? `${model.parametersTotalB}B / ${active}B attivi`
    : `${model.parametersTotalB}B`;
}

export default function ModelForceChooser() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const currentFromUrl = new URLSearchParams(window.location.search).get('model');
  const persisted = currentFromUrl || localStorage.getItem('ai-calculator-model') || '';
  const [selected, setSelected] = useState(persisted || models[0]?.id || '');

  useEffect(() => {
    const section = document.getElementById('models');
    if (!section) return;

    let slot = document.getElementById('model-force-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'model-force-slot';
      slot.className = 'model-force-slot';
      const heading = section.firstElementChild;
      if (heading?.nextSibling) section.insertBefore(slot, heading.nextSibling);
      else section.appendChild(slot);
    }
    setHost(slot);
  }, []);

  const ordered = useMemo(() => models.slice().sort((a, b) => {
    const vendor = a.vendor.localeCompare(b.vendor);
    return vendor || a.parametersTotalB - b.parametersTotalB || a.name.localeCompare(b.name);
  }), []);

  const chosen = models.find(model => model.id === selected);

  const applyModel = (id: string) => {
    setSelected(id);
    localStorage.setItem('ai-calculator-model', id);

    try {
      const saved = JSON.parse(localStorage.getItem(LIVE_INPUT_KEY) || '{}');
      localStorage.setItem(LIVE_INPUT_KEY, JSON.stringify({ ...saved, modelId: id, serverProfileId: 'auto' }));
    } catch {
      localStorage.setItem(LIVE_INPUT_KEY, JSON.stringify({ modelId: id, serverProfileId: 'auto' }));
    }

    const url = new URL(window.location.href);
    url.searchParams.set('model', id);
    window.location.assign(url.toString());
  };

  const openCatalog = () => {
    const button = document.querySelector<HTMLButtonElement>('.model-catalog-fab');
    button?.click();
  };

  if (!host) return null;

  return createPortal(
    <div className="model-force-panel">
      <div className="model-force-copy">
        <span>FORZA MODELLO</span>
        <strong>Scegli qualsiasi modello del catalogo</strong>
        <small>Le 4 card sotto sono solo i suggerimenti migliori per il profilo corrente. Qui puoi usare uno qualsiasi dei {models.length} modelli censiti.</small>
      </div>

      <div className="model-force-controls">
        <label>
          <span>Modello selezionato</span>
          <select value={selected} onChange={event => applyModel(event.target.value)}>
            {ordered.map(model => (
              <option key={model.id} value={model.id}>
                {model.vendor} · {model.name} · {paramsLabel(model)} · {contextLabel(model.maxExtendedContextTokens)} ctx
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={openCatalog}>Cerca nei {models.length} modelli</button>
      </div>

      {chosen && <div className="model-force-current">
        <span><small>PARAMETRI</small><b>{paramsLabel(chosen)}</b></span>
        <span><small>CONTEXT MAX</small><b>{contextLabel(chosen.maxExtendedContextTokens)}</b></span>
        <span><small>CODING</small><b>{chosen.benchmarks.coding}</b></span>
        <span><small>GENERAL</small><b>{chosen.benchmarks.general}</b></span>
        <span><small>THINKING</small><b>{chosen.benchmarks.thinking}</b></span>
      </div>}
    </div>,
    host
  );
}
