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

function maxContextControl() {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(node => {
    const text = (node.textContent || '').toLowerCase();
    return text.includes('context massimo') || text.includes('max context');
  });
  return label?.querySelector('input') as HTMLInputElement | null;
}

function readRequiredMax() {
  const value = Number(maxContextControl()?.value || 0);
  return Number.isFinite(value) ? value : 0;
}

function setReactInputValue(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, String(value));
  else input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function ModelForceChooser() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const currentFromUrl = new URLSearchParams(window.location.search).get('model');
  const persisted = currentFromUrl || localStorage.getItem('ai-calculator-model') || '';
  const [selected, setSelected] = useState(persisted || models[0]?.id || '');
  const [requiredMax, setRequiredMax] = useState(0);

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

    const refresh = () => setRequiredMax(readRequiredMax());
    refresh();
    document.addEventListener('input', refresh, true);
    document.addEventListener('change', refresh, true);
    return () => {
      document.removeEventListener('input', refresh, true);
      document.removeEventListener('change', refresh, true);
    };
  }, []);

  const ordered = useMemo(() => models.slice().sort((a, b) => {
    const vendor = a.vendor.localeCompare(b.vendor);
    return vendor || a.parametersTotalB - b.parametersTotalB || a.name.localeCompare(b.name);
  }), []);

  const chosen = models.find(model => model.id === selected);
  const chosenMax = Number(chosen?.maxExtendedContextTokens || chosen?.nativeContextTokens || 0);
  const maxMismatch = Boolean(chosen && requiredMax > chosenMax && chosenMax > 0);

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

  const useModelMax = () => {
    if (!chosenMax) return;
    const input = maxContextControl();
    if (input) setReactInputValue(input, chosenMax);
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

      {maxMismatch && <div className="model-context-warning">
        <div>
          <b>⚠ Il modello non copre il context massimo richiesto</b>
          <span>Hai richiesto {contextLabel(requiredMax)}, mentre {chosen?.name} arriva a {contextLabel(chosenMax)}. Un server più potente non può superare il limite del modello: i costi vengono stimati sul carico medio e sul context effettivamente supportato.</span>
        </div>
        <button type="button" onClick={useModelMax}>Imposta max a {contextLabel(chosenMax)}</button>
      </div>}

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
