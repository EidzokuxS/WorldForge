---
created: 2026-03-30T05:28:26.581Z
title: Add lore card editing and deletion
area: general
files:
  - frontend/components/world-review/lore-section.tsx
  - frontend/lib/api.ts
  - backend/src/routes/lore.ts
  - backend/src/routes/__tests__/lore.test.ts
---

## Problem

The current Lore flow is read-mostly. Users can list lore cards, search them, import more content, or delete the entire lore collection for a campaign, but they cannot fix or remove an individual bad entry.

That makes Lore maintenance frustrating in normal use:
- imported or generated cards with wrong wording, duplicates, or outdated details cannot be corrected in place
- removing one bad entry currently requires either living with it or deleting the whole campaign lore set
- the UI in `LoreSection` does not expose per-card management actions, and the backend route only supports list/search/delete-all

This is especially painful now that Lore is becoming a more important persistent knowledge base for world generation and play context.

## Solution

Add granular lore management for individual cards.

Suggested direction:
- add backend endpoints for updating a lore card and deleting a single lore card by id
- extend the frontend Lore UI to expose edit and delete actions on individual cards
- support editing the main fields that matter for retrieval and display: `term`, `definition`, and `category`
- re-embed or otherwise refresh vector storage when a card changes so search stays correct
- add route and UI tests covering successful edit/delete flows plus validation and not-found cases

Open design questions:
- whether editing should also be available in the in-game lore panel, or only in world review/admin-style surfaces
- whether we want soft confirmation for delete and optimistic UI updates for both operations
