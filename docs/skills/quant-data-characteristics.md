# Quant and Trading Data Characteristics

## Why it matters
- Financial data has gaps, bursts, and irregular intervals.
- Indicators can be expensive and require stable windows.
- Multi-timeframe analysis requires explicit alignment rules.

## What good looks like
- Handles irregular timestamps and missing data explicitly.
- Supports multi-timeframe overlays without ambiguity.
- Maintains stable window semantics for indicators.
- Preserves precision for large time ranges.
- Defines explicit session and holiday handling rules.

## Scope boundaries
- Includes irregular time series and session gaps.
- Includes multi-timeframe alignment and mapping rules.
- Excludes data sourcing or ingestion pipelines.
- Includes corporate action adjustments when required.

## Evidence and artifacts
- Test dataset with gaps and irregular intervals.
- Multi-timeframe overlay validation with expected outcomes.
- Indicator window contract documentation.
- Session boundary rendering examples.

## Review questions
- Are gaps explicit and preserved in rendering?
- Are timebase mappings documented and stable?
- Is precision preserved for long-range data?
- Are session boundaries rendered consistently?

## Common failure modes
- Assuming uniform intervals or continuous data.
- Mixing timebases without explicit mapping.
- Over-smoothing or hiding missing data.
