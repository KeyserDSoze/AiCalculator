import catalog from '../data/catalog.json';

export type Strategy = 'conservative' | 'balanced' | 'performance';

export interface CalculatorInput {
  modelId: string;
  serverProfileId: string;
  averageUsers: number;
  concurrentUsers: number;
  averageContextTokens: number;
  maxContextTokens: number;
  averageOutputTokens: number;
  strategy: Strategy;
  electricityEurPerKwh: number;
  pue: number;
  coolingAnnualEur: number;
  inferenceServerPriceOverrideEur: number;
  proxyServerPriceEur: number;
  hardwareAmortizationYears: number;
  maintenancePercent: number;
  onPremFitoutEur: number;
}

export interface ScenarioResult {
  id: 'onprem' | 'colo' | 'rental';
  proxyServers: number;
  inferenceNodes: number;
  nodesPerReplica: number;
  totalGpuCount: number;
  totalVramGb: number;
  estimatedConcurrentCapacity: number;
  serverProfileId: string;
  serverName: string;
  serverUnitPriceEur: number;
  estimatedItKw: number;
  capexEur: number;
  monthlyEur: number;
  annualEur: number;
  fourYearTcoEur: number;
  annualElectricityEur: number;
  annualCoolingEur: number;
  annualMaintenanceEur: number;
  annualizedHardwareEur: number;
  notes: string[];
  warnings: string[];
}

export const DEFAULT_INPUT: CalculatorInput = {
  modelId: 'qwen3-coder-480b-a35b',
  serverProfileId: 'auto',
  averageUsers: 300,
  concurrentUsers: 30,
  averageContextTokens: 100000,
  maxContextTokens: 256000,
  averageOutputTokens: 4000,
  strategy: 'balanced',
  electricityEurPerKwh: 0.20,
  pue: 1.45,
  coolingAnnualEur: 6000,
  inferenceServerPriceOverrideEur: 0,
  proxyServerPriceEur: 9000,
  hardwareAmortizationYears: 4,
  maintenancePercent: 8,
  onPremFitoutEur: 50000
};

