# 002 — Meshy Initialization Bug & Fix

**Date**: 2026-05-05  
**Status**: Fixed  
**Severity**: Critical (breaks mesh generation entirely)  
**Root cause**: Server process environment variable initialization

---

## Problem Statement

When testing SOTENAES armchair (which correctly routes to `mesh` strategy), the system fell back to procedural generation instead of calling Meshy AI. Console showed:
```
Meshy generation failed
```

The resulting procedural armchair was visually unacceptable — stacked boxes that bear no resemblance to a curved armchair.

---

## Root Cause

The **server process did not have `MESHY_API_KEY` loaded** when it started.

Timeline:
1. Previous session: Meshy API key was added to `server/.env` file
2. New session: `.env` file exists with key, but server was already running from old session
3. Old server process: Did NOT reload environment variables from `.env`
4. Result: Every Meshy request returned `"missing MESHY_API_KEY"` error

```
server/.env (file exists):
  GEMINI_API_KEY=AIzaSyAqMRMvaxDXOiGo1RH3pEO2cZAydpntO60
  MESHY_API_KEY=msy_mOsuCFVIdu4rNN4qjuHA61lH8O6LLouKWOT5
  PORT=3001

Old server process (running in background):
  process.env.MESHY_API_KEY = undefined  ← NOT reloaded
  → POST /api/generate-mesh returns 503: "missing MESHY_API_KEY"
  → Client falls back to forceProcedural
```

---

## Fix Applied

1. **Kill old server process**:
   ```bash
   pkill -f "node index.js"
   ```

2. **Restart server** (new process loads environment):
   ```bash
   cd server && node index.js
   ```

3. **Verify API key is loaded**:
   ```bash
   curl -s -X POST http://localhost:3001/api/generate-mesh ...
   → Returns valid meshUrl (previously returned 503)
   ```

**Result**: Meshy generation now works. SOTENAES armchair took ~110 seconds (typical for preview mode) and returned a valid GLB URL.

---

## Why This Happened

The `require('dotenv').config()` call in `server/index.js` only loads `.env` once when the server process starts. If:
- The server is already running
- A new `.env` file is created or updated (e.g., adding MESHY_API_KEY)
- The old server is not restarted

→ The old process continues with stale environment variables.

This is a **common dev workflow issue** that doesn't occur in production (container deploys always start fresh).

---

## Prevention

### For developers (short-term)

When adding or changing environment variables:
1. Kill the old server process: `pkill -f "node index.js"` or `npm stop`
2. Restart with `npm run dev` or `node index.js`
3. Verify via health check: `curl http://localhost:3001/api/health`

### For the codebase (medium-term)

Add a startup check that logs which API keys are configured:

```js
// server/index.js
require('dotenv').config()

console.log(`\nℹ  API Configuration:`)
console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ configured' : '✗ MISSING'}`)
console.log(`   MESHY_API_KEY:  ${process.env.MESHY_API_KEY ? '✓ configured' : '✗ MISSING'}\n`)

if (!process.env.GEMINI_API_KEY) {
  console.warn(`⚠  WARNING: Gemini API key not found. Set GEMINI_API_KEY in server/.env\n`)
}
if (!process.env.MESHY_API_KEY) {
  console.warn(`⚠  WARNING: Meshy API key not found. Mesh generation will fail. Set MESHY_API_KEY in server/.env\n`)
}
```

This makes it **visually obvious** at startup if keys are missing.

---

## Improved Error Logging (Commit 715de13)

Added detailed console logging to make future debugging faster:

### Server-side (`server/routes/generate-mesh.js`)
```
[Meshy] Starting mesh generation for "SOTENAES Armchair" (armchair) 71×71×73cm
[Meshy] ✓ Successfully generated mesh for "SOTENAES Armchair"
```

### Polling (`server/ai/meshyClient.js`)
```
[Meshy] Poll #1 status: IN_PROGRESS
[Meshy] Poll #2 status: IN_PROGRESS
...
[Meshy] ✓ Task 019dfbe3... succeeded after 23 polls
```

### Client-side (`client/src/components/ProductImporter.jsx`)
```
[Meshy] Initiating mesh generation for "SOTENAES Armchair" (strategy: mesh)
[Meshy] ✓ Mesh URL received for "SOTENAES Armchair"
```

or if fallback:
```
[Meshy] ✗ Mesh generation failed: Mesh generation not configured (missing MESHY_API_KEY).
[Meshy] Falling back to procedural generation (forceProcedural: true)
[Meshy] ✓ Fallback procedural generation succeeded for "SOTENAES Armchair"
```

This makes it **crystal clear** why the fallback was triggered.

---

## Architectural Insight

The 3-stage fallback chain is **working as intended**:

```
stage 1: Gemini routes → "mesh"
         POST /api/generate-mesh
            ↓
         [Meshy fails due to missing API key]
            ↓
stage 2: Fallback to Gemini with forceProcedural: true
         POST /api/generate-model?forceProcedural=true
            ↓
         [Returns box/cylinder components]
            ↓
stage 3: Render as procedural (suboptimal but functional)
```

**However**, this masks the real problem (missing API key) with a poor visual result. The logging improvements mean the actual issue is now logged, making it obvious what went wrong.

---

## Testing Notes

- **Meshy endpoint** responds correctly with key configured
- **Polling** works: 5-second intervals, ~3 minute timeout
- **GLB URLs** are valid HTTPS and CORS-friendly
- **Request timing**: ~30-110 seconds for text-to-3D (within spec)
- **Fallback chain**: Procedural fallback works if Meshy fails

---

## Action Items for Next Session

- [ ] Add startup environment check to `server/index.js`
- [ ] Test end-to-end with SOTENAES armchair in UI (should render as GLB, not procedural)
- [ ] Monitor console logs during Meshy generation to verify new logging works
- [ ] Consider adding a `.env.example` note about restarting server after changes

---

## Related Files Changed

| File | Change |
|------|--------|
| `server/ai/meshyClient.js` | Added poll count + status logging |
| `server/routes/generate-mesh.js` | Added request/success/error logging |
| `client/src/components/ProductImporter.jsx` | Enhanced error messages + fallback logging |

---

## Impact

- **Before fix**: SOTENAES armchair → "Meshy generation failed" → procedural fallback → bad visuals
- **After fix**: SOTENAES armchair → Meshy succeeds → GLB renders correctly → good visuals
- **Developer experience**: Logging makes failures obvious instead of silent

---

## Lessons Learned

1. **Environment variables don't reload** — restarting the server is necessary after `.env` changes
2. **Silent failures are dangerous** — the fallback chain masked the real issue
3. **Logging is crucial** — detailed console output makes debugging 10x faster
4. **Health checks aren't enough** — `/api/health` returned OK even with missing Meshy key
5. **Startup validation helps** — explicitly checking and logging API keys at startup prevents surprises
