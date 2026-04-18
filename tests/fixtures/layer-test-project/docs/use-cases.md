# Use Cases

## UC-001: Setup Project

**Actor**: Developer
**Precondition**: Project directory exists
**Trigger**: `setup_project` with `project_dir`
**Main Flow**:
  1. Developer calls setup_project
  2. ForgeCraft generates scaffold
**Postcondition**: Project is scaffolded
**Error Cases**:
  - Directory missing: return error
**Acceptance Criteria** (machine-checkable):
  - [ ] forgecraft.yaml exists

---

## UC-002: Verify Cascade

**Actor**: Developer
**Precondition**: Project onboarded
**Trigger**: `check_cascade` with `project_dir`
**Main Flow**:
  1. Developer calls check_cascade
  2. ForgeCraft runs checks
**Postcondition**: Cascade results returned
**Error Cases**:
  - Missing config: return unconfigured
**Acceptance Criteria** (machine-checkable):
  - [ ] Output contains step results
