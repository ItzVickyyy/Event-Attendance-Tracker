# Claude Account Rotation System (CARS) v1.0

## 1. Purpose

CARS provides a repository-first workflow for using multiple Claude accounts as interchangeable development workers.

The core principle is:

> **Claude accounts are interchangeable workers; the Git repository and project documentation are the source of truth.**

Claude conversations are disposable working sessions. A new worker must be able to continue from the repository, Git history, and documented task state without requiring the previous conversation.

This workflow does not replace the existing OpenCode/OmniRoute workflow. It provides an additional structured workflow for Claude.

A second principle governs how work is divided between roles:

> **Planning is front-loaded. Implementation workers execute approved plans rather than independently redesigning them.**

The ChatGPT coordinator is the primary reasoning and decision-making authority. ARCHITECT is a delegated deep-analysis role that ChatGPT uses for repository-scale investigation and planning; it does not replace the coordinator's decision-making, and its output (the plan) is what the coordinator turns into concrete instructions for IMPLEMENTER. IMPLEMENTER, VERIFIER, and RECOVERY are execution/evidence roles, not planning roles — see Role Authority & Modification Rules below.

### Sandbox execution model

Claude.ai (Free-tier) workers operate in a **disposable sandbox clone** of the repository, not in the authoritative local repository. There are three distinct Git states in this workflow, and they are not the same thing:

```text
SANDBOX GIT STATE          — inside the Claude.ai worker's temporary clone
AUTHORITATIVE LOCAL STATE  — the user's local repository (the real source of truth)
GITHUB REMOTE STATE        — the shared persistent copy the local repo pushes to/pulls from
```

A worker without direct, persistent access to the authoritative local repository must not claim that local files were changed, committed, or pushed. It must instead produce a **transfer artifact** — the exact changed/new files, or a patch — that the coordinator (the user) manually applies to the authoritative local repository. A commit made inside the sandbox is optional bookkeeping for that sandbox only; it is never treated as part of the project's real Git history until the user has applied the transfer artifact locally, verified it, committed it, and pushed it.

The roles in this document therefore split across two different actors:

```text
CLAUDE.AI          = worker / sandbox (ARCHITECT, IMPLEMENTER, REVIEWER, VERIFIER, RECOVERY)
YOU                 = repository integrator (applies transfer artifacts, runs authoritative
                      verification, commits, pushes to GitHub)
GITHUB              = shared persistent source
CARS DOCS           = workflow coordination
CHATGPT             = coordinator / reviewer
```

## 2. Roles

CARS defines five logical roles. Account identity is not permanently tied to a role.

| Role | Primary job |
|---|---|
| ChatGPT (coordinator) | Reasoning, decision-making, prompt generation, report evaluation |
| ARCHITECT | Deep investigation, analysis, design, planning |
| IMPLEMENTER | Execution only |
| VERIFIER | Testing / evidence only |
| REVIEWER | Independent specification/code review |
| RECOVERY | Execute a narrowly defined repair |

### R1 — ARCHITECT

Purpose:

- understand requirements
- inspect the repository
- reconcile specification vs implementation
- design implementation strategy
- identify risks
- produce an implementation plan

Default contract:

```text
Inspect → Analyze → Plan → Report → STOP
```

Normally read-only. It must not modify implementation unless explicitly assigned implementation work.

### R2 — IMPLEMENTER

Execution-only role. IMPLEMENTER executes an approved, concrete implementation specification — it is not a second ARCHITECT and does not independently plan, redesign, or expand scope.

Purpose:

- read the assigned files and the approved instructions
- locate the exact code to change
- implement exactly what was specified
- add/update tests as specified
- run the specified tests inside the sandbox
- commit inside the sandbox if useful for its own tracking (optional, non-authoritative)
- present every changed/new file, or an exact patch, as the transfer artifact for the coordinator
- report exactly what changed and what was verified

Allowed:

- read the assigned files
- understand the provided instructions
- locate the exact code to change
- make the specified changes
- run the specified tests
- report results

Not allowed:

- redesign the task
- invent requirements
- expand scope
- decide that a different architecture is better
- perform unrelated refactoring
- "improve" things not requested
- turn a verification failure into a new design exercise
- claim that files were changed, committed, or pushed in the authoritative local repository or on GitHub — the sandbox clone is not that repository

Inspection is not the same as planning: IMPLEMENTER still inspects the assigned files before touching anything, but it does so to locate and apply the specified change, not to reconsider whether the change is the right one. If the provided instructions are ambiguous, incomplete, or appear wrong, IMPLEMENTER stops and reports back rather than deciding on its own.

