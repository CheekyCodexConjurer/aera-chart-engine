# Responsiveness SLOs

This document defines explicit latency targets for quant-lab critical actions.

## Measurement method
- Use trace capture and histogram reporting.
- Report p50 and p95 for each action.
- Use the same dataset and hardware profile per run.

## SLO targets (p50 / p95)
| Action | Target |
| --- | --- |
| Timeframe switch: time-to-first-meaningful-frame | 200 ms / 500 ms |
| Timeframe switch: time-to-full-detail | 1000 ms / 2000 ms |
| Indicator toggle: time-to-visible-change | 100 ms / 250 ms |
| Replay scrub: input-to-visual latency | 50 ms / 100 ms |
| Last candle update: time-to-render | 50 ms / 100 ms |
| Pan/zoom under 2k visible points | 12 ms / 16.6 ms frame time |

## Reporting requirements
- Include dataset size and visible range.
- Include overlay count and indicator count.
- Include CPU and GPU memory deltas.

## Enforcement
- Failing SLOs blocks merge unless explicitly waived.
