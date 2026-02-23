# Feature Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add a fail-fast rollout preflight that validates repo context, required rollout scripts, and Railway project/environment/service linkage before any rollout action can run.

## Critical Decisions
- Decision 1: Shared preflight script for all rollout entrypoints - one validation path avoids drift.
- Decision 2: Hard fail when cwd is not the canonical rollout worktree - prevents accidental use from stale clones.

## Tasks:

- [x] 🟩 **Step 1: Build Preflight Guard**
  - [x] 🟩 Subtask 1
  - [x] 🟩 Subtask 2

- [x] 🟩 **Step 2: Wire Guard Into Rollout Scripts**
  - [x] 🟩 Subtask 1
  - [x] 🟩 Subtask 2
  - [x] 🟩 Subtask 3
  - [x] 🟩 Subtask 4

- [x] 🟩 **Step 3: Update Operator Docs**
  - [x] 🟩 Subtask 1
  - [x] 🟩 Subtask 2

- [x] 🟩 **Step 4: Validate Behavior**
  - [x] 🟩 Subtask 1
  - [x] 🟩 Subtask 2
  - [x] 🟩 Subtask 3

## Validation Notes
- `bash -n` passed for all rollout/preflight shell scripts.
- Wrong repo context check verified:
  - running preflight from `/Users/thewhitley/Documents/New project` fails with explicit `cd` remediation.
- Wrong project context check verified with deterministic mock:
  - `BLACKBOLT_EXPECTED_PROJECT=WrongProject` fails with explicit `railway link` remediation.
- Real Railway preflight remains sensitive to transient Railway DNS/backboard availability; retry behavior is built in.

## Guardrails
- Status emojis only:
  - 🟩 Done
  - 🟨 In Progress
  - 🟥 To Do
- No extra scope or unnecessary complexity.
