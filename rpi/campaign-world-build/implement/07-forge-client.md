# Task 7 — Campaign World client and Forge workspace

## Outcome

Campaign Forge now owns only Campaign World construction. Campaign metadata supplies the display name; all post-creation world work uses the Campaign World API.

The frontend client covers:

- source load and strict source projection;
- World DNA persistence;
- build creation with the current source digest;
- persisted SSE replay and resume;
- Campaign World state load;
- version-and-hash acceptance for the following Review task;
- stable typed errors from the current `{ error: { code, message } }` contract.

The SSE parser validates content type, body presence, build ID, event name, event ID, sequence continuity, exact event fields, cursor resume, duplicate identity, terminal completion, CRLF, and chunk boundaries. It repairs no malformed event and accepts no earlier response shape.

## Forge behavior

- A fresh page loads state and replays the current build from sequence zero.
- The mounted controller updates its sequence ref before React state and resumes a disconnected subscription from that cursor.
- The ledger deduplicates by persisted build sequence.
- Browser unmount aborts the subscription while the backend build continues.
- A completion event triggers a state reload; Review navigation occurs only for persisted `review`.
- Premise-only campaigns can build directly.
- Optional DNA remains a local draft until `Create world`; a changed complete draft saves first, and the returned digest starts the build.
- Running state exposes four durable product stages and a persisted ledger rather than partial entity cards or model trace.
- Failure preserves completed stages, shows the stored safe message, and starts a separate build attempt.
- Accepted Forge deep links remain read-only and point to World Review.

## Verification

- `npm --prefix frontend run test -- --run 'lib/campaign-world-api.test.ts' 'components/campaign-forge/world-build-workspace.test.tsx' 'app/(non-game)/campaign/[id]/forge/page.test.tsx'` → 3 files, 19 tests passed.
- `npm --prefix frontend run typecheck` passed.
- `git diff --check` passed.
- Fixed-string check confirmed the active Forge page and test contain none of `worldgen-surface`, `worldgen-elapsed`, `kernel-phase`, Campaign Kernel helpers, old world generation, factions, lore cards, or player setup.

## Visual proof

- Desktop source editing: `output/playtests/campaign-world-build/task-7/forge-source-desktop.png`
- Narrow source editing: `output/playtests/campaign-world-build/task-7/forge-source-narrow.png`
- Desktop viewport: 1280 × 720.
- Narrow viewport: 768 × 900.
- Narrow stage rail scrolls horizontally and the document has no horizontal overflow.
- Browser console warnings/errors: none.
- Visual campaign: `a14f6b62-73dc-4a39-bd1d-823d4103b112` (`Task 7 Visual Proof`), retained temporarily for the integrated Review/shell visual gate.
