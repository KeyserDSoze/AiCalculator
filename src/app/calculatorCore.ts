import catalog from '../data/catalog.json';

export type Strategy = 'conservative' | 'balanced' | 'performance';
export type HardwareFit = 'impossible' | 'strained' | 'recommended' | 'top';
export type AvailabilityMode = 'standard' | 'n1';
export type BusinessProfile = 'mixed' | 'coding' | 'knowledge' | 'agentic' | 'reasoning';
export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type RegionPreference = 'any' | 'eu' | 'italy';

export interface CalculatorInput {
  modelId: string;
  serverProfileId: string;
  businessProfile: BusinessProfile;
  averageUsers: number;
  concurrentUsers: number;
  averageContextTokens: number;
  maxContextTokens: number;
  averageOutputTokens: number;
  strategy: Strategy;
  availabilityMode: AvailabilityMode;
  dataSensitivity: DataSensitivity;
  regionPreference: RegionPreference;
  currentAnnualAiSpendEur: number;
  annualGrowthPct: number;
  planningHorizonYears: number;
  gpuUtilizationPct: number;
  cloudAllocatedUptimePct: number;
  auditRetentionDays: number;
  requestsPerUserPerDay: number;
  avgAuditPayloadKb: number;
  electricityEurPerKwh: number;
  pue: number;
  coolingAnnualEur: number;
  inferenceServerPriceOverrideEur: number;
  proxyServerPriceEur: number;
  hardwareAmortizationYears: number;
  maintenancePercent: number;
  onPremFitoutEur: number;
}

export interface HardwareAssessment {
  serverProfileId: string;
  serverName: string;
  status: HardwareFit;
  statusScore: number;
  nodesPerReplica: number;
  baseNodes: number;
  redundancyNodes: number;
  requiredNodes: number;
  requiredGpuCount: number;
  totalVramGb: number;
  estimatedConcurrentCapacity: number;
  n1ConcurrentCapacity: number;
  n1Pass: boolean;
  capacityHeadroomPct: number;
  modelMemoryGb: number;
  replicaUsableVramGb: number;
  memoryUtilizationPct: number;
  estimatedCapexEur: number;
  peakKw: number;
  averageKw: number;
  reasons: string[];
}

export interface ScenarioResult {
  id: 'onprem' | 'colo' | 'rental';
  proxyServers: number;
  inferenceNodes: number;
  baseInferenceNodes: number;
  redundancyNodes: number;
  nodesPerReplica: number;
  totalGpuCount: number;
  totalVramGb: number;
  estimatedConcurrentCapacity: number;
  n1ConcurrentCapacity: number;
  n1Pass: boolean;
  controlPlaneStorageTb: number;
  serverProfileId: string;
  serverName: string;
  serverUnitPriceEur: number;
  estimatedItKw: number;
  estimatedAverageKw: number;
  hardwareFit: HardwareFit;
  capexEur: number;
  monthlyEur: number;
  annualEur: number;
  fourYearTcoEur: number;
  annualElectricityEur: number;
  annualCoolingEur: number;
  annualMaintenanceEur: number;
  annualizedHardwareEur: number;
  cloudAllocatedUptimePct: number;
  notes: string[];
  warnings: string[];
}

export const DEFAULT_INPUT: CalculatorInput = {
  modelId: 'qwen3-coder-480b-a35b',
  serverProfileId: 'auto',
  businessProfile: 'mixed',
  averageUsers: 300,
  concurrentUsers: 30,
  averageContextTokens: 100000,
  maxContextTokens: 256000,
  averageOutputTokens: 4000,
  strategy: 'balanced',
  availabilityMode: 'n1',
  dataSensitivity: 'internal',
  regionPreference: 'eu',
  currentAnnualAiSpendEur: 150000,
  annualGrowthPct: 20,
  planningHorizonYears: 4,
  gpuUtilizationPct: 58,
  cloudAllocatedUptimePct: 100,
  auditRetentionDays: 30,
  requestsPerUserPerDay: 40,
  avgAuditPayloadKb: 256,
  electricityEurPerKwh: 0.20,
  pue: 1.45,
  coolingAnnualEur: 6000,
  inferenceServerPriceOverrideEur: 0,
  proxyServerPriceEur: 9000,
  hardwareAmortizationYears: 4,
  maintenancePercent: 8,
  onPremFitoutEur: 50000
};

