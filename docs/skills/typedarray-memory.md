# TypedArray and Memory Management

## Why it matters
- Large datasets require predictable memory use.
- GC pauses are unacceptable during interaction.
- Data copying can dominate cost if not controlled.

## What good looks like
- Uses TypedArray pooling and explicit ownership rules.
- Avoids per-frame allocations and object churn.
- Enforces hard caps for caches and buffers.
- Uses transfer or shared buffers for cross-thread data.
- Documents buffer alignment and stride assumptions.

## Scope boundaries
- Includes buffer pooling, ownership rules, and transfer semantics.
- Includes cache caps and eviction behavior.
- Excludes UI-level caching unrelated to data rendering.
- Includes SharedArrayBuffer safety and synchronization rules.

## Evidence and artifacts
- Allocation profiles during pan and zoom.
- Buffer pool size reports and reuse rates.
- Copy count analysis for data ingestion and compute.
- Memory cap configuration and enforcement proof.

## Review questions
- Are allocations eliminated from hot paths?
- Are array copies necessary and documented?
- Are buffer lifetimes explicit and enforced?
- Are pools bounded and measured?

## Common failure modes
- Hidden allocations in hot paths.
- Unbounded caches or buffer growth.
- Accidental copies of large arrays.
