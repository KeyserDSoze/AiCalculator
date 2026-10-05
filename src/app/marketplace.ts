import './market.css';
import catalog from '../data/catalog.json';
import market from '../data/market.json';
import type { CalculatorInput, HardwareAssessment } from './calculator';

export type OfferCompatibility = 'exact' | 'limited' | 'rfq';

export interface CloudOfferResult {
  id: string; provider: string; product: string; pricingClass: string; currency: string; nativeUnitPrice: number; unit: string; unitPriceEur: number; hourlyTotalEur: number; monthlyTotalEur: number; annualTotalEur: number; utilizationPct: number; compatibility: OfferCompatibility; compatibilityNote: string; regions: string[]; billing: string; sourceUrl: string; sourceDate: string; notes: string;
}

export interface PurchaseOfferResult {
  id: string; supplier: string; product: string; currency: string; nativeUnitPrice: number; unitPriceEur: number; requiredNodes: number; totalPurchaseEur: number; region: string; availability: string; leadTime: string; sourceUrl: string; sourceDate: string; notes: string;
}

export interface RfqOfferResult { id: string; supplier: string; product: string; region: string; sourceUrl: string; sourceDate: string; notes: string; }

const fxToEur = (amount: number, currency: string) => currency === 'EUR' ? amount : currency === 'USD' ? amount * (market.meta.usdToEur || 1) : amount;
export const marketMeta = market.meta;
export function utilizationForStrategy(strategy: CalculatorInput['strategy']) { return strategy === 'conservative' ? 0.45 : strategy === 'performance' ? 0.70 : 0.58; }

export function getCloudOffers(input: CalculatorInput, assessment: HardwareAssessment): CloudOfferResult[] {
  const server = (catalog.serverProfiles as any[]).find(s => s.id === assessment.serverProfileId);
  if (!server) return [];
  const utilization = utilizationForStrategy(input.strategy);
  return (market.cloudOffers as any[])
    .filter(o => o.gpuId === server.gpuId || (o.serverProfileIds || []).includes(server.id))
    .map(o => {
      const exact = Boolean(o.exactTopology && (o.serverProfileIds || []).includes(server.id));
      const unitPriceEur = fxToEur(o.price, o.currency);
      const maxGpusPerInstance = Math.max(...(o.gpusPerInstance || [1]));
      const hourlyTotalEur = o.unit === 'instance-hour' ? unitPriceEur * Math.max(1, Math.ceil(assessment.requiredGpuCount / maxGpusPerInstance)) : unitPriceEur * assessment.requiredGpuCount;
      const monthlyTotalEur = hourlyTotalEur * 24 * 30 * utilization;
      return {
        id:o.id, provider:o.provider, product:o.product, pricingClass:o.pricingClass, currency:o.currency, nativeUnitPrice:o.price, unit:o.unit, unitPriceEur, hourlyTotalEur, monthlyTotalEur, annualTotalEur:monthlyTotalEur*12, utilizationPct:utilization*100,
        compatibility: exact ? 'exact' : 'limited',
        compatibilityNote: exact ? 'Topologia equivalente alla classe hardware selezionata.' : 'Prezzo valido, ma la topologia pubblicata non equivale necessariamente al server multi-GPU selezionato: verificare NVLink/NVSwitch e stock.',
        regions:o.regions || [], billing:o.billing || '', sourceUrl:o.sourceUrl, sourceDate:o.sourceDate, notes:o.notes || ''
      } as CloudOfferResult;
    })
    .sort((a,b) => a.monthlyTotalEur - b.monthlyTotalEur);
}

export function getPurchaseOffers(assessment: HardwareAssessment): PurchaseOfferResult[] {
  return (market.purchaseOffers as any[]).filter(o => o.serverProfileId === assessment.serverProfileId).map(o => {
    const unitPriceEur = fxToEur(o.price,o.currency);
    return { id:o.id, supplier:o.supplier, product:o.product, currency:o.currency, nativeUnitPrice:o.price, unitPriceEur, requiredNodes:assessment.requiredNodes, totalPurchaseEur:unitPriceEur*assessment.requiredNodes, region:o.region, availability:o.availability || '', leadTime:o.leadTime || '', sourceUrl:o.sourceUrl, sourceDate:o.sourceDate, notes:o.notes || '' } as PurchaseOfferResult;
  }).sort((a,b)=>a.totalPurchaseEur-b.totalPurchaseEur);
}

export function getRfqOffers(assessment: HardwareAssessment): RfqOfferResult[] {
  return (market.rfqOffers as any[]).filter(o => (o.serverProfileIds || []).includes(assessment.serverProfileId)).map(o => ({ id:o.id, supplier:o.supplier, product:o.product, region:o.region, sourceUrl:o.sourceUrl, sourceDate:o.sourceDate, notes:o.notes || '' })).sort((a,b)=>a.supplier.localeCompare(b.supplier));
}

export function cheapestExactCloudOffer(input: CalculatorInput, assessment: HardwareAssessment) { return getCloudOffers(input, assessment).filter(o=>o.compatibility==='exact').sort((a,b)=>a.monthlyTotalEur-b.monthlyTotalEur)[0]; }
export function cheapestPurchaseOffer(assessment: HardwareAssessment) { return getPurchaseOffers(assessment)[0]; }
