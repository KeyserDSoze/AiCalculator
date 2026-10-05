import React from 'react';
import ReactDOM from 'react-dom/client';
import './catalogPatch';
import './i18n';
import './modelCatalogCompare.css';
import { DEFAULT_INPUT } from './calculator';
import expandedModels from '../data/models-expanded.json';
import App from './App';
import ModelCatalogOverlay from './ModelCatalogOverlay';
import ModelComparisonOverlay from './ModelComparisonOverlay';
import ModelForceChooser from './ModelForceChooser';
import PremiumPdfController from './PremiumPdfController';
import CostSanityController from './CostSanityController';

const LIVE_INPUT_KEY = 'ai-calculator-live-input';

try {
  const savedInput = JSON.parse(localStorage.getItem(LIVE_INPUT_KEY) || '{}');
  if (savedInput && typeof savedInput === 'object') Object.assign(DEFAULT_INPUT, savedInput);
} catch {
  // Ignore malformed local state and fall back to defaults.
}

const queryModel = new URLSearchParams(window.location.search).get('model');
const savedModel = localStorage.getItem('ai-calculator-model');
const initialModel = queryModel || savedModel;

if (initialModel && (expandedModels as any[]).some(model => model.id === initialModel)) {
  DEFAULT_INPUT.modelId = initialModel;
  DEFAULT_INPUT.serverProfileId = 'auto';
  localStorage.setItem('ai-calculator-model', initialModel);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <ModelForceChooser />
    <ModelCatalogOverlay />
    <ModelComparisonOverlay />
    <PremiumPdfController />
    <CostSanityController />
  </React.StrictMode>
);