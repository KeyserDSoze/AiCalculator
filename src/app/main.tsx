import React from 'react';
import ReactDOM from 'react-dom/client';
import './catalogPatch';
import './i18n';
import { DEFAULT_INPUT } from './calculator';
import expandedModels from '../data/models-expanded.json';
import App from './App';
import ModelCatalogOverlay from './ModelCatalogOverlay';

const queryModel = new URLSearchParams(window.location.search).get('model');
const savedModel = localStorage.getItem('ai-calculator-model');
const initialModel = queryModel || savedModel;

if (initialModel && (expandedModels as any[]).some(model => model.id === initialModel)) {
  DEFAULT_INPUT.modelId = initialModel;
  localStorage.setItem('ai-calculator-model', initialModel);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <ModelCatalogOverlay />
  </React.StrictMode>
);
