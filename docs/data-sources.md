# Data sources and scoring

The calculator keeps a versioned planning catalog in `src/data/catalog.json`. The catalog intentionally separates vendor specifications from market-price estimates.

## Model capability indexes

`coding`, `general` and `thinking` are normalized planning indexes from 0 to 100. They are not copied from one benchmark and should not be read as a literal probability of success.

The initial indexes are synthesized from public model-card results and benchmark evidence such as SWE-bench / Terminal-Bench / code evaluations, MMLU-style knowledge tests, GPQA and competition-math / reasoning evaluations. They exist to make model selection easier in an infrastructure planning workflow.

When we have a repeatable internal benchmark suite, internal results should take priority over these planning indexes.

Primary references currently include:

- Qwen3-Coder: https://qwenlm.github.io/blog/qwen3-coder/
- OpenAI gpt-oss: https://openai.com/open-models/ and https://deploymentsafety.openai.com/gpt-oss
- Mistral Large 3: https://docs.mistral.ai/models/mistral-large-3-25-12
- GLM-5.2: https://huggingface.co/zai-org/GLM-5.2
- NVIDIA Nemotron 3 Ultra: https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-NVFP4
- Gemma 3: https://huggingface.co/google/gemma-3-27b-it
- DeepSeek: https://huggingface.co/deepseek-ai
- Llama 4: https://huggingface.co/meta-llama

## Hardware catalog

The catalog includes enterprise PCIe GPU servers, 8-GPU HGX/DGX systems and rack-scale GB200/GB300 systems.

Relevant specification and pricing references:

- NVIDIA DGX B200 specs: https://www.nvidia.com/en-eu/data-center/dgx-b200/
- NVIDIA GB200 NVL72 specs: https://www.nvidia.com/en-eu/data-center/gb200-nvl72/
- NVIDIA GB300 NVL72 specs: https://www.nvidia.com/en-eu/data-center/gb300-nvl72/
- Public configured HGX B200 example: https://configurator.sabrepc.com/configure/ES4-8793011
- 2026 GPU server market references: https://upstation.io/gpu-servers
- 8x RTX PRO 6000 EU market example: https://kentino.com/it/products/k-ai-768-turindual-rtxpro6000mq-16000tops-8-rtx-pro-6000-blackwell-max-q-ai-frontier-server-dual-turin

Prices are planning values, dated in the JSON, and should be refreshed monthly. A procurement decision must use a current RFQ.

## On-prem cost model

The on-prem scenario separates:

- server and LLMProxy purchase CAPEX;
- one-time datacenter/facility fit-out;
- IT electricity using the user-entered EUR/kWh price;
- variable cooling overhead derived from PUE;
- fixed annual cooling/facility cost;
- maintenance as a percentage of hardware CAPEX;
- amortization period;
- four-year TCO.

This is intentionally configurable because electricity and cooling economics vary substantially by site.

## Capacity methodology

Capacity remains a transparent heuristic until measured runtime benchmarks are available. It considers:

- model weight memory by planning precision profile;
- usable VRAM headroom;
- average context pressure;
- estimated KV-cache pressure;
- server relative inference index;
- requested concurrency and sizing headroom;
- multi-node sharding when a model cannot fit in one server.

For procurement, add measured vLLM or SGLang data for each `model × precision × server × context bucket` combination.
