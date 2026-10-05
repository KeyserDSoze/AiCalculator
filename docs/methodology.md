# Methodology

## Workload inputs

The engine currently uses:

1. Maximum model that must be supported.
2. Average user population.
3. Concurrent active users.
4. Average context tokens.
5. Maximum allowed context tokens.
6. Average output tokens.
7. Sizing profile: economy, balanced or performance.

The distinction between average and maximum context is intentional. Configuring a model for a 256K or 1M ceiling does not imply that every session consumes that entire context. Capacity is estimated from the configured average context while the maximum context is used to flag architectural limits and burst risk.

## Inference sizing

The initial implementation derives a conservative estimate of model-weight memory, usable VRAM and KV-cache pressure. It then estimates concurrent sessions per inference node and applies a headroom factor according to the selected sizing profile.

This is a planning model, not a substitute for benchmarking. The catalog is intended to evolve with measured values such as:

- prefilling tokens/s by model, precision and GPU topology;
- decode tokens/s at different batch sizes;
- time-to-first-token percentiles;
- KV-cache bytes/token or measured session memory;
- scheduler queue latency;
- maximum stable concurrency by context bucket.

When measured data is available, those observations should take precedence over generic estimates.

## LLMProxy sizing

LLMProxy is treated as a separate control/data-plane service from GPU inference. It requires CPU, RAM, storage and network capacity but no GPU. The first sizing profile uses one proxy server for ordinary deployments and moves to two instances for larger populations or a performance-oriented profile.

Future versions should size PostgreSQL, Redis, observability storage and audit-log retention independently, since retention of full request and response bodies can dominate disk requirements.

## Cost model

The catalog stores mutable reference prices for hardware, energy, colocation and rental. These values include a date and update cadence and should be refreshed monthly.

For owned hardware the tool separates CAPEX from annualized cost. On-premises estimates add electricity, PUE/cooling, maintenance and a one-time facility fit-out allowance. Colocation adds rack, network and committed power. Rental/cloud converts GPU-hour pricing into a monthly estimate using the selected utilization assumption.

## Recommendation output

The calculator never hides alternatives. It presents all supported deployment modes and lets the user choose the preferred one after seeing CAPEX, monthly cost, annualized cost, inferred capacity, warnings and assumptions. The saved scenario preserves both the selected inputs and the full set of alternatives for later comparison.