const tierRank: Record<string, number> = { enterprise: 1, datacenter: 2, frontier: 3, rackscale: 4 };
const statusRank: Record<HardwareFit, number> = { top: 0, recommended: 1, strained: 2, impossible: 3 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function normalizedInput(input: CalculatorInput): CalculatorInput {
  const merged = { ...DEFAULT_INPUT, ...(input || {}) } as CalculatorInput;
  return {
    ...merged,
    averageUsers: Math.max(1, Number(merged.averageUsers) || DEFAULT_INPUT.averageUsers),
    concurrentUsers: Math.max(1, Number(merged.concurrentUsers) || DEFAULT_INPUT.concurrentUsers),
    averageContextTokens: Math.max(1024, Number(merged.averageContextTokens) || DEFAULT_INPUT.averageContextTokens),
    maxContextTokens: Math.max(1024, Number(merged.maxContextTokens) || DEFAULT_INPUT.maxContextTokens),
    averageOutputTokens: Math.max(1, Number(merged.averageOutputTokens) || DEFAULT_INPUT.averageOutputTokens),
    currentAnnualAiSpendEur: Math.max(0, Number(merged.currentAnnualAiSpendEur) || 0),
    annualGrowthPct: clamp(Number(merged.annualGrowthPct) || 0, 0, 500),
    planningHorizonYears: clamp(Number(merged.planningHorizonYears) || 4, 1, 10),
    gpuUtilizationPct: clamp(Number(merged.gpuUtilizationPct) || DEFAULT_INPUT.gpuUtilizationPct, 1, 100),
    cloudAllocatedUptimePct: clamp(Number(merged.cloudAllocatedUptimePct) || DEFAULT_INPUT.cloudAllocatedUptimePct, 1, 100),
    auditRetentionDays: clamp(Number(merged.auditRetentionDays) || DEFAULT_INPUT.auditRetentionDays, 1, 4015),
    requestsPerUserPerDay: Math.max(1, Number(merged.requestsPerUserPerDay) || DEFAULT_INPUT.requestsPerUserPerDay),
    avgAuditPayloadKb: Math.max(1, Number(merged.avgAuditPayloadKb) || DEFAULT_INPUT.avgAuditPayloadKb),
    electricityEurPerKwh: Math.max(0, Number(merged.electricityEurPerKwh) || 0),
    pue: Math.max(1, Number(merged.pue) || DEFAULT_INPUT.pue),
    coolingAnnualEur: Math.max(0, Number(merged.coolingAnnualEur) || 0),
    inferenceServerPriceOverrideEur: Math.max(0, Number(merged.inferenceServerPriceOverrideEur) || 0),
    proxyServerPriceEur: Math.max(0, Number(merged.proxyServerPriceEur) || DEFAULT_INPUT.proxyServerPriceEur),
    hardwareAmortizationYears: clamp(Number(merged.hardwareAmortizationYears) || DEFAULT_INPUT.hardwareAmortizationYears, 1, 10),
    maintenancePercent: clamp(Number(merged.maintenancePercent) || 0, 0, 50),
    onPremFitoutEur: Math.max(0, Number(merged.onPremFitoutEur) || 0)
  };
}

function modelMemoryGb(model: any, strategy: Strategy) {
  const precisionBytes = strategy === 'conservative' ? 0.62 : strategy === 'balanced' ? 1.0 : 1.25;
  return model.parametersTotalB * precisionBytes;
}

function contextPressure(input: CalculatorInput, model: any) {
  const native = Math.max(1, model.nativeContextTokens || model.maxExtendedContextTokens || 1);
  return {
    avg: clamp(input.averageContextTokens / native, 0.05, 8),
    max: clamp(input.maxContextTokens / native, 0.05, 8)
  };
}

function maxPracticalShardNodes(server: any) {
  if (server.hardwareTier === 'rackscale') return 1;
  if (server.hardwareTier === 'frontier') return 8;
  if (server.hardwareTier === 'datacenter') return 4;
  return 2;
}

function averageNodeWatts(server: any, utilizationPct: number) {
  const idle = Number(server.idleWatts || server.peakWatts * 0.35 || 0);
  const peak = Number(server.peakWatts || idle);
  const load = clamp(utilizationPct / 100, 0, 1);
  return idle + (peak - idle) * load;
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
  const outputPenalty = clamp(Math.sqrt(input.averageOutputTokens / 4000), 0.65, 3.5);
  const throughputSessions = Math.max(1, Math.floor(((server.inferenceIndex || 1) * nodesPerReplica * 12) / computePenalty / contextComputePenalty / outputPenalty));
  const perReplicaCapacity = Math.max(1, Math.min(memorySessions, throughputSessions));

  const headroom = input.strategy === 'conservative' ? 1.05 : input.strategy === 'balanced' ? 1.3 : 1.6;
  const baseReplicaGroups = Math.max(1, Math.ceil((input.concurrentUsers * headroom) / perReplicaCapacity));
  const redundancyGroups = input.availabilityMode === 'n1' ? 1 : 0;
  const totalReplicaGroups = baseReplicaGroups + redundancyGroups;
  const baseNodes = baseReplicaGroups * nodesPerReplica;
  const redundancyNodes = redundancyGroups * nodesPerReplica;
  const inferenceNodes = totalReplicaGroups * nodesPerReplica;
  const estimatedConcurrentCapacity = perReplicaCapacity * totalReplicaGroups;
  const n1ConcurrentCapacity = Math.max(0, estimatedConcurrentCapacity - perReplicaCapacity);
  const n1Pass = n1ConcurrentCapacity >= input.concurrentUsers;
  const memoryUtilizationPct = clamp((weightsGb / Math.max(1, aggregateUsableGb)) * 100, 0, 999);
  const averageWatts = averageNodeWatts(server, input.gpuUtilizationPct) * inferenceNodes;

  return {
    weightsGb,
    usableGbPerNode,
    aggregateUsableGb,
    memoryUtilizationPct,
    nodesPerReplica,
    perReplicaCapacity,
    baseReplicaGroups,
    redundancyGroups,
    baseNodes,
    redundancyNodes,
    inferenceNodes,
    estimatedConcurrentCapacity,
    n1ConcurrentCapacity,
    n1Pass,
    headroom,
    averageWatts
  };
}

function evaluateHardwareOptions(rawInput: CalculatorInput, model: any) {
  const input = normalizedInput(rawInput);
  const all = (catalog.serverProfiles as any[]).filter(s => s.role === 'inference');
  const minTier = tierRank[model.minHardwareTier] ?? 1;
  const contextInvalid = input.maxContextTokens > model.maxExtendedContextTokens || input.averageContextTokens > input.maxContextTokens;

  return all.map(server => {
    const estimate = estimateForServer(input, model, server);
    const serverTier = tierRank[server.hardwareTier] ?? 1;
    const shardLimit = maxPracticalShardNodes(server);
    const shardImpossible = estimate.nodesPerReplica > shardLimit;
    const tierBelowGuidance = serverTier < minTier;
    const weakFabric = estimate.nodesPerReplica > 1 && (server.networkGbps || 0) < 400;
    const memoryHot = estimate.memoryUtilizationPct >= 88;
    const singleReplicaShare = estimate.perReplicaCapacity / Math.max(1, input.concurrentUsers);
    const capacityHeadroomPct = ((estimate.estimatedConcurrentCapacity / Math.max(1, input.concurrentUsers)) - 1) * 100;
    const longContext = input.averageContextTokens >= (model.nativeContextTokens || model.maxExtendedContextTokens) * 0.75;

    let status: HardwareFit = 'recommended';
    const reasons: string[] = [];

    if (contextInvalid) {
      status = 'impossible';
      reasons.push(input.maxContextTokens > model.maxExtendedContextTokens
        ? `Il context richiesto supera il limite del modello (${model.maxExtendedContextTokens.toLocaleString()} token).`
        : 'Il context medio non può essere superiore al context massimo.');
    } else if (shardImpossible) {
      status = 'impossible';
      reasons.push(`Servirebbero ${estimate.nodesPerReplica} nodi per una singola replica; il limite pratico per questa classe è ${shardLimit}.`);
    } else {
      if (tierBelowGuidance) reasons.push(`Classe ${server.hardwareTier} sotto il tier ${model.minHardwareTier} consigliato per questo modello.`);
      if (estimate.nodesPerReplica > 1) reasons.push(`Una replica richiede ${estimate.nodesPerReplica} nodi: aumentano latenza, fabric e complessità.`);
      if (weakFabric) reasons.push(`Lo sharding multi-nodo su ${server.networkGbps} Gbit/s è un collo di bottiglia probabile.`);
      if (memoryHot) reasons.push(`I pesi occupano circa ${estimate.memoryUtilizationPct.toFixed(0)}% della VRAM utilizzabile della replica.`);
      if (longContext) reasons.push('Il context medio è molto lungo e aumenta pressione su KV cache e prefill.');
      if (input.averageOutputTokens >= 12000) reasons.push('Output molto lungo: la fase decode riduce la contemporaneità sostenibile.');
      if (singleReplicaShare < 0.45) reasons.push('Una singola replica copre meno della metà della contemporaneità richiesta.');
      if (input.availabilityMode === 'n1') reasons.push(estimate.n1Pass ? `N-1 OK: circa ${estimate.n1ConcurrentCapacity} sessioni anche perdendo una replica.` : `N-1 non sufficiente: resterebbero circa ${estimate.n1ConcurrentCapacity} sessioni.`);

      const strained = tierBelowGuidance || weakFabric || estimate.nodesPerReplica > 1 || memoryHot || singleReplicaShare < 0.35 || (input.availabilityMode === 'n1' && !estimate.n1Pass);
      const top = !strained && estimate.nodesPerReplica === 1 && estimate.memoryUtilizationPct <= 72 && singleReplicaShare >= 1.15;
      status = strained ? 'strained' : top ? 'top' : 'recommended';

      if (status === 'top') reasons.push('Una singola replica ha margine elevato su memoria e contemporaneità: scelta orientata alle massime prestazioni.');
      if (status === 'recommended') reasons.push('Configurazione tecnicamente equilibrata per il carico indicato, con scaling orizzontale gestibile.');
      if (status === 'strained' && reasons.length === 0) reasons.push('Configurazione fattibile ma con poco margine operativo.');
    }

    const estimatedCapexEur = estimate.inferenceNodes * server.estimatedPurchaseEur;
    const peakKw = estimate.inferenceNodes * server.peakWatts / 1000;
    const averageKw = estimate.averageWatts / 1000;
    const statusScore = status === 'impossible' ? 0 : status === 'strained' ? 45 : status === 'recommended' ? 75 : 100;

    return {
      server,
      estimate,
      assessment: {
        serverProfileId: server.id,
        serverName: server.name,
        status,
        statusScore,
        nodesPerReplica: estimate.nodesPerReplica,
        baseNodes: estimate.baseNodes,
        redundancyNodes: estimate.redundancyNodes,
        requiredNodes: estimate.inferenceNodes,
        requiredGpuCount: estimate.inferenceNodes * server.gpuCount,
        totalVramGb: estimate.inferenceNodes * server.totalVramGb,
        estimatedConcurrentCapacity: estimate.estimatedConcurrentCapacity,
        n1ConcurrentCapacity: estimate.n1ConcurrentCapacity,
        n1Pass: estimate.n1Pass,
        capacityHeadroomPct,
        modelMemoryGb: estimate.weightsGb,
        replicaUsableVramGb: estimate.aggregateUsableGb,
        memoryUtilizationPct: estimate.memoryUtilizationPct,
        estimatedCapexEur,
        peakKw,
        averageKw,
        reasons
      } as HardwareAssessment
    };
  });
}

export function assessHardware(rawInput: CalculatorInput): HardwareAssessment[] {
  const input = normalizedInput(rawInput);
  const model = (catalog.models as any[]).find(m => m.id === input.modelId) ?? (catalog.models as any[])[0];
  return evaluateHardwareOptions(input, model)
    .map(x => x.assessment)
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.estimatedCapexEur - b.estimatedCapexEur);
}

