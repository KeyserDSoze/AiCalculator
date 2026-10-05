# Enterprise AI decision engine

AiCalculator is evolving from an infrastructure sizing tool into an enterprise AI decision engine. The goal is to start from business requirements and finish with a defensible recommendation for models, deployment mode, hardware, providers and economics.

## Decision flow

1. **Company profile**: primary workload, users, peak concurrency, context, output length, data sensitivity, preferred geography, growth, current AI spend and availability target.
2. **Model advisor**: ranks the catalog using weighted coding/general/reasoning scores, context support and an efficiency factor. The company can accept the suggestion or force a model.
3. **Hardware advisor**: evaluates every server family as impossible, strained, recommended or top. Output-token decode pressure now affects capacity.
4. **Resilience**: N-1 adds a redundant replica group and reports the capacity that remains after losing one replica group.
5. **Deployment economics**: compares on-prem, colocation, cloud rental and a planning-level hybrid estimate.
6. **Provider marketplace**: separates price, topology compatibility and geographic fit.
7. **Business case**: compares the recommendation with current annual AI spend and estimates four-year savings and on-prem break-even.
8. **Control plane**: estimates LLMProxy redundancy and audit-storage footprint from users, request rate, payload size and retention.

## Important costing corrections

GPU utilization and cloud billable uptime are different variables. A GPU can be only 55% busy while the allocated instance is billed 100% of the month. Cloud estimates therefore use **billable allocated uptime**, while on-prem power uses **GPU utilization**.

On-prem electricity is no longer modeled as `peak power × utilization`. The planning formula is:

`average power = idle power + (peak power - idle power) × utilization`

This better represents always-on inference servers.

## N-1 semantics

For planning, N-1 means one additional full model-replica group. If a model replica spans two physical nodes, the redundancy allowance is another two-node replica group. The calculator reports nominal capacity and the capacity left after losing one replica group.

This is a planning guardrail, not a replacement for runtime and failure-domain validation.

## Multi-model portfolio

The executive view proposes a three-tier routing portfolio:

- **Primary** model for normal enterprise work;
- **Economy** model for simple/high-volume requests;
- **Reasoning** model for difficult high-value requests.

The current physical sizing still uses the selected model as the capacity anchor. A future release should calculate each routing pool independently and combine them into a complete multi-model fleet.

## Remaining procurement gates

Before a real purchase, replace heuristic capacity with measured `model × precision × runtime × hardware × context` benchmarks and validate:

- TTFT, prefill and decode throughput;
- maximum stable concurrency and queueing latency;
- KV-cache behavior;
- N-1 and failure-domain behavior;
- security/compliance controls;
- provider SLA and support;
- final RFQ including VAT, shipping, storage, egress, installation and negotiated discounts.
