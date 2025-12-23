# Quality Gates

Rationale: chart-engine governance for Definition of Done; quant-lab owns its own gates.

This file defines the Definition of Done for changes in this repository.
Fill in the commands that apply.

## Required Checks
- tests: `npm run test:contracts`, `npm run test:public-api`, `npm run test:compute`, `npm run test:replay`, `npm run test:pinescript:parity`, `npm run test:auto-debug`
- lint: N/A
- format: N/A
- build: `npm run check`
- security: N/A
- ui_smoke: `npm run test:ui:smoke`

## Definition of Done
- All required checks pass.
- Safety validation completed (`.agentignore`, `.agentpolicy`).
- Action Log updated with evidence.

## Notes
- If a check is not applicable, set it to "N/A".
- If UI/interaction changes occur, set `ui_smoke` to the required command.
