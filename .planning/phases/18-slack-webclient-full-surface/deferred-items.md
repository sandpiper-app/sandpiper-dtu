# Deferred Items — Phase 18

## Pre-existing Issue: ui.ts TypeScript Error

**File:** `twins/slack/src/plugins/ui.ts` line 303
**Error:** `Type 'string | null' is not assignable to type 'string | undefined'`
**Status:** Pre-existing before Phase 18; out of scope for any Phase 18 plan
**Discovered during:** Phase 18 Plan 01 Task 1 TypeScript check

This error exists in the codebase before Phase 18 work began (confirmed by git stash test).
A future maintenance phase should fix this nullability issue in ui.ts.
