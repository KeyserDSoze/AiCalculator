import catalog from '../data/catalog.json';
import market from '../data/market.json';
import type { CalculatorInput, HardwareAssessment } from './calculator';

export type OfferCompatibility = 'exact' | 'limited' | 'rfq';

export interface CloudOfferResult {
  id: string;
  provider: string;
  product: string;
  pricingClass: string;
  currency: string;
  nativeUnitPrice: number;
  unit: string;
  unitPriceEur: number;
  hourlyTotalEur: number;
  monthlyTotalEur: number;
  annualTotalEur: number;
  allocatedUptimePct: number;
  compatibility: OfferCompatibility;
  compatibilityNote: string;
  regions: string[];
  billing: string;
  sourceUrl: string;
  sourceDate: string;
  notes: string;
  regionCompatible: boolean;
  fitScore: number;
}

export interface PurchaseOfferResult {
  id: string;
  supplier: string;
  product: string;
  currency: string;
  nativeUnitPrice: number;
  unitPriceEur: number;
  requiredNodes: number;
  totalPurchaseEur: number;
  region: string;
  availability: string;
  leadTime: string;
  sourceUrl: string;
  sourceDate: string;
  notes: string;
  regionCompatible: boolean;
  fitScore: number;
}

export interface RfqOfferResult {
  id: string;
  supplier: string;
  product: string;
  region: string;
  sourceUrl: string;
  sourceDate: string;
  notes: string;
}

const fxToEur = (amount: number, currency: string) => currency === 'EUR' ? amount : currency === 'USD' ? amount * (market.meta.usdToEur || 1) : amount;
export const marketMeta = market.meta;

function textLooksEuropean(value: string) {
  const v = value.toLowerCase();
  return ['europe', 'eu', 'italy', 'italia', 'germany', 'france', 'netherlands', 'sweden', 'finland', 'norway', 'spain', 'uk', 'united kingdom'].some(x => v.includes(x));
}

function regionCompatible(input: CalculatorInput, regions: string[]) {
  if (input.regionPreference === 'any') return true;
  if (input.regionPreference === 'italy') return regions.some(r => /italy|italia/i.test(r));
  return regions.some(textLooksEuropean);
}

export function getCloudOffers(input: CalculatorInput, assessment: HardwareAssessment): CloudOfferResult[] {
  const server = (catalog.serverProfiles as any[]).find(s => s.id === assessment.serverProfileId);
  if (!server) return [];
  const allocatedUptime = Math.max(0.01, Math.min(1, input.cloudAllocatedUptimePct / 100));
  const monthlyHours = 24 * 30 * allocatedUptime;

  const mapped = (market.cloudOffers as any[])
    .filter(o => o.gpuId === server.gpuId || (o.serverProfileIds || []).includes(server.id))
    .map(o => {
      const exact = Boolean(o.exactTopology && (o.serverProfileIds || []).includes(server.id));
      const unitPriceEur = fxToEur(o.price, o.currency);
      const maxGpusPerInstance = Math.max(...(o.gpusPerInstance || [1]));
      const hourlyTotalEur = o.unit === 'instance-hour'
        ? unitPriceEur * Math.max(1, Math.ceil(assessment.requiredGpuCount / maxGpusPerInstance))
        : unitPriceEur * assessment.requiredGpuCount;
      const monthlyTotalEur = hourlyTotalEur * monthlyHours;
      const regions = o.regions || [];
      const regionOk = regionCompatible(input, regions);
      const priceDensity = monthlyTotalEur / Math.max(1, assessment.estimatedConcurrentCapacity);
      const fitScore = Math.max(0, Math.round(100 - Math.min(45, priceDensity / 150) + (exact ? 18 : -18) + (regionOk ? 12 : -15)));
      return {
        id: o.id,
        provider: o.provider,
        product: o.product,
        pricingClass: o.pricingClass,
        currency: o.currency,
        nativeUnitPrice: o.price,
        unit: o.unit,
        unitPriceEur,
        hourlyTotalEur,
        monthlyTotalEur,
        annualTotalEur: monthlyTotalEur * 12,
        allocatedUptimePct: allocatedUptime * 100,
        compatibility: exact ? 'exact' : 'limited',
        compatibilityNote: exact
          ? 'Topologia equivalente alla classe hardware selezionata.'
          : 'Prezzo valido, ma la topologia pubblicata non equivale necessariamente al server multi-GPU selezionato: verificare NVLink/NVSwitch e stock.',
        regions,
        billing: o.billing || '',
        sourceUrl: o.sourceUrl,
        sourceDate: o.sourceDate,
        notes: o.notes || '',
        regionCompatible: regionOk,
        fitScore
      } as CloudOfferResult;
    });

  return mapped.sort((a, b) => {
    if (a.regionCompatible !== b.regionCompatible) return a.regionCompatible ? -1 : 1;
    if (a.compatibility !== b.compatibility) return a.compatibility === 'exact' ? -1 : 1;
    return a.monthlyTotalEur - b.monthlyTotalEur;
  });
}

