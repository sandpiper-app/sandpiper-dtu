# Deferred Items — Phase 14

## Pre-existing TypeScript Error in ui.ts

**Discovered during:** Plan 14-01 execution (TypeScript check step)
**File:** `twins/slack/src/plugins/ui.ts:303`
**Error:** `Type 'string | null' is not assignable to type 'string | undefined'. Type 'null' is not assignable to type 'string | undefined'.`
**Status:** Pre-existing before plan 14-01. Not caused by 14-01 changes. Out of scope.
**Impact:** `npx tsc --noEmit -p twins/slack/tsconfig.json` exits non-zero. All runtime tests pass. No functional impact.
**Recommended fix:** Change the assignment at line 303 from a value that may be `null` to use `?? undefined` to coerce null to undefined.
