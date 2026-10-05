# Provider and price catalog

`src/data/market.json` contains the versioned public price list used by the calculator for cloud rental and server purchase comparisons.

## What is stored

Each cloud offer records provider, product, GPU family, pricing class (on-demand/reserved), public unit price, currency, billing unit, region, topology compatibility, source URL and source date. Each purchase offer records supplier, exact server class, public configured price, currency, region, lead-time information and source URL. Quote-only suppliers are stored separately so the UI can distinguish a public price from an RFQ.

## Ranking

The calculator converts USD list prices to EUR using the rate stored in `market.json`, then calculates the cost of the GPU quantity required by the hardware advisor. Cloud offers are ranked by estimated monthly cost using the workload profile utilization assumption. The UI highlights the cheapest offer whose documented topology is compatible with the selected hardware. Cheaper single-GPU offers can still be shown but are marked as requiring topology verification when the workload depends on an HGX/NVLink/NVSwitch multi-GPU node.

Purchase offers are ranked by total public purchase cost for the number of nodes required by the sizing engine. VAT, shipping, duties, installation and site integration are not added unless explicitly present in the source price.

## Update policy

Refresh the catalog at least monthly and whenever a provider announces a price change. Preserve the original currency and source URL, update `sourceDate`, and update `meta.usdToEur` with the current conversion rate. A price must not be marked as a public price when the supplier only exposes a contact-sales form.

Current source families include Runpod, Hyperstack, Nebius, Seeweb, Crusoe, Lambda, CoreWeave, UpStation, SabrePC, HPE and NVIDIA partner channels.
