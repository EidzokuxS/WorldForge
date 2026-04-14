---
created: 2026-03-29T18:56:17.601Z
title: Add reusable multi-worldbook library
area: general
files:
  - frontend/components/title/new-campaign-dialog.tsx
  - frontend/components/title/use-new-campaign-wizard.ts
  - frontend/lib/api.ts
  - backend/src/routes/worldgen.ts
  - backend/src/routes/schemas.ts
  - backend/src/worldgen/worldbook-importer.ts
  - backend/src/campaign/manager.ts
---

## Problem

The current world generation flow only works with a single uploaded WorldBook per campaign creation session. That blocks a major use case: mixing multiple lore sources to create hybrid universes or crossover settings. It also forces the user to re-upload and re-classify the same WorldBook every time, even if that file was already processed earlier.

This creates two product gaps:

1. No way to attach multiple lorebooks/worldbooks to one generation run and merge their processed knowledge into a single scaffold context.
2. No persistent library of previously uploaded WorldBooks, so there is no "choose from existing processed lorebooks" flow during campaign creation.

The desired UX is: upload one or more new lorebooks, optionally mix them with already processed lorebooks from a local library, and use the selected set as the shared knowledge base for DNA suggestion and world generation.

## Solution

Implement a reusable WorldBook library plus multi-select composition in campaign creation.

Suggested direction:
- Add persistent storage for processed WorldBooks/library entries, including file identity, display name, processed/classified entries, and metadata needed for reuse.
- Extend the Step 1 campaign creation UI to support selecting multiple previously processed lorebooks and optionally uploading additional new ones in the same flow.
- Merge the selected lorebooks into one combined knowledge context before `suggest-seeds` and scaffold generation.
- Define merge rules for duplicate names/conflicting canonical entities across sources.
- Reuse already classified entries when possible so the user does not wait for reprocessing on every campaign.
- Preserve current single-WorldBook flow as a subset of the new UX.

Open design questions to resolve during implementation:
- Where the reusable library metadata should live on disk.
- How to key/deduplicate previously uploaded lorebooks.
- Whether merge happens at classified-entry level or after conversion to `IpResearchContext`.
- How to present source provenance when the same concept appears in multiple lorebooks.
