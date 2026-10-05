import expandedModels from '../data/models-expanded.json';
import {
  DEFAULT_INPUT,
  assessHardware as coreAssessHardware,
  calculate as coreCalculate
} from './calculatorCore';
import type {
  AvailabilityMode,
  BusinessProfile,
  CalculatorInput,
  DataSensitivity,
  HardwareAssessment,
  HardwareFit,
  RegionPreference,
  ScenarioResult,
  Strategy
} from './calculatorCore';

export { DEFAULT_INPUT };
export type {
  AvailabilityMode,
  BusinessProfile,
  CalculatorInput,
  DataSensitivity,
  HardwareAssessment,
  HardwareFit,
  RegionPreference,
  ScenarioResult,
  Strategy
};

function modelFor(input: CalculatorInput) {
  return (expandedModels as any[]).find(model => model.id === input.modelId) || (expandedModels as any[])[0];
}

function guardedInput(rawInput: CalculatorInput) {
  const model = modelFor(rawInput);
  const modelMax = Math.max(1, Number(model?.maxExtendedContextTokens || model?.nativeContextTokens || 1));
  const requestedAverage = Math.max(1, Number(rawInput.averageContextTokens || 1));
  const requestedMax = Math.max(1, Number(rawInput.maxContextTokens || 1));
  const averageExceedsModel = requestedAverage > modelMax;
  const maxExceedsModel = requestedMax > modelMax;

  const effective: CalculatorInput = {
    ...rawInput,
    averageContextTokens: averageExceedsModel ? modelMax : requestedAverage,
    maxContextTokens: maxExceedsModel ? modelMax : requestedMax
  };

  if ((averageExceedsModel || maxExceedsModel) && effective.averageContextTokens > effective.maxContextTokens) {
    effective.averageContextTokens = effective.maxContextTokens;
  }

  return { model, modelMax, requestedAverage, requestedMax, averageExceedsModel, maxExceedsModel, effective };
}

export function assessHardware(rawInput: CalculatorInput): HardwareAssessment[] {
  const guard = guardedInput(rawInput);
  const assessments = coreAssessHardware(guard.effective);

  if (guard.averageExceedsModel) {
    return assessments.map(item => ({
      ...item,
      status: 'impossible' as HardwareFit,
      statusScore: 0,
      reasons: [
        `Il context medio richiesto (${guard.requestedAverage.toLocaleString()} token) supera il limite del modello ${guard.model?.name} (${guard.modelMax.toLocaleString()} token). Nessun hardware può correggere questo limite del modello.`,
        ...item.reasons
      ]
    }));
  }

  if (guard.maxExceedsModel) {
    return assessments.map(item => ({
      ...item,
      reasons: [
        `Il picco richiesto (${guard.requestedMax.toLocaleString()} token) supera il limite del modello ${guard.model?.name} (${guard.modelMax.toLocaleString()} token). Il sizing hardware usa il carico medio, ma questo modello non soddisfa il requisito massimo.`,
        ...item.reasons
      ]
    }));
  }

  return assessments;
}

export function calculate(rawInput: CalculatorInput): ScenarioResult[] {
  const guard = guardedInput(rawInput);
  const results = coreCalculate(guard.effective);

  if (!guard.averageExceedsModel && !guard.maxExceedsModel) return results;

  return results.map(result => {
    const warnings = [...result.warnings];
    const notes = [...result.notes];

    if (guard.maxExceedsModel) {
      warnings.unshift(
        `MODEL CONTEXT LIMIT: richiesti fino a ${guard.requestedMax.toLocaleString()} token, ma ${guard.model?.name} supporta ${guard.modelMax.toLocaleString()}. I costi sono dimensionati sul carico medio e sul limite effettivo del modello; il requisito di picco non è coperto.`
      );
      notes.unshift(
        `Context planning capped to ${guard.modelMax.toLocaleString()} tokens for ${guard.model?.name}; requested maximum was ${guard.requestedMax.toLocaleString()}.`
      );
    }

    if (guard.averageExceedsModel) {
      warnings.unshift(
        `BLOCKER: anche il context medio (${guard.requestedAverage.toLocaleString()}) supera il limite di ${guard.model?.name} (${guard.modelMax.toLocaleString()}). Le cifre mostrate sono solo una baseline al limite del modello e NON soddisfano il workload richiesto.`
      );
    }

    return {
      ...result,
      hardwareFit: guard.averageExceedsModel ? ('impossible' as HardwareFit) : result.hardwareFit,
      warnings,
      notes
    };
  });
}