function pickServer(input: CalculatorInput, model: any) {
  const evaluated = evaluateHardwareOptions(input, model);
  const all = evaluated.map(x => x.server);
  if (input.serverProfileId && input.serverProfileId !== 'auto') return all.find(s => s.id === input.serverProfileId) ?? all[0];

  const feasible = evaluated.filter(x => x.assessment.status !== 'impossible');
  if (!feasible.length) return all[all.length - 1];

  if (input.strategy === 'conservative') {
    return feasible.sort((a, b) => a.assessment.estimatedCapexEur - b.assessment.estimatedCapexEur)[0].server;
  }

  if (input.strategy === 'performance') {
    const preferred = feasible.filter(x => x.assessment.status === 'top');
    const pool = preferred.length ? preferred : feasible.filter(x => x.assessment.status === 'recommended');
    const finalPool = pool.length ? pool : feasible;
    return finalPool.sort((a, b) => {
      const densityA = a.estimate.estimatedConcurrentCapacity / Math.max(1, a.estimate.inferenceNodes);
      const densityB = b.estimate.estimatedConcurrentCapacity / Math.max(1, b.estimate.inferenceNodes);
      return densityB - densityA || a.assessment.estimatedCapexEur - b.assessment.estimatedCapexEur;
    })[0].server;
  }

  const preferred = feasible.filter(x => x.assessment.status === 'recommended');
  const pool = preferred.length ? preferred : feasible.filter(x => x.assessment.status === 'top');
  const finalPool = pool.length ? pool : feasible;
  return finalPool.sort((a, b) => {
    const scoreA = a.assessment.estimatedCapexEur / Math.max(1, a.estimate.estimatedConcurrentCapacity) + a.estimate.inferenceNodes * 2500;
    const scoreB = b.assessment.estimatedCapexEur / Math.max(1, b.estimate.estimatedConcurrentCapacity) + b.estimate.inferenceNodes * 2500;
    return scoreA - scoreB;
  })[0].server;
}

