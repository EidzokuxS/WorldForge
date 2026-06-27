# Task

Review the A5 Cast Registry planning text for WorldForge.

# Model Role

Act as GLM-5.2 Coding Plan reviewer.

# Source Files

- `rpi/campaign-kernel/architecture.md`
- `rpi/campaign-kernel/implement/a5-cast.md`
- `shared/src/types.ts`
- `backend/src/worldgen/types.ts`
- `backend/src/character/record-adapters.ts`

# Review Rules

- Apply humanizer/deslop pressure: flag vague claims, filler, inflated wording, negative framing, hidden fallback language, and generic AI planning text.
- Check whether A5 stays inside a pure Cast Registry adapter.
- Check whether the mapping from `CharacterDraft` and `ScaffoldNpc` to `CampaignCastRegistry` is implementable.
- Check whether A5 accidentally reintroduces old character/world generation ownership.
- Do not edit files.

# Output

Return:

1. Verdict: approve or revise.
2. Required wording changes, if any.
3. Scope risks, if any.
4. One-sentence implementation recommendation.
