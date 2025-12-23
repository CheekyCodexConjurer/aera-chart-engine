# Engine Compatibility Matrix

Rationale: compatibility policy is engine-owned; host adapter implementation stays in the host repo.

## Matrix
| Host Adapter Version | Engine Version | Engine Contract Version | Status | Notes |
| --- | --- | --- | --- | --- |
| 0.0.0 (baseline) | 0.1.0 | 0.4.0 | supported | Host adapter versioning is external; update this row when the host publishes a tagged adapter. |

## Support window
- Engine supports the last 2 minor contract versions.
- Hosts must validate `engineContractVersion` during initialization.
- Update this table on every release.
