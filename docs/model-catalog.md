# Expanded model catalog

AiCalculator keeps the fast-moving model catalog separate from the hardware and market catalogs. `src/data/models-expanded.json` currently contains 46 representative open/open-weight models across the most relevant families for enterprise self-hosting.

## Families covered

- Qwen3, Qwen3.5, Qwen3.6 and Qwen3-Coder: from sub-1B dense models to 480B MoE coding models.
- OpenAI gpt-oss: 20B and 120B reasoning tiers.
- DeepSeek: distilled 7B/32B/70B models plus R1 and V3.2 frontier MoE models.
- Meta Llama: 1B/3B/8B/70B text models and Llama 4 Scout/Maverick multimodal MoE models.
- Google Gemma 3: 1B, 4B, 12B and 27B.
- Microsoft Phi-4: compact 3.8B and 14B reasoning models.
- Mistral: Ministral 3, Mistral Small and Mistral Large tiers.
- Z.ai GLM: GLM-4.5 Air, GLM-4.5 and GLM-5.2.
- NVIDIA Nemotron 3: Nano, Super and Ultra.
- Moonshot Kimi K2 and MiniMax M2.

## Size information

Every record keeps both `parametersTotalB` and `parametersActiveB`. This matters for sparse Mixture-of-Experts models: total parameters drive weight-memory requirements, while active parameters are a useful signal for compute cost per generated token.

The UI groups models into practical size bands and exposes total parameters, active parameters, architecture, maximum context, license and normalized Coding / General / Thinking indexes.

## Value score

The model catalog also exposes a planning-oriented value ranking that combines capability with parameter efficiency. It intentionally surfaces strong small models instead of always ranking the largest frontier model first. The score is a shortlist heuristic, not a benchmark result or a procurement guarantee.

## Hardware implication

Two compact inference profiles (1x and 2x RTX PRO 6000 Blackwell) are injected into the planning catalog so sub-40B models are not automatically mapped to a four-GPU server. These are planning profiles and should be replaced with current OEM/reseller quotes before procurement.

## Maintenance

Model releases move quickly. Refresh this file at least monthly, keep vendor/model-card sources attached to each record, and prefer measured internal benchmarks when available. Do not interpret a normalized 0–100 capability index as a literal benchmark percentage.