export function getPurchaseOffers(input: CalculatorInput, assessment: HardwareAssessment): PurchaseOfferResult[] {
  const offers = (market.purchaseOffers as any[])
    .filter(o => o.serverProfileId === assessment.serverProfileId)
    .map(o => {
      const unitPriceEur = fxToEur(o.price, o.currency);
      const totalPurchaseEur = unitPriceEur * assessment.requiredNodes;
      const regionOk = regionCompatible(input, [o.region || '']);
      const fitScore = Math.max(0, Math.round(100 - Math.min(40, totalPurchaseEur / 100000) + (regionOk ? 15 : -10)));
      return {
        id: o.id,
        supplier: o.supplier,
        product: o.product,
        currency: o.currency,
        nativeUnitPrice: o.price,
        unitPriceEur,
        requiredNodes: assessment.requiredNodes,
        totalPurchaseEur,
        region: o.region,
        availability: o.availability || '',
        leadTime: o.leadTime || '',
        sourceUrl: o.sourceUrl,
        sourceDate: o.sourceDate,
        notes: o.notes || '',
        regionCompatible: regionOk,
        fitScore
      } as PurchaseOfferResult;
    });

  return offers.sort((a, b) => {
    if (a.regionCompatible !== b.regionCompatible) return a.regionCompatible ? -1 : 1;
    return a.totalPurchaseEur - b.totalPurchaseEur;
  });
}

export function getRfqOffers(assessment: HardwareAssessment): RfqOfferResult[] {
  return (market.rfqOffers as any[])
    .filter(o => (o.serverProfileIds || []).includes(assessment.serverProfileId))
    .map(o => ({ id: o.id, supplier: o.supplier, product: o.product, region: o.region, sourceUrl: o.sourceUrl, sourceDate: o.sourceDate, notes: o.notes || '' }))
    .sort((a, b) => a.supplier.localeCompare(b.supplier));
}

export function cheapestExactCloudOffer(input: CalculatorInput, assessment: HardwareAssessment) {
  const offers = getCloudOffers(input, assessment).filter(o => o.compatibility === 'exact');
  const regional = offers.filter(o => o.regionCompatible);
  return (regional.length ? regional : offers).sort((a, b) => a.monthlyTotalEur - b.monthlyTotalEur)[0];
}

export function bestFitCloudOffer(input: CalculatorInput, assessment: HardwareAssessment) {
  return getCloudOffers(input, assessment).slice().sort((a, b) => b.fitScore - a.fitScore || a.monthlyTotalEur - b.monthlyTotalEur)[0];
}

export function cheapestPurchaseOffer(input: CalculatorInput, assessment: HardwareAssessment) {
  const offers = getPurchaseOffers(input, assessment);
  const regional = offers.filter(o => o.regionCompatible);
  return (regional.length ? regional : offers).sort((a, b) => a.totalPurchaseEur - b.totalPurchaseEur)[0];
}
