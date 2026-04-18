## Layer Navigation Protocol

ForgeCraft tracks automation depth across four active layers. Before beginning
implementation work, call `layer_status` to understand the current state.

| Layer | What it means | How to advance |
|---|---|---|
| **L1 Blueprint** | Use case documented + implementation + tests | Write formal UC, implement, add tests |
| **L2 Harness** | Use case has executable probe in `.forgecraft/harness/` | Create `uc-NNN.yaml` with probe definitions |
| **L3 Environment** | All infra state derivable from spec | Add CI, Dockerfile, env schema to spec |
| **L4 Monitoring** | Runtime drift evaluated against spec | Add health probes, drift detection config |

**Layer completion is a spec gap, not a todo list.** A missing L2 probe is not
something to schedule — it is an incomplete grammar. The gate fires until the probe exists.

**L2 probe types available**: `mcp_call`, `playwright`, `api_call`, `db_query`,
`file_system`, `headless_sim`

**To add a probe**: create `.forgecraft/harness/uc-NNN.yaml` following the format
in any existing probe file. One probe is enough to move a UC from ❌ to ✅.