function estimateControlPlaneStorageTb(input: CalculatorInput) {
  const bytes = input.averageUsers * input.requestsPerUserPerDay * input.auditRetentionDays * input.avgAuditPayloadKb * 1024;
  const withIndexesAndHeadroom = bytes * 1.8;
  return Math.max(0.5, Math.ceil((withIndexesAndHeadroom / 1_000_000_000_000) * 10) / 10);
}

export function calculate(rawInput: CalculatorInput): ScenarioResult[] {
  const input = normalizedInput(rawInput);
  const model = (catalog.models as any[]).find(m => m.id === input.modelId) ?? (catalog.models as any[])[0];
  const gpuNode = pickServer(input, model);
  const proxy = (catalog.serverProfiles as any[]).find(s => s.id === 'proxy-standard');
  const facility = catalog.facility as any;
  const rental = catalog.rental as any;

  const estimate = estimateForServer(input, model, gpuNode);
  const selectedAssessment = evaluateHardwareOptions(input, model).find(x => x.server.id === gpuNode.id)?.assessment;
  const inferenceNodes = estimate.inferenceNodes;
  const proxyServers = input.availabilityMode === 'n1' || input.strategy === 'performance' || input.averageUsers >= 300 ? 2 : 1;
  const controlPlaneStorageTb = estimateControlPlaneStorageTb(input);
  const inferenceUnitPrice = input.inferenceServerPriceOverrideEur > 0 ? input.inferenceServerPriceOverrideEur : gpuNode.estimatedPurchaseEur;
  const proxyUnitPrice = input.proxyServerPriceEur > 0 ? input.proxyServerPriceEur : proxy.estimatedPurchaseEur;

  const peakKw = ((gpuNode.peakWatts * inferenceNodes) + (proxy.peakWatts * proxyServers)) / 1000;
  const gpuAverageWatts = averageNodeWatts(gpuNode, input.gpuUtilizationPct) * inferenceNodes;
  const proxyAverageWatts = averageNodeWatts(proxy, Math.min(65, Math.max(25, input.gpuUtilizationPct * 0.55))) * proxyServers;
  const averageKw = (gpuAverageWatts + proxyAverageWatts) / 1000;
  const annualKwhIt = averageKw * 24 * 365;
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
  const billedHoursPerMonth = 24 * 30 * (input.cloudAllocatedUptimePct / 100);
  const rentalMonthly = inferenceNodes * rentalServerHourly * billedHoursPerMonth + proxyServers * rental.proxyMonthlyEur;

  const commonWarnings: string[] = [];
  if (input.maxContextTokens > model.maxExtendedContextTokens) commonWarnings.push(`Requested max context (${input.maxContextTokens.toLocaleString()}) exceeds model limit (${model.maxExtendedContextTokens.toLocaleString()}).`);
  if (input.averageContextTokens > input.maxContextTokens) commonWarnings.push('Average context cannot exceed configured maximum context.');
  if (selectedAssessment?.status === 'impossible') commonWarnings.push('The forced hardware is classified as theoretically impractical for this workload. Choose Auto or another server class.');
  if (selectedAssessment?.status === 'strained') commonWarnings.push('The selected hardware is feasible but under stress. Expect tighter latency/queueing margins and validate with benchmarks.');
  if (estimate.nodesPerReplica > 1) commonWarnings.push(`The selected model needs about ${estimate.nodesPerReplica} ${gpuNode.name} nodes per model replica; high-speed fabric is required for sharding.`);
  if (input.availabilityMode === 'n1' && !estimate.n1Pass) commonWarnings.push('N-1 target is not met after losing one replica group. Add capacity or choose stronger hardware.');
  if (input.maxContextTokens >= 1000000) commonWarnings.push('1M context materially reduces concurrency and should be treated as an exceptional workload unless benchmarks prove otherwise.');
  if (gpuNode.hardwareTier === 'rackscale') commonWarnings.push('Rack-scale systems require liquid cooling, high-voltage power distribution, datacenter engineering and vendor-specific deployment planning.');

  const commonNotes = [
    `Selected inference hardware: ${gpuNode.name} (${selectedAssessment?.status ?? 'recommended'}).`,
    `Estimated ${estimate.nodesPerReplica} node(s) per model replica and ~${estimate.perReplicaCapacity} concurrent sessions per replica at the configured average context/output.`,
    `Sizing includes ${(estimate.headroom * 100 - 100).toFixed(0)}% concurrency headroom${input.availabilityMode === 'n1' ? ' plus one redundant replica group for N-1' : ''}.`,
    `Power model uses idle + (peak-idle) × ${input.gpuUtilizationPct.toFixed(0)}% GPU utilization: ~${averageKw.toFixed(1)} kW average, ${peakKw.toFixed(1)} kW peak.`,
    `Cloud planning uses ${input.cloudAllocatedUptimePct.toFixed(0)}% billable allocated uptime, not GPU utilization.`,
    `Control-plane audit storage planning: ~${controlPlaneStorageTb.toFixed(1)} TB for ${input.auditRetentionDays} days at ${input.requestsPerUserPerDay} requests/user/day.`,
    `Benchmark and capacity values are planning estimates and should be replaced by measured vLLM/SGLang benchmarks before procurement.`
  ];

  const fourYearOnPrem = onPremCapex + (annualItElectricity + annualCooling + maintenance) * 4;
  const fourYearColo = hardwareCapex + (coloMonthly * 12 - annualizedHardware) * 4;
  const fourYearRental = rentalMonthly * 48;

  const common = {
    proxyServers,
    inferenceNodes,
    baseInferenceNodes: estimate.baseNodes,
    redundancyNodes: estimate.redundancyNodes,
    nodesPerReplica: estimate.nodesPerReplica,
    totalGpuCount: inferenceNodes * gpuNode.gpuCount,
    totalVramGb: inferenceNodes * gpuNode.totalVramGb,
    estimatedConcurrentCapacity: estimate.estimatedConcurrentCapacity,
    n1ConcurrentCapacity: estimate.n1ConcurrentCapacity,
    n1Pass: estimate.n1Pass,
    controlPlaneStorageTb,
    serverProfileId: gpuNode.id,
    serverName: gpuNode.name,
    serverUnitPriceEur: inferenceUnitPrice,
    estimatedItKw: peakKw,
    estimatedAverageKw: averageKw,
    hardwareFit: (selectedAssessment?.status ?? 'recommended') as HardwareFit,
    cloudAllocatedUptimePct: input.cloudAllocatedUptimePct
  };

  return [
    { id: 'onprem', ...common, capexEur: onPremCapex, monthlyEur: onPremAnnual / 12, annualEur: onPremAnnual, fourYearTcoEur: fourYearOnPrem, annualElectricityEur: annualItElectricity, annualCoolingEur: annualCooling, annualMaintenanceEur: maintenance, annualizedHardwareEur: annualizedHardware, notes: [...commonNotes, 'On-prem includes facility fit-out, server purchase, electricity, cooling, maintenance and hardware amortization.'], warnings: commonWarnings },
    { id: 'colo', ...common, capexEur: hardwareCapex, monthlyEur: coloMonthly, annualEur: coloMonthly * 12, fourYearTcoEur: fourYearColo, annualElectricityEur: 0, annualCoolingEur: 0, annualMaintenanceEur: maintenance, annualizedHardwareEur: annualizedHardware, notes: [...commonNotes, `Colocation assumes ${racksNeeded} rack(s), network and ${coloPowerKw} kW committed power using catalog reference values.`], warnings: commonWarnings },
    { id: 'rental', ...common, capexEur: 0, monthlyEur: rentalMonthly, annualEur: rentalMonthly * 12, fourYearTcoEur: fourYearRental, annualElectricityEur: 0, annualCoolingEur: 0, annualMaintenanceEur: 0, annualizedHardwareEur: 0, notes: [...commonNotes, `Rental estimate uses ${rentalServerHourly.toFixed(2)} EUR/server-hour and ${input.cloudAllocatedUptimePct.toFixed(0)}% billable allocated uptime.`], warnings: commonWarnings }
  ];
}
