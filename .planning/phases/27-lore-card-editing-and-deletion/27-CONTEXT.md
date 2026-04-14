---
phase: 27
title: Lore card editing and deletion
status: discussed
date: 2026-03-31
---

# Phase 27 Context

## Goal

Let users edit and delete individual lore cards instead of only listing/searching lore or deleting the entire campaign lore collection.

## Why Now

Lore has become a more central persistent knowledge base for world review and play context, but the current flow is still read-mostly. Generated or imported bad cards cannot be corrected in place, and removing one incorrect card currently means either tolerating it or deleting the entire collection.

## Existing Surface

- Frontend review UI renders lore in [frontend/components/world-review/lore-section.tsx](R:\Projects\WorldForge\frontend\components\world-review\lore-section.tsx)
- Frontend API helpers live in [frontend/lib/api.ts](R:\Projects\WorldForge\frontend\lib\api.ts)
- Lore routes live in [backend/src/routes/lore.ts](R:\Projects\WorldForge\backend\src\routes\lore.ts)
- Lore storage/vector logic lives in [backend/src/vectors/lore-cards.ts](R:\Projects\WorldForge\backend\src\vectors\lore-cards.ts)
- Existing route tests live in [backend/src/routes/__tests__/lore.test.ts](R:\Projects\WorldForge\backend\src\routes\__tests__\lore.test.ts)

## Current Constraints

- The backend currently supports:
  - list all lore cards
  - semantic lore search
  - delete all lore cards for a campaign
- Lore cards are stored in LanceDB as a single `lore_cards` table and current write helpers are bulk-oriented (`insertLoreCards`, `insertLoreCardsWithoutVectors`, `storeLoreCards`, `deleteCampaignLore`).
- The frontend currently exposes per-card read only rendering with import/search, but no card-level actions.

## Required Outcome

Phase 27 should add:

1. Backend endpoints to update one lore card and delete one lore card by id.
2. Validation for editable fields:
   - `term`
   - `definition`
   - `category`
3. Vector freshness on edit:
   - edited cards must be re-embedded or otherwise rewritten so semantic search stays aligned with the edited content.
4. Frontend lore management UX in world review:
   - per-card edit action
   - per-card delete action
   - clear pending/saving/error states
5. Regression coverage for:
   - successful edit
   - successful delete
   - validation failure
   - not-found handling

## Notes

- Scope is the world review/admin-style lore surface first; in-game lore editing can stay out of scope unless it naturally falls out of the same abstractions.
- Phase 26 browser validation passed, so active roadmap work now moves to Phase 27.