const tierRank: Record<string, number> = {
  enterprise: 1,
  datacenter: 2,
  frontier: 3,
  rackscale: 4
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function normalizedInput(input: CalculatorInput): CalculatorInput {
  return {
    ...DEFAULT_INPUT,
    ...input,
    electricityEurPerKwh: Number.isFinite(input?.electricityEurPerKwh) ? input.electricityEurPerKwh : DEFAULT_INPUT.electricityEurPerKwh,
    pue: Number.isFinite(input?.pue) ? input.pue : DEFAULT_INPUT.pue,
    coolingAnnualEur: Number.isFinite(input?.coolingAnnualEur) ? input.coolingAnnualEur : DEFAULT_INPUT.coolingAnnualEur,
    inferenceServerPriceOverrideEur: Number.isFinite(input?.inferenceServerPriceOverrideEur) ? input.inferenceServerPriceOverrideEur : 0,
    proxyServerPriceEur: Number.isFinite(input?.proxyServerPriceEur) ? input.proxyServerPriceEur : DEFAULT_INPUT.proxyServerPriceEur,
    hardwareAmortizationYears: Math.max(1, Number.isFinite(input?.hardwareAmortizationYears) ? input.hardwareAmortizationYears : DEFAULT_INPUT.hardwareAmortizationYears),
    maintenancePercent: Math.max(0, Number.isFinite(input?.maintenancePercent) ? input.maintenancePercent : DEFAULT_INPUT.maintenancePercent),
    onPremFitoutEur: Math.max(0, Number.isFinite(input?.onPremFitoutEur) ? input.onPremFitoutEur : DEFAULT_INPUT.onPremFitoutEur)
  };
}

function modelMemoryGb(model: any, strategy: Strategy) {
  const precisionBytes = strategy === 'conservative' ? 0.62 : strategy === 'balanced' ? 1.0 : 1.25;
  return model.parametersTotalB * precisionBytes;
}

function contextPressure(input: CalculatorInput, model: any) {
  const avg = clamp(input.averageContextTokens / Math.max(1, model.nativeContextTokens), 0.05, 8);
  const max = clamp(input.maxContextTokens / Math.max(1, model.nativeContextTokens), 0.05, 8);
  return { avg, max };
}

function estimateForServer(input: CalculatorInput, model: any, server: any) {
  const weightsGb = modelMemoryGb(model, input.strategy);
  const usableRatio = input.strategy === 'performance' ? 0.78 : input.strategy === 'balanced' ? 0.82 : 0.86;
  const usableGbPerNode = server.totalVramGb * usableRatio;
  const nodesPerReplica = Math.max(1, Math.ceil(weightsGb / Math.max(1, usableGbPerNode)));
  const aggregateUsableGb = usableGbPerNode * nodesPerReplica;
  const freeGb = Math.max(8, aggregateUsableGb - weightsGb);
  const { avg } = contextPressure(input, model);

  const active = model.parametersActiveB || model.parametersTotalB;
  const kvApproxGbAtNative = active >= 100 ? 22 : active >= 30 ? 14 : active >= 10 ? 8 : 5;
  const kvPerSession = Math.max(1.5, kvApproxGbAtNative * avg);
  const memorySessions = Math.max(1, Math.floor(freeGb / kvPerSession));

  const computePenalty = Math.max(0.65, active / 35);
  const contextComputePenalty = Math.max(0.65, Math.sqrt(avg));
  const throughputSessions = Math.max(1, Math.floor(((server.inferenceIndex || 1) * nodesPerReplica * 12) / computePenalty / contextComputePenalty));

  const perReplicaCapacity = Math.max(1, Math.min(memorySessions, throughputSessions));
  const headroom = input.strategy === 'conservative' ? 1.05 : input.strategy === 'balanced' ? 1.3 : 1.6;
  const replicaGroups = Math.max(1, Math.ceil((input.concurrentUsers * headroom) / perReplicaCapacity));
  const inferenceNodes = replicaGroups * nodesPerReplica;
  const estimatedConcurrentCapacity = perReplicaCapacity * replicaGroups;

  return { weightsGb, nodesPerReplica, perReplicaCapacity, replicaGroups, inferenceNodes, estimatedConcurrentCapacity, headroom };
}

function pickServer(input: CalculatorInput, model: any) {
  const all = (catalog.serverProfiles as any[]).filter(s => s.role === 'inference');
  if (input.serverProfileId && input.serverProfileId !== 'auto') return all.find(s => s.id === input.serverProfileId) ?? all[0];

  const minTier = tierRank[model.minHardwareTier] ?? 1;
  let candidates = all.filter(s => (tierRank[s.hardwareTier] ?? 1) >= minTier);
  const extremeRackScale = input.concurrentUsers >= 180 || (input.strategy === 'performance' && input.concurrentUsers >= 80 && input.maxContextTokens >= 1000000 && model.parametersTotalB >= 400);
  if (!extremeRackScale) candidates = candidates.filter(s => s.hardwareTier !== 'rackscale');

  const evaluated = candidates.map(server => {
    const estimate = estimateForServer(input, model, server);
    const capex = estimate.inferenceNodes * server.estimatedPurchaseEur;
    return { server, estimate, capex };
  });
  if (!evaluated.length) return all[all.length - 1];
  const cheapest = Math.min(...evaluated.map(x => x.capex));

  if (input.strategy === 'conservative') return evaluated.sort((a, b) => a.capex - b.capex)[0].server;
  if (input.strategy === 'performance') {
    const affordable = evaluated.filter(x => x.capex <= cheapest * 1.8);
    return affordable.sort((a, b) => (b.estimate.estimatedConcurrentCapacity / Math.max(1, b.estimate.inferenceNodes)) - (a.estimate.estimatedConcurrentCapacity / Math.max(1, a.estimate.inferenceNodes)))[0].server;
  }
  return evaluated.sort((a, b) => {
    const scoreA = a.capex / Math.max(1, a.estimate.estimatedConcurrentCapacity) + a.estimate.inferenceNodes * 2500;
    const scoreB = b.capex / Math.max(1, b.estimate.estimatedConcurrentCapacity) + b.estimate.inferenceNodes * 2500;
    return scoreA - scoreB;
  })[0].server;
}

export function calculate(rawInput: CalculatorInput): ScenarioResult[] {
  const input = normalizedInput(rawInput);
  const model = (catalog.models as any[]).find(m => m.id === input.modelId) ?? (catalog.models as any[])[0];
  const gpuNode = pickServer(input, model);
  const proxy = (catalog.serverProfiles as any[]).find(s => s.id === 'proxy-standard');
  const facility = catalog.facility as any;
  const rental = catalog.rental as any;

  const estimate = estimateForServer(input, model, gpuNode);
  const inferenceNodes = estimate.inferenceNodes;
  const proxyServers = input.strategy === 'performance' || input.averageUsers >= 300 ? 2 : 1;
  const inferenceUnitPrice = input.inferenceServerPriceOverrideEur > 0 ? input.inferenceServerPriceOverrideEur : gpuNode.estimatedPurchaseEur;
  const proxyUnitPrice = input.proxyServerPriceEur > 0 ? input.proxyServerPriceEur : proxy.estimatedPurchaseEur;

  const peakKw = ((gpuNode.peakWatts * inferenceNodes) + (proxy.peakWatts * proxyServers)) / 1000;
  const averageUtilization = input.strategy === 'conservative' ? 0.45 : input.strategy === 'balanced' ? 0.58 : 0.70;
  const annualKwhIt = peakKw * averageUtilization * 24 * 365;
  const annualItElectricity = annualKwhIt * input.electricityEurPerKwh;
  const annualCoolingVariable = annualItElectricity * Math.max(0, input.pue - 1);
  const annualCooling = annualCoolingVariable + input.coolingAnnualEur;
  const annualElectricityAndCooling = annualItElectricity + annualCooling;

  const hardwareCapex = inferenceNodes * inferenceUnitPrice + proxyServers * proxyUnitPrice;
  const maintenance = hardwareCapex * (input.maintenancePercent / 100);
  const annualizedHardware = hardwareCapex / input.hardwareAmortizationYears;
  const onPremAnnual = annualElectricityAndCooling + maintenance + annualizedHardware;
  const onPremCapex = hardwareCapex + input.onPremFitoutEur;

  const coloPowerKw = Math.ceil(peakKw * 1.2);
  const racksNeeded = gpuNode.hardwareTier === 'rackscale' ? inferenceNodes : Math.max(1, Math.ceil((gpuNode.rackUnits * inferenceNodes + proxyServers) / 42));
  const coloMonthly = (racksNeeded * facility.coloRackMonthlyEur) + facility.coloNetworkMonthlyEur + (coloPowerKw * facility.coloPowerEurPerKwMonth) + maintenance / 12 + annualizedHardware / 12;

  const rentalServerHourly = rental.serverHourlyEur[gpuNode.id] ?? 40;
  const rentalMonthly = inferenceNodes * rentalServerHourly * 24 * 30 * averageUtilization + proxyServers * rental.proxyMonthlyEur;

  const commonWarnings: string[] = [];
  if (input.maxContextTokens > model.maxExtendedContextTokens) commonWarnings.push(`Requested max context (${input.maxContextTokens.toLocaleString()}) exceeds model limit (${model.maxExtendedContextTokens.toLocaleString()}).`);
  if (input.averageContextTokens > input.maxContextTokens) commonWarnings.push('Average context cannot exceed configured maximum context.');
  if (estimate.nodesPerReplica > 1) commonWarnings.push(`The selected model needs about ${estimate.nodesPerReplica} ${gpuNode.name} nodes per model replica at this precision profile; high-speed fabric is required for sharding.`);
  if (input.concurrentUsers > estimate.estimatedConcurrentCapacity * 0.9) commonWarnings.push('Peak concurrency is close to estimated capacity; queueing can occur during long-context bursts.');
  if (input.maxContextTokens >= 1000000) commonWarnings.push('1M context materially reduces concurrency and should be treated as an exceptional workload unless benchmarks prove otherwise.');
  if (gpuNode.hardwareTier === 'rackscale') commonWarnings.push('Rack-scale systems require liquid cooling, high-voltage power distribution, datacenter engineering and vendor-specific deployment planning.');

  const commonNotes = [
    `Selected inference hardware: ${gpuNode.name}.`,
    `Estimated ${estimate.nodesPerReplica} node(s) per model replica and ~${estimate.perReplicaCapacity} concurrent sessions per replica at the configured average context.`,
    `Sizing includes ${(estimate.headroom * 100 - 100).toFixed(0)}% concurrency headroom.`,
    `Peak IT load estimate: ${peakKw.toFixed(1)} kW; colocation allocation rounded to ${coloPowerKw} kW.`,
    `Benchmark and capacity values are planning estimates and should be replaced by measured vLLM/SGLang benchmarks before procurement.`
  ];

  const fourYearOnPrem = onPremCapex + (annualItElectricity + annualCooling + maintenance) * 4;
  const fourYearColo = hardwareCapex + (coloMonthly * 12 - annualizedHardware) * 4;
  const fourYearRental = rentalMonthly * 48;

  const common = {
    proxyServers,
    inferenceNodes,
    nodesPerReplica: estimate.nodesPerReplica,
    totalGpuCount: inferenceNodes * gpuNode.gpuCount,
    totalVramGb: inferenceNodes * gpuNode.totalVramGb,
    estimatedConcurrentCapacity: estimate.estimatedConcurrentCapacity,
    serverProfileId: gpuNode.id,
    serverName: gpuNode.name,
    serverUnitPriceEur: inferenceUnitPrice,
    estimatedItKw: peakKw
  };

  return [
    { id: 'onprem', ...common, capexEur: onPremCapex, monthlyEur: onPremAnnual / 12, annualEur: onPremAnnual, fourYearTcoEur: fourYearOnPrem, annualElectricityEur: annualItElectricity, annualCoolingEur: annualCooling, annualMaintenanceEur: maintenance, annualizedHardwareEur: annualizedHardware, notes: [...commonNotes, 'On-prem includes facility fit-out, server purchase, electricity, cooling, maintenance and hardware amortization.'], warnings: commonWarnings },
    { id: 'colo', ...common, capexEur: hardwareCapex, monthlyEur: coloMonthly, annualEur: coloMonthly * 12, fourYearTcoEur: fourYearColo, annualElectricityEur: 0, annualCoolingEur: 0, annualMaintenanceEur: maintenance, annualizedHardwareEur: annualizedHardware, notes: [...commonNotes, `Colocation assumes ${racksNeeded} rack(s), network and ${coloPowerKw} kW committed power using catalog reference values.`], warnings: commonWarnings },
    { id: 'rental', ...common, capexEur: 0, monthlyEur: rentalMonthly, annualEur: rentalMonthly * 12, fourYearTcoEur: fourYearRental, annualElectricityEur: 0, annualCoolingEur: 0, annualMaintenanceEur: 0, annualizedHardwareEur: 0, notes: [...commonNotes, `Rental estimate uses ${rentalServerHourly.toFixed(2)} EUR/server-hour and ${(averageUtilization * 100).toFixed(0)}% average utilization.`], warnings: commonWarnings }
  ];
}