Default contract:

```text
Inspect → Implement (as specified) → Test → Produce Transfer Artifact → Report → STOP
```

("Produce Transfer Artifact" means: present the changed/new files or an exact patch. A sandbox commit, if made, is optional and supplementary to this — it does not replace it.)

An approved implementation specification handed to IMPLEMENTER should be concrete enough to execute without rediscovering the problem:

```text
OBJECTIVE
CURRENT CONTEXT
EXACT FILES
EXACT CHANGES
IMPLEMENTATION RULES
SCOPE
TESTS TO RUN
EXPECTED RESULT
GIT INSTRUCTIONS
STOP CONDITIONS
```

### R3 — REVIEWER

Purpose:

- independently inspect an implementation
- compare it against the specification
- identify missing requirements
- identify regressions
- inspect the Git diff
- challenge unsupported completion claims

Default contract:

```text
Inspect → Compare → Identify Issues → Report → STOP
```

Normally read-only.

### R4 — VERIFIER

Purpose:

- execute tests
- run lint/type checks
- verify migrations
- verify builds
- verify application behavior where practical
- confirm Git state

The Verifier answers:

> Does this actually work?

rather than merely:

> Does this look reasonable?

Default contract:

```text
Inspect → Execute Checks → Report Evidence → STOP
```

Minimal/no modifications.

### R5 — RECOVERY

Used only when something fails.

Purpose:

- diagnose the exact failure
- identify the root cause
- make the smallest appropriate repair
- avoid unrelated redesign
- rerun verification
- present the changed/new files or an exact patch as the transfer artifact for the coordinator (a sandbox commit is optional and non-authoritative, same as IMPLEMENTER)

Default contract:

```text
Inspect Failure → Identify Root Cause → Minimal Repair → Test → Produce Transfer Artifact → Report → STOP
```

Recovery must not become an excuse for unrelated refactoring.

### Role Authority & Modification Rules

To prevent role drift (e.g. a Verifier deciding to "just fix it while I'm here"), modification and commit authority is explicit per role:

| Role | May modify implementation? | May commit? |
|---|---|---|
| ARCHITECT | ❌ | ❌ |
| IMPLEMENTER | ✅ | ✅ in sandbox, if instructed (non-authoritative; still produces a transfer artifact) |
| REVIEWER | ❌ | ❌ |
| VERIFIER | ❌ | ❌ |
| RECOVERY | ✅, minimal only | ✅ in sandbox, if instructed (non-authoritative; still produces a transfer artifact) |

A role must not exceed this authority even if it believes a fix is small, obvious, or faster to do itself. If a non-implementing role (ARCHITECT, REVIEWER, VERIFIER) identifies a needed change, it reports the issue and stops; it does not make the change.

"May commit" here means committing inside the worker's own disposable sandbox clone, which is optional bookkeeping. It is never a substitute for the transfer artifact (changed files or a patch) that the coordinator applies to the authoritative local repository. See Sandbox execution model above.

## 3. Account assignment

Use labels rather than storing account identities or credentials:

```text
Claude 01
Claude 02
Claude 03
Claude 04
Claude 05
```

Accounts are interchangeable workers.

Example:

```text
Claude 01 → ARCHITECT
Claude 02 → IMPLEMENTER
Claude 03 → REVIEWER
Claude 04 → VERIFIER
Claude 05 → RECOVERY
```

The same account may receive a different role on a later task.

Never store passwords, API keys, authentication tokens, session cookies, or other credentials in the repository.

## 4. Account states

Each account may be represented as:

| State | Meaning |
|---|---|
| `AVAILABLE` | Can receive a task |
| `ACTIVE` | Currently working |
| `HANDOFF` | Finished and waiting for another account |
| `LIMITED` | Usage temporarily unavailable |
| `BLOCKED` | Technical/login problem |
| `RESERVED` | Held for an upcoming task |

Example:

```text
Claude 01 — ACTIVE — ARCHITECT
Claude 02 — ACTIVE — IMPLEMENTER
Claude 03 — AVAILABLE
Claude 04 — LIMITED
Claude 05 — RESERVED
```

State is operational information; it is not a permanent account assignment.

## 5. Repository-first rule

The authoritative local repository and its documentation are the shared memory — not the Claude.ai sandbox. See Sandbox execution model in Section 1 for how those differ.

Preferred flow:

```text
Claude.ai worker (sandbox)
    ↓
performs work in sandbox, verifies as far as possible there
    ↓
produces transfer artifact (changed files / patch)
    ↓
YOU manually apply it to the authoritative local repository
    ↓
YOU run authoritative verification
    ↓
YOU commit
    ↓
YOU push to GitHub
    ↓
documentation/state updated
    ↓
next Claude.ai worker clones the updated repository
```

Do not require the next worker to receive the entire previous conversation.

Before continuing an interrupted task, a replacement worker should clone the current authoritative repository (via GitHub) and inspect:

```text
git status
git diff
git log
docs/WORKFLOW/CLAUDE-HANDOFF.md
docs/WORKFLOW/CLAUDE-TASK-STATE.md
```

Any "git status"/"git diff"/"git log" a worker runs reflects its own sandbox clone, not the authoritative local repository, unless the coordinator has already applied and pushed the previous transfer artifact.

## 6. Task lifecycle

A substantial task normally follows:

```text
PLAN
 ↓
INVESTIGATE
 ↓
APPROVE
 ↓
IMPLEMENT
 ↓
VERIFY
 ↓
REVIEW
 ↓
ACCEPT / RECOVER
 ↓
DOCUMENT
 ↓
NEXT TASK
```

### Worker lifecycle

Within any single task, a worker follows this explicit sequence, so that updating the documents is part of the workflow rather than optional paperwork:

```text
Worker starts
    ↓
Inspect repository + task state (own sandbox clone)
    ↓
Do assigned work (within its Role Authority)
    ↓
Run required verification (as far as possible in sandbox)
    ↓
Update CLAUDE-HANDOFF.md
    ↓
Update CLAUDE-TASK-STATE.md
    ↓
Produce transfer artifact (+ optional sandbox commit, if authorized)
    ↓
Final report
    ↓
STOP
```

The report is what the worker tells the coordinator; the handoff/task-state documents are what the *next worker* reads, once the coordinator has applied the transfer artifact and pushed the update. Both must happen — a report alone does not update shared state, and updated documents alone do not inform the coordinator.

Not every task requires every role.

Small task:

```text
ChatGPT
 ↓
IMPLEMENTER
 ↓
VERIFIER
```

Major task:

```text
ChatGPT
 ↓
ARCHITECT (investigate + produce exact plan)
 ↓
ChatGPT (reviews plan, converts it into a concrete execution prompt)
 ↓
IMPLEMENTER (executes the exact plan only)
 ↓
REVIEWER
 ↓
VERIFIER (reports evidence, does not fix)
 ↓
ChatGPT (determines PASS / FAIL / BLOCKED)
 ↓
RECOVERY if required, on a specific repair instruction from ChatGPT
```

## 7. Account switching

Do not switch accounts in the middle of an uncommitted implementation unless necessary.

Preferred:

```text
finish task
↓
produce transfer artifact (+ optional sandbox commit)
↓
YOU apply it to the authoritative local repository (commit + push if ready)
↓
handoff
↓
next worker
```

If a worker reaches a usage limit mid-task:

```text
LIMITED
↓
save current state (transfer artifact for any completed work, even partial)
↓
update handoff
↓
YOU apply what's ready to the authoritative local repository
↓
replacement worker clones the updated repository and inspects it
↓
continue
```

The replacement worker must inspect the current Git state of its own sandbox clone before touching anything, and should not assume it reflects work done by a prior worker unless the coordinator confirms the transfer artifact was applied.

## 8. Manual account rotation

Account switching remains manual.

Do not build automated account-login or account-switching mechanisms.

Do not implement a workflow such as:

```text
if limit:
    login account 2
    login account 3
    login account 4
```

Instead:

```text
Claude reports limit
       ↓
coordinator decides whether work should continue
       ↓
select next available account
       ↓
manual account switch
       ↓
handoff prompt
```

## 9. Standard Claude prompt contracts

### ARCHITECT

```text
Inspect → Analyze → Plan → Report → STOP
```

No implementation unless explicitly assigned.

### IMPLEMENT

```text
Inspect → Implement (as specified) → Test → Produce Transfer Artifact → Report → STOP
```

Execution-only, sandbox-only. Do not redesign, expand scope, or independently solve unrelated problems. Do not claim files were changed/committed/pushed in the authoritative local repository or GitHub — present the changed files or patch for the coordinator to apply. If instructions are ambiguous or wrong, stop and report rather than deciding.

### REVIEW

```text
Inspect → Compare → Identify Issues → Report → STOP
```

Normally no modifications.

### VERIFY

```text
Inspect → Execute Checks → Report Evidence → STOP
```

Minimal/no modifications. Do not fix anything found — report it and stop; repair is RECOVERY's job, assigned by the coordinator.

### RECOVER

