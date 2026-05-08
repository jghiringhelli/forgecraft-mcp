# ForgeCraft MCP — Tool Schema Reference

> **Living document.** Derived from Zod schemas in `src/tools/forgecraft-schema.ts`
> and `src/tools/forgecraft-schema-params.ts`. Run `npm run docs:generate` for full
> TypeDoc output. This file is the human-readable summary.

---

## MCP Tools

ForgeCraft exposes two MCP tools:

| Tool | Purpose | Token cost |
|---|---|---|
| `forgecraft` | Lightweight sentinel — setup-time diagnosis and next-step guidance | ~200 tokens |
| `forgecraft_actions` | Full action router — all lifecycle operations | ~1,500 tokens |

---

## `forgecraft_actions` — Action Router

**Required parameter:** `action` (string, one of the actions below)  
**Common parameter:** `project_dir` (string, absolute path to project root)

### Lifecycle

| Action | Description | Key params |
|---|---|---|
| `setup_project` | Two-phase greenfield/brownfield setup | `project_dir`, `spec_path`, `mvp`, `scope_complete`, `has_consumers` |
| `refresh` | Re-sync instruction files after project changes | `project_dir`, `apply`, `add_tags`, `remove_tags` |
| `scaffold` | Generate project structure and rules files | `project_dir`, `tags`, `language`, `output_targets` |
| `generate` | Generate instruction files only | `project_dir`, `tags`, `output_targets`, `merge` |
| `convert` | Migration plan for existing projects | `project_dir` |

### Analysis & Audit

| Action | Description | Key params |
|---|---|---|
| `audit` | Score compliance 0-100 against standards | `project_dir`, `tags` |
| `verify` | Run tests + score GS properties + layer violations | `project_dir`, `test_command` |
| `metrics` | LOC, coverage, violations, dead code, complexity | `project_dir` |
| `classify` | Suggest tags for a project | `project_dir`, `description` |
| `check_cascade` | Verify all cascade steps complete (L1 gate) | `project_dir` |
| `check_spec_consistency` | Scan spec for gaps, hollow probes, ambiguity markers | `project_dir` |
| `read_gate_violations` | Surface active gate violations | `project_dir` |
| `layer_status` | L1–L4 completion per use case | `project_dir` |

### Session & Roadmap

| Action | Description | Key params |
|---|---|---|
| `advise_session` | Session-start advisor — signals + prioritised advice | `project_dir`, `max_items` |
| `generate_session_prompt` | Bound, self-contained LLM prompt for one roadmap item | `project_dir`, `item_description`, `roadmap_item_id` |
| `propose_session` | Pre-implementation impact assessment | `project_dir`, `item_description` |
| `generate_roadmap` | Phased roadmap from PRD + use-cases | `project_dir` |
| `consolidate_status` | Aggregate project state into Status.md | `project_dir` |
| `close_cycle` | End-of-cycle: cascade re-check, gate promotion | `project_dir` |

### Probes (L2–L4)

| Action | Description | Key params |
|---|---|---|
| `generate_harness` | Scaffold L2 harness probe files | `project_dir`, `harness_uc_ids` |
| `run_harness` | Execute harness probes, report per-UC pass/fail | `project_dir`, `harness_timeout_ms` |
| `generate_env_probe` | Create L3 environment verification probes | `project_dir` |
| `run_env_probe` | Execute environment probes | `project_dir`, `env_probe_timeout_ms` |
| `generate_slo_probe` | Create L4 SLO validation probes | `project_dir` |
| `run_slo_probe` | Execute SLO probes | `project_dir`, `slo_probe_timeout_ms` |
| `start_hardening` | Generate hardening session prompts | `project_dir`, `release_phase`, `deployment_url` |

### Generation

| Action | Description | Key params |
|---|---|---|
| `generate_adr` | Create an Architecture Decision Record | `project_dir`, `adr_title`, `adr_context`, `adr_decision` |
| `generate_diagram` | Generate Mermaid C4 context diagrams | `project_dir` |
| `get_reference` | Design patterns, NFRs, playbook guidance | `project_dir`, `resource` |
| `get_verification_strategy` | Uncertainty-aware verification plan | `project_dir`, `uncertainty_level` |
| `get_nfr` | Non-functional requirements by tag | `tags` |
| `advice` | Quality cycle checklist + tool recommendations | `project_dir` |
| `review` | Code review checklist | `tags`, `scope` |
| `list` | Discover tags, hooks, or skills | `resource` (tags\|hooks\|skills), `tag` |

### Configuration

| Action | Description | Key params |
|---|---|---|
| `add_hook` | Install a quality-gate hook | `project_dir`, `name`, `tag` |
| `add_module` | Scaffold a feature module | `project_dir`, `name` |
| `configure_mcp` | Configure MCP servers in settings.json | `project_dir`, `custom_servers` |
| `set_cascade_requirement` | Mark a cascade step required or optional | `project_dir`, `cascade_step`, `cascade_required` |
| `contribute_gate` | Submit a quality gate to the community registry | `project_dir` |
| `cnt_add_node` | Add a CNT leaf node | `project_dir`, `cnt_domain`, `cnt_concern`, `cnt_content` |

---

## Output Targets

| Target | File | Agent |
|---|---|---|
| `claude` | `CLAUDE.md` | Claude Code |
| `cursor` | `.cursor/rules/project-standards.mdc` | Cursor |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `windsurf` | `.windsurfrules` | Windsurf |
| `cline` | `.clinerules` | Cline |
| `aider` | `CONVENTIONS.md` | Aider |

---

## Source of Truth

All parameter schemas are defined in:
- `src/tools/forgecraft-schema.ts` — action enum + common params
- `src/tools/forgecraft-schema-params.ts` — action-specific params

Full TypeDoc output: `npm run docs:generate` → `docs/api/`
