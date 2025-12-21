# Style and Colors Mapping

This document defines how PineScript color and style semantics map to safe tokens.

## Tokenized styling
- Host resolves PineScript color functions into theme tokens.
- Engine receives style references and applies resolved values.
- No CSS or raw styling strings cross the boundary.

## Supported style channels
- Stroke: color token, width token, dash token.
- Fill: color token, opacity.
- Text: color token, size, weight.

## PineScript mapping rules
- color.new -> token + opacity.
- color.from_gradient -> host gradient resolution.
- plot.style_* -> host mapping to engine series type.

## Diagnostics
- Invalid or unknown style refs emit diagnostics.
- Missing tokens fall back to engine defaults.
