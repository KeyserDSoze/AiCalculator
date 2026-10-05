# Methodology

## Workload inputs

The engine uses the largest model that must be supported, average user population, peak concurrent users, average and maximum context, average output size, and a sizing profile (economy, balanced, performance).

Average context drives steady-state capacity. Maximum context is a hard architectural check and a burst-risk signal: configuring 256K or 1M does not mean every request consumes the entire window.

## Inference sizing

The planning engine estimates model-weight memory from the selected sizing profile, usable VRAM, KV-cache pressure, compute pressure and the number of replicas required for the requested concurrency. The result is deliberately conservative and must be replaced by measured runtime benchmarks before procurement.

Measured data should eventually override heuristics for prefilling tokens/s, decode tokens/s, TTFT, KV-cache bytes/token, scheduler latency and maximum stable concurrency by context bucket.

## Hardware feasibility advisor

Every inference server family is evaluated against the same workload and is assigned one of four states:

- **Impossible**: the requested model/context is outside the model limit, or a single model replica would require more physical nodes than the practical sharding limit assigned to that hardware class.
- **Strained**: technically feasible, but the design relies on multi-node sharding, weak inter-node fabric, a hardware tier below the model guidance, very high VRAM occupancy, or too little per-replica concurrency.
- **Recommended**: technically sensible with manageable horizontal scaling and no major topology warning.
- **Top**: the model fits in one replica with strong memory margin and one replica alone already covers at least roughly the requested peak concurrency with additional performance margin.

Practical sharding limits are planning guardrails, not vendor guarantees: enterprise GPU servers are limited to 2 nodes per replica, datacenter systems to 4, frontier systems to 8, and rack-scale profiles are treated as one integrated system. These limits prevent the calculator from presenting a theoretically possible but operationally unreasonable cluster as a normal solution.

For each hardware family the advisor exposes required node count, nodes per model replica, total GPUs/VRAM, estimated concurrent capacity, capacity headroom, model-weight VRAM utilization, acquisition CAPEX and peak IT power. A forced hardware selection keeps its warning status visible; Auto avoids options classified as impossible.

## LLMProxy sizing

LLMProxy remains separate from GPU inference. It requires CPU, RAM, storage and network capacity but no GPU. The current model uses one proxy server for ordinary deployments and two for larger populations or a performance-oriented profile.

Future versions should size PostgreSQL, Redis, observability storage and request/response audit retention independently.

## Cost model

The catalog stores mutable reference prices for hardware, electricity, colocation and rental. Values include an update date and should be refreshed monthly.

Owned on-prem hardware separates server CAPEX from electricity, variable PUE/cooling overhead, fixed cooling cost, maintenance, hardware amortization and facility fit-out. Colocation adds rack, network and committed power. Rental/cloud converts server-hour pricing into monthly operating cost.

## Recommendation output

The calculator does not hide alternatives. It shows hardware feasibility first, then deployment scenarios. PDF and Excel exports preserve the selected workload, hardware advisor results, deployment costs and assumptions so the decision can be reviewed later.
