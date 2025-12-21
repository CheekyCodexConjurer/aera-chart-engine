# PineScript Compatibility Index

This section documents how PineScript features are mapped into the Aera engine contract and host runtime. It is documentation-only and does not imply implementation.

## Scope boundaries
- PineScript execution, strategy logic, and data requests are host-owned.
- The engine only renders primitives and enforces contracts (time domain, clipping, limits).
- The goal is full feature parity through a compatibility layer in the host.

## Canonical pipeline
PineScript -> host runtime -> Plot API normalization -> engine primitives

## Documents
- `compatibility-matrix.md` - feature coverage map and ownership.
- `execution-model.md` - bar-by-bar semantics and replay alignment.
- `type-system.md` - series vs simple vs input semantics.
- `plotting-and-objects.md` - plots, objects, and overlays mapping.
- `timeframes-and-request.md` - request.security and multi-timeframe rules.
- `strategy-and-orders.md` - strategy features and rendering implications.
- `style-and-colors.md` - tokenized styling and theme resolution.
- `limits-and-performance.md` - limits, budgets, and enforcement.
- `interop-contract.md` - host and engine responsibilities for PineScript parity.
- `catalog/INDEX.md` - full PineScript catalog (functions, variables, constants, keywords, types).
