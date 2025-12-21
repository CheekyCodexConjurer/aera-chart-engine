# Plotting and Objects Mapping

This document maps PineScript drawing APIs to engine primitives and host overlays.

## Core plots
| PineScript | Host normalization | Engine primitive |
| --- | --- | --- |
| plot | series line/area/histogram | line/area/histogram series |
| plotshape | marker series | marker |
| plotchar | label series | label |
| plotcandle | candle series | candles |
| hline | constant series or segment | hline |

## Objects
| PineScript | Host normalization | Engine primitive |
| --- | --- | --- |
| line.new | object with two anchors | line |
| box.new | object with two corners | zone (filled) or box primitive |
| label.new | point label | label |
| polyline.new | point list | line |

## Fills
- fill between two plots maps to a zone primitive with top and bottom series.
- Host resolves pairings; engine renders filled zones.

## Tables
- table.* maps to host DOM overlays.
- Engine provides coordinate conversions and plot area metrics only.

## Unsupported primitive policy
- Any unsupported primitive emits a diagnostic.
- Host may replace with a DOM overlay or drop explicitly.
