# TODOs

<!-- last-id: 30 -->

---

## [T-030] Extract token-stats.js path decoder and fs utils
**Status:** planned
**Added:** 2026-04-09
**Description:** Pull `decodeCwd` path recovery logic into `src/core/path-decoder.js` and file traversal helpers (`walkJsonl`, `buildSessionCwdMap`, `buildSessionFileMap`) into `src/core/fs-utils.js`. Reduces token-stats.js from 452 to ~280 lines focused on session/backfill logic.
**Questions:**
- [x] Extraction approach? "Straightforward - just move and require"

**Plan:**
1. Create `src/core/path-decoder.js` containing:
   - `decodeCwd()` function (token-stats.js lines 73-129)
   - Export: `{ decodeCwd }`
2. Create `src/core/fs-utils.js` containing:
   - `walkJsonl()` function (lines 134-148)
   - `buildSessionCwdMap()` function (lines 154-164) - requires `decodeCwd` from path-decoder
   - `buildSessionFileMap()` function (lines 169-178)
   - Export: `{ walkJsonl, buildSessionCwdMap, buildSessionFileMap }`
3. In `token-stats.js`, replace extracted code with:
   - `const { decodeCwd } = require("./path-decoder")`
   - `const { walkJsonl, buildSessionCwdMap, buildSessionFileMap } = require("./fs-utils")`
4. Keep in token-stats.js: `loadTokenHistory`, `appendSession`, `repairTimestamps`, `repairTokenHistoryCwds`, `backfillAllTranscripts`, `getActiveSessions`
5. Verify backfill, repair, and session discovery all work

---
