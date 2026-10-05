# AI Infrastructure Calculator

This project estimates the infrastructure required to serve enterprise LLM workloads through LLMProxy.

## Goals

The calculator starts from workload assumptions rather than hardware. The user selects the largest model that must be supported, average and peak concurrency, average and maximum context length, expected output size and a sizing philosophy. The engine then produces multiple comparable scenarios instead of a single answer.

The first three deployment scenarios are:

- **On-premises**: hardware owned and hosted internally, including facility allowance, electricity, cooling/PUE and maintenance.
- **Colocation**: hardware owned by the company but hosted in a datacenter, including rack, committed power and network reference costs.
- **Rental/cloud**: no server CAPEX, with GPU-hours and proxy hosting treated as operating expenditure.

## Sizing profiles

- **Economy / conservative** prioritizes acquisition cost and accepts less performance headroom and more queueing risk.
- **Balanced** adds sensible concurrency headroom and is the default recommendation for business planning.
- **Performance** reserves more headroom and may deploy redundant LLMProxy instances earlier.

## Important limitation

The initial engine is deliberately transparent and heuristic. Long-context inference depends heavily on the exact model architecture, precision, inference runtime, KV-cache representation, batching and measured tokens-per-second. The JSON catalog therefore separates known vendor specifications from mutable cost estimates. Production procurement should replace estimates with vendor quotes and benchmark measurements.

## Local persistence and exports

Saved calculations live in the browser's `localStorage`. No backend is required. A scenario can be restored later and exported to PDF or Excel together with the alternatives considered.
