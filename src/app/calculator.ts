import catalog from '../data/catalog.json';

export type Strategy = 'conservative' | 'balanced' | 'performance';

export interface CalculatorInput {
  modelId: string;
  averageUsers: number;
  concurrentUsers: number;
  averageContextTokens: number;
  maxContextTokens: number;
  averageOutputTokens: number;
  strategy: Strategy;
}

export interface ScenarioResult {
  id: 'onprem' | 'colo' | 'rental';
  proxyServers: number;
  inferenceNodes: number;
  totalGpuCount: number;
  totalVramGb: number;
  estimatedConcurrentCapacity: number;
  capexEur: number;
  monthlyEur: number;
  annualEur: number;
  notes: string[];
  warnings: string[];
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function modelMemoryGb(model: any, strategy: Strategy) {
  const precisionBytes = strategy === 'conservative' ? 0.6 : strategy === 'balanced' ? 1 : 1.25;
  return model.parametersTotalB * precisionBytes;
}

function contextPressure(input: CalculatorInput, model: any) {
  const avg = clamp(input.averageContextTokens / Math.max(1, model.nativeContextTokens), 0.05, 4);
  const max = clamp(input.maxContextTokens / Math.max(1, model.nativeContextTokens), 0.05, 4);
  return { avg, max };
}

function capacityPerNode(input: CalculatorInput, model: any, node: any) {
  const { avg } = contextPressure(input, model);
  const weightsGb = modelMemoryGb(model, input.strategy);
  const usableGb = node.totalVramGb * (input.strategy === 'performance' ? 0.78 : 0.84);
  const freeGb = Math.max(16, usableGb - weightsGb);
  const kvApproxGbPerSessionAtNative = model.parametersActiveB >= 100 ? 22 : model.parametersActiveB >= 30 ? 14 : 8;
  const kvPerSession = Math.max(2, kvApproxGbPerSessionAtNative * avg);
  const memorySessions = Math.max(1, Math.floor(freeGb / kvPerSession));
  const throughputFactor = input.strategy === 'conservative' ? 0.7 : input.strategy === 'balanced' ? 1 : 1.25;
  return Math.max(1, Math.floor(memorySessions * throughputFactor));
}

export function calculate(input: CalculatorInput): ScenarioResult[] {
  const model = (catalog.models as any[]).find(m => m.id === input.modelId) ?? (catalog.models as any[])[0];
  const gpuNode = (catalog.serverProfiles as any[]).find(s => s.id === 'gpu-4x-rtxpro6000');
  const proxy = (catalog.serverProfiles as any[]).find(s => s.id === 'proxy-standard');
  const facility = catalog.facility as any;
  const rental = catalog.rental as any;
  const perNodeCapacity = capacityPerNode(input, model, gpuNode);
  const headroom = input.strategy === 'conservative' ? 1.05 : input.strategy === 'balanced' ? 1.3 : 1.6;
  const inferenceNodes = Math.max(1, Math.ceil((input.concurrentUsers * headroom) / perNodeCapacity));
  const proxyServers = input.strategy === 'performance' || input.averageUsers >= 300 ? 2 : 1;
  const peakKw = ((gpuNode.peakWatts * inferenceNodes) + (proxy.peakWatts * proxyServers)) / 1000;
  const averageUtilization = input.strategy === 'conservative' ? 0.45 : input.strategy === 'balanced' ? 0.58 : 0.7;
  const annualKwhIt = peakKw * averageUtilization * 24 * 365;
  const annualEnergyOnPrem = annualKwhIt * facility.defaultPue * facility.electricityEurPerKwh;
  const hardwareCapex = inferenceNodes * gpuNode.estimatedPurchaseEur + proxyServers * proxy.estimatedPurchaseEur;
  const maintenance = hardwareCapex * facility.maintenancePercentPerYear;
  const annualizedHardware = hardwareCapex / facility.hardwareAmortizationYears;
  const onPremAnnual = annualEnergyOnPrem + maintenance + annualizedHardware;
  const coloPowerKw = Math.ceil(peakKw * 1.2);
  const coloMonthly = facility.coloRackMonthlyEur + facility.coloNetworkMonthlyEur + (coloPowerKw * facility.coloPowerEurPerKwMonth) + maintenance / 12 + annualizedHardware / 12;
  const rentalGpuHourly = rental.gpuHourlyEur[gpuNode.gpuId] ?? 3;
  const rentalMonthly = inferenceNodes * gpuNode.gpuCount * rentalGpuHourly * 24 * 30 * averageUtilization + proxyServers * rental.proxyMonthlyEur;
  const commonWarnings: string[] = [];
  if (input.maxContextTokens > model.maxExtendedContextTokens) commonWarnings.push(`Requested max context (${input.maxContextTokens}) exceeds model limit (${model.maxExtendedContextTokens}).`);
  if (input.averageContextTokens > input.maxContextTokens) commonWarnings.push('Average context cannot exceed configured maximum context.');
  if (input.concurrentUsers > perNodeCapacity * inferenceNodes * 0.9) commonWarnings.push('Peak concurrency is close to estimated capacity; queueing can occur during long-context bursts.');
  if (input.maxContextTokens >= 1000000) commonWarnings.push('1M context materially reduces concurrency and should be reserved for exceptional workloads.');

  const commonNotes = [
    `Estimated capacity per 4-GPU node: ${perNodeCapacity} concurrent sessions at the configured average context.`,
    `Sizing includes ${(headroom * 100 - 100).toFixed(0)}% concurrency headroom.`,
    `Peak IT load estimate: ${peakKw.toFixed(1)} kW; colocation power allocation rounded to ${coloPowerKw} kW.`
  ];

  return [
    {
      id: 'onprem', proxyServers, inferenceNodes,
      totalGpuCount: inferenceNodes * gpuNode.gpuCount,
      totalVramGb: inferenceNodes * gpuNode.totalVramGb,
      estimatedConcurrentCapacity: perNodeCapacity * inferenceNodes,
      capexEur: hardwareCapex + facility.onPremFitoutEur,
      monthlyEur: onPremAnnual / 12,
      annualEur: onPremAnnual,
      notes: [...commonNotes, 'Includes an initial facility fit-out allowance; excludes financing and staffing.'],
      warnings: commonWarnings
    },
    {
      id: 'colo', proxyServers, inferenceNodes,
      totalGpuCount: inferenceNodes * gpuNode.gpuCount,
      totalVramGb: inferenceNodes * gpuNode.totalVramGb,
      estimatedConcurrentCapacity: perNodeCapacity * inferenceNodes,
      capexEur: hardwareCapex,
      monthlyEur: coloMonthly,
      annualEur: coloMonthly * 12,
      notes: [...commonNotes, 'Colocation assumes rack, network and committed power using catalog reference values.'],
      warnings: commonWarnings
    },
    {
      id: 'rental', proxyServers, inferenceNodes,
      totalGpuCount: inferenceNodes * gpuNode.gpuCount,
      totalVramGb: inferenceNodes * gpuNode.totalVramGb,
      estimatedConcurrentCapacity: perNodeCapacity * inferenceNodes,
      capexEur: 0,
      monthlyEur: rentalMonthly,
      annualEur: rentalMonthly * 12,
      notes: [...commonNotes, 'Rental estimate scales with assumed GPU utilization and hourly price.'],
      warnings: commonWarnings
    }
  ];
}
