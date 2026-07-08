# Learning Log

Every bug fixed, design decision made, and insight gained is captured here so we never pay tuition twice.

## Entry Template
```markdown
## YYYY-MM-DD: [Short Title]

### What Happened
[One paragraph description]

### Root Cause
[One-line summary]

### Lesson
[The pattern or rule that applies broadly]

### Applied To
[Which files were updated, or "None — logged for awareness"]

### Trigger
[What symptom should future agents watch for]
```

## Index
| Date | Title | Type | Applied To |
|------|-------|------|------------|
| 2026-07-08 | Routing layer drops account context | Behavioral | BEHAVIORS.md, all api/*/route.ts |
| 2026-07-08 | Pre-validate blocks fallback | Anti-pattern | api/publish/route.ts |
| 2026-07-08 | Account IDs with spaces | Sanitization | api/accounts/route.ts |

---

## 2026-07-08: Routing layer consistently drops account context

### What Happened
A comprehensive behavioral audit revealed that while the library layer (`lib/`) correctly supports account-scoped operations via optional `accountId`/`accountDir` parameters, the API routing layer (`api/*/route.ts`) and UI (`page.tsx`) consistently fail to extract and forward the `account` parameter from requests. This means the web UI is effectively single-account — all operations leak to the global scope.

### Root Cause
The library layer was built first with correct account support. The routing layer was added later or modified without propagating the account context. Five separate routes have this exact same bug pattern.

### Lesson
When adding account scoping to a new feature, verify ALL layers pass the account through: UI → routing → library. The fix pattern is always: (1) add `account: selectedAccount` to the fetch body in page.tsx, (2) parse `account` from request body in the route handler, (3) library already accepts the param.

### Applied To
`BEHAVIORS.md` (gap table), `docs/agency/session-log.md`

### Trigger
Any web UI operation that doesn't show account-specific data, or any Publish/Export that produces empty results for an account.

---

## 2026-07-08: Pre-validating Instagram config blocks local fallback

### What Happened
The publish API route had a `try { resolvePublishConfig() } catch { return 400 }` block that returned an error before `publishToInstagram()` was ever called. Since `publishToInstagram()` contains the `simulateLocalPublish()` fallback for when Instagram is not configured, the fallback was unreachable through the web UI.

### Root Cause
A defensive validation check was added to give users a clear error message about missing Instagram config, but it inadvertently created a dead end — users could never trigger the local simulation from the UI.

### Lesson
Never pre-validate a fallback-capable function. If the function handles its own fallback internally, let it run and catch errors at the output level instead.

### Applied To
`src/app/api/publish/route.ts`

### Trigger
User clicks Publish and gets a 400 error about Instagram config instead of a local simulation.

---

## 2026-07-08: Account IDs with spaces break URL encoding

### What Happened
The accounts API does not sanitize account IDs. Creating an account named "sample 1" creates a directory at `output/sample 1/` (with a space). The UI sends this as `?account=sample%201` (URL-encoded), which works in most routes but creates fragile paths that break shell scripts and CLI commands.

### Root Cause
No validation or sanitization on account creation. The `id` field is stored and used verbatim as a filesystem path.

### Lesson
Sanitize account IDs on creation — lowercase, replace spaces with hyphens, strip special characters. Store the sanitized version as `id` and the user-facing version as `name`.

### Applied To
`src/app/api/accounts/route.ts`, `src/lib/account.ts`

### Trigger
Account directory names with spaces in `output/`.
