# Claude Account Rotation System (CARS) v1.0

## 1. Purpose

CARS provides a repository-first workflow for using multiple Claude accounts as interchangeable development workers.

The core principle is:

> **Claude accounts are interchangeable workers; the Git repository and project documentation are the source of truth.**

Claude conversations are disposable working sessions. A new worker must be able to continue from the repository, Git history, and documented task state without requiring the previous conversation.

This workflow does not replace the existing OpenCode/OmniRoute workflow. It provides an additional structured workflow for Claude.

## 2. Roles

CARS defines five logical roles. Account identity is not permanently tied to a role.

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

Purpose:

- implement an approved task
- modify code
- add/update tests
- run tests
- make Git commits when instructed
- report exactly what changed and what was verified

Default contract:

```text
Inspect → Implement → Test → Commit → Report → STOP
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

Default contract:

```text
Inspect Failure → Identify Root Cause → Minimal Repair → Test → Commit → Report → STOP
```

Recovery must not become an excuse for unrelated refactoring.

### Role Authority & Modification Rules

To prevent role drift (e.g. a Verifier deciding to "just fix it while I'm here"), modification and commit authority is explicit per role:

| Role | May modify implementation? | May commit? |
|---|---|---|
| ARCHITECT | ❌ | ❌ |
| IMPLEMENTER | ✅ | ✅ if instructed |
| REVIEWER | ❌ | ❌ |
| VERIFIER | ❌ | ❌ |
| RECOVERY | ✅, minimal only | ✅ if instructed |

A role must not exceed this authority even if it believes a fix is small, obvious, or faster to do itself. If a non-implementing role (ARCHITECT, REVIEWER, VERIFIER) identifies a needed change, it reports the issue and stops; it does not make the change.

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

The repository and its documentation are the shared memory.

Preferred flow:

```text
Claude worker
    ↓
performs work
    ↓
Git
    ↓
documentation/state
    ↓
next Claude worker
```

Do not require the next worker to receive the entire previous conversation.

Before continuing an interrupted task, a replacement worker should inspect:

```text
git status
git diff
git log
docs/WORKFLOW/CLAUDE-HANDOFF.md
docs/WORKFLOW/CLAUDE-TASK-STATE.md
```

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
Inspect repository + task state
    ↓
Do assigned work (within its Role Authority)
    ↓
Run required verification
    ↓
Update CLAUDE-HANDOFF.md
    ↓
Update CLAUDE-TASK-STATE.md
    ↓
Commit if authorized
    ↓
Final report
    ↓
STOP
```

The report is what the worker tells the coordinator; the handoff/task-state documents are what the *next worker* reads. Both must happen — a report alone does not update shared state, and updated documents alone do not inform the coordinator.

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
ARCHITECT
 ↓
IMPLEMENTER
 ↓
REVIEWER
 ↓
VERIFIER
 ↓
RECOVERY if required
```

## 7. Account switching

Do not switch accounts in the middle of an uncommitted implementation unless necessary.

Preferred:

```text
finish task
↓
commit
↓
handoff
↓
next worker
```

If a worker reaches a usage limit mid-task:

```text
LIMITED
↓
save current state
↓
update handoff
↓
replacement worker inspects repository
↓
continue
```

The replacement worker must inspect the current Git state before touching anything.

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
Inspect → Implement → Test → Commit → Report → STOP
```

### REVIEW

```text
Inspect → Compare → Identify Issues → Report → STOP
```

Normally no modifications.

### VERIFY

```text
Inspect → Execute Checks → Report Evidence → STOP
```

Minimal/no modifications.

### RECOVER

```text
Inspect Failure → Identify Root Cause → Minimal Repair → Test → Commit → Report → STOP
```

No unrelated refactoring.

## 10. Git safety rules

Normal inspection/commit commands include:

```text
git status
git diff
git log
git add
git commit
```

The following require explicit care/approval:

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
Git state
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