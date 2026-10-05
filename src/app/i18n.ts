import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  lng: localStorage.getItem('ai-calculator-language') || 'it',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    it: { translation: {
      title: 'AI Infrastructure Calculator', subtitle: 'Dimensiona LLMProxy e inferenza, confronta acquisto on-prem, colocation e noleggio.', dataUpdated: 'Dati aggiornati',
      workload: 'Modello e workload', workloadHint: 'Partiamo dal modello più grande che vuoi poter eseguire e dalla contemporaneità reale.', model: 'Modello massimale', users: 'Utenti medi', concurrent: 'Utenti contemporanei di picco', avgContext: 'Context medio', maxContext: 'Context massimo consentito', outputTokens: 'Output medio per richiesta', strategy: 'Profilo di dimensionamento', conservative: 'Economico', balanced: 'Bilanciato', performance: 'Prestazioni',
      benchmarkTitle: 'Indice benchmark normalizzato', benchmarkDisclaimer: '0–100, composito di benchmark pubblici. Serve per confrontare i modelli, non è un singolo test.', coding: 'Coding', general: 'Generalista', thinking: 'Thinking',
      hardwareAndCosts: 'Hardware e costi on-prem', hardwareHint: 'Lascia Auto per far scegliere il server al motore oppure forza un hardware specifico e sovrascrivi il prezzo.', hardware: 'Server di inferenza', autoHardware: 'Auto · scegli il server più sensato', autoSelected: 'Selezionato automaticamente', selected: 'Selezionato', electricity: 'Costo energia elettrica (€/kWh)', pue: 'PUE / fattore raffrescamento', coolingFixed: 'Raffrescamento fisso annuo (€)', serverPriceOverride: 'Prezzo server inferenza override (€ · 0 = catalogo)', proxyPrice: 'Prezzo server LLMProxy (€)', amortization: 'Ammortamento hardware (anni)', maintenance: 'Manutenzione annua (% CAPEX)', fitout: 'Predisposizione CED iniziale (€)', perServer: 'per server',
      scenarios: 'Scenari consigliati', scenarioHint: 'Confronto TCO tra hardware di proprietà in casa, hardware in colocation e noleggio.', onprem: 'Acquisto e gestione in casa', colo: 'Hardware proprio in colocation', rental: 'Noleggio / cloud GPU', ownership: 'Hardware di proprietà', proxy: 'Server LLMProxy', capacity: 'Capacità contemporanea stimata', power: 'Carico IT di picco', capex: 'CAPEX iniziale', electricityAnnual: 'Energia annua', coolingAnnual: 'Raffrescamento annuo', annual: 'Costo annuo stimato', fourYearTco: 'TCO 4 anni', monthly: 'Mensile',
      catalogs: 'Catalogo modelli e server', catalogHint: 'Il JSON è la fonte dati versionata: modelli, benchmark, hardware, prezzi e data di aggiornamento.', modelCatalog: 'Modelli open-weight', hardwareCatalog: 'Server e sistemi AI', parameters: 'Parametri', context: 'Context max', tier: 'Tier minimo', purchase: 'Costo acquisto', cooling: 'Cooling',
      save: 'Salva scenario', saved: 'Scenari salvati', exportPdf: 'Esporta PDF', exportXlsx: 'Esporta Excel', dark: 'Scuro', light: 'Chiaro', assumptions: 'Assunzioni e metodologia', warnings: 'Limiti e avvisi', procurementDisclaimer: 'Prima di un acquisto reale: benchmark sul runtime scelto e RFQ del fornitore.'
    }},
    en: { translation: {
      title: 'AI Infrastructure Calculator', subtitle: 'Size LLMProxy and inference, compare on-prem purchase, colocation and rental.', dataUpdated: 'Data updated',
      workload: 'Model and workload', workloadHint: 'Start from the largest model you need to run and realistic peak concurrency.', model: 'Maximum model', users: 'Average users', concurrent: 'Peak concurrent users', avgContext: 'Average context', maxContext: 'Maximum allowed context', outputTokens: 'Average output per request', strategy: 'Sizing profile', conservative: 'Economy', balanced: 'Balanced', performance: 'Performance',
      benchmarkTitle: 'Normalized benchmark index', benchmarkDisclaimer: '0–100 composite of public benchmarks. It is for model comparison, not one literal test.', coding: 'Coding', general: 'General', thinking: 'Thinking',
      hardwareAndCosts: 'Hardware and on-prem costs', hardwareHint: 'Keep Auto to let the engine choose a server, or force specific hardware and override its purchase price.', hardware: 'Inference server', autoHardware: 'Auto · choose sensible hardware', autoSelected: 'Automatically selected', selected: 'Selected', electricity: 'Electricity cost (€/kWh)', pue: 'PUE / cooling factor', coolingFixed: 'Fixed annual cooling (€)', serverPriceOverride: 'Inference server price override (€ · 0 = catalog)', proxyPrice: 'LLMProxy server price (€)', amortization: 'Hardware amortization (years)', maintenance: 'Annual maintenance (% CAPEX)', fitout: 'Initial datacenter fit-out (€)', perServer: 'per server',
      scenarios: 'Recommended scenarios', scenarioHint: 'TCO comparison between owned on-prem hardware, owned hardware in colocation and rental.', onprem: 'Buy and operate on-prem', colo: 'Owned hardware in colocation', rental: 'Rental / GPU cloud', ownership: 'Owned hardware', proxy: 'LLMProxy servers', capacity: 'Estimated concurrent capacity', power: 'Peak IT load', capex: 'Initial CAPEX', electricityAnnual: 'Annual electricity', coolingAnnual: 'Annual cooling', annual: 'Estimated annual cost', fourYearTco: '4-year TCO', monthly: 'Monthly',
      catalogs: 'Model and server catalog', catalogHint: 'The JSON is the versioned data source for models, benchmarks, hardware, prices and update date.', modelCatalog: 'Open-weight models', hardwareCatalog: 'AI servers and systems', parameters: 'Parameters', context: 'Max context', tier: 'Minimum tier', purchase: 'Purchase cost', cooling: 'Cooling',
      save: 'Save scenario', saved: 'Saved scenarios', exportPdf: 'Export PDF', exportXlsx: 'Export Excel', dark: 'Dark', light: 'Light', assumptions: 'Assumptions and methodology', warnings: 'Limits and warnings', procurementDisclaimer: 'Before procurement: benchmark the selected runtime and obtain a supplier RFQ.'
    }}
  }
});

export default i18n;
