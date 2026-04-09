# TODOs

<!-- last-id: 30 -->

---

## [T-029] Extract icon.js PNG primitives and fonts
**Status:** planned
**Added:** 2026-04-09
**Description:** Pull low-level PNG encoding (`crc32`, `pngChunk`, `pixelsToPNG`, `drawRoundedRect`) into `src/core/png-utils.js` and the 3 pixel font definitions + `drawDigit`/`drawText` into `src/core/fonts.js`. Reduces icon.js from 624 to ~300 lines focused on ring/bar rendering.
**Questions:**
- [x] Extraction approach? "Straightforward - no architectural decisions needed, just move and require"

**Plan:**
1. Create `src/core/png-utils.js` containing:
   - `crc32()` (lines 8-15)
   - `pngChunk()` (lines 17-24)
   - `pixelsToPNG()` (lines 26-54)
   - `drawRoundedRect()` (lines 58-91)
   - Export: `{ crc32, pngChunk, pixelsToPNG, drawRoundedRect }`
2. Create `src/core/fonts.js` containing:
   - `FONTS` object with all 3 font definitions: classic, digital, bold (lines 250-400ish)
   - `drawDigit()` function
   - `drawText()` function (lines 416-423)
   - Export: `{ FONTS, drawDigit, drawText }`
3. In `icon.js`, replace extracted code with:
   - `const { pixelsToPNG, drawRoundedRect } = require("./png-utils")`
   - `const { drawText } = require("./fonts")`
4. Remove `zlib` require from icon.js (moves to png-utils.js)
5. Keep in icon.js: `SIZE`, `hexToRgb`, `urgencyRGB`, `drawRingArc`, `drawSpinningArc`, `drawBars`, `makeIcon`, `makeSpinFrame`
6. Verify tray icon renders correctly in all states (normal, spinning, bars mode)

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