```text
Inspect Failure → Identify Root Cause → Minimal Repair → Test → Produce Transfer Artifact → Report → STOP
```

No unrelated refactoring. Same sandbox/transfer-artifact rule as IMPLEMENT applies.

## 10. Git safety rules

These rules apply within whichever Git state a command is run in — see Sandbox execution model in Section 1 for the distinction between sandbox, authoritative local, and GitHub remote state. A worker's commands normally act only on its own sandbox clone; the coordinator is the one who runs commands against the authoritative local repository and GitHub.

Normal inspection/commit commands include:

```text
git status
git diff
git log
git add
git commit
```

The following require explicit care/approval, and are especially dangerous if run against the authoritative local repository or pushed to GitHub:

```text
git reset
git restore
git checkout -- ...
git clean
git rebase
git push --force
```

Fundamental rule:

> **Never destroy existing work merely to make a task pass.**

A new worker must treat unexplained uncommitted changes as potentially intentional until inspected.

A worker must never discard, overwrite, reset, restore, or clean uncommitted changes merely because they appear unrelated, incomplete, or broken. Only the coordinator explicitly authorizes destructive cleanup. This matters because a worker can inherit a half-finished implementation from another account.

## 11. Completion criteria

A task is not complete merely because a Claude worker says it is done.

Completion requires evidence across:

```text
Implementation
+
Tests
+
Specification compliance
+
Git state (authoritative local repository / GitHub, after the coordinator has applied the transfer artifact — not sandbox state alone)
+
Independent verification
```

Use explicit states:

```text
PASS
FAIL
BLOCKED
NOT RUN
```

Avoid vague completion claims such as:

```text
Looks good
Probably works
Implemented
Should work
```

## 12. Account ledger

Maintain only a small operational ledger when useful:

| Account | Role | Status | Project | Last Task |
|---|---|---|---|---|
| Claude 01 | Architect | Available | EAT | — |
| Claude 02 | Implementer | Active | EAT | Current task |
| Claude 03 | Reviewer | Available | EAT | — |
| Claude 04 | Verifier | Available | EAT | — |
| Claude 05 | Recovery | Available | EAT | — |

These are example assignments, not permanent assignments.

Never place account credentials in this ledger.

## 13. Usage-efficiency rules

Keep prompts focused.

Avoid sending an entire specification, repository, and many previous reports for a small task.

Prefer:

```text
Read SOURCE-OF-TRUTH.md.
Read the relevant phase section.
Inspect the relevant files.
Perform one task.
Report.
STOP.
```

Stable information belongs in repository documentation. Temporary context belongs in the handoff/state documents.

When a conversation becomes unnecessarily large, start a fresh worker conversation and continue from Git plus the documented state.

## 14. ChatGPT coordinator

The coordinator loop is:

```text
YOU
 ↓
ChatGPT Coordinator
 ↓
Claude worker
 ↓
report
 ↓
ChatGPT Coordinator
 ↓
next worker/task
```

Coordinator responsibilities:

- evaluate Claude reports
- compare implementation against the source of truth
- determine whether completion is actually supported by evidence
- select the next appropriate role
- generate the next task prompt
- coordinate recovery when verification fails
- pass each worker's transfer artifact to the user (repository integrator) for application to the authoritative local repository, and confirm it was applied before treating the task as complete

The coordinator should not rely on undocumented conversation memory when the repository can contain the needed state.

## 15. Relationship to OpenCode and OmniRoute

CARS does not replace the existing OpenCode/OmniRoute workflow.

Conceptually:

```text
ChatGPT
 ├── OmniRoute → OpenCode
 │                 └── implementation workflow
 │
 └── Claude CARS
       ├── ARCHITECT
       ├── IMPLEMENTER
       ├── REVIEWER
       ├── VERIFIER
       └── RECOVERY
```

The repository remains the shared source of truth regardless of which worker or tool performs a task.

Do not alter OpenCode/OmniRoute configuration merely to introduce CARS.

## 16. Security and privacy

Never commit:

- Claude passwords
- private account credentials
- API keys
- authentication cookies
- session tokens
- other secrets

Use labels such as `Claude 01` instead.

CARS does not automate authentication or account switching.

## 17. Maintaining CARS

Changes to CARS itself should be treated as documentation/workflow changes.

Before changing these rules:

1. inspect the current CARS documents
2. preserve compatibility with the repository's existing workflow
3. update the relevant permanent documentation
4. update temporary handoff/state files only when the current task state actually changed
5. verify the resulting documents are internally consistent

The workflow should remain simple enough that a new worker can understand it quickly.