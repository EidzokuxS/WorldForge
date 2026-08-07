# Task 159 - Judge work-acceptance obligation

## Outcome

The Judge prompt now states that accepting offered work, even when the offer quotes an upfront or completion fee, is not completed work and does not itself transfer money or create a debt. The strict schema, compiler, obligation authority, provider/model selection, recovery, deadlines, persistence, mechanics, Narrator, and UI are unchanged.

## Evidence

Frozen r100 action 3 selected `Talk to Vedris Kast: accept the delivery job` from an accepted scene that quoted four copper now and four on completion. Judge attempt 1 returned valid native JSON and then failed at the `incur_actor_obligation` grounding guard in `judge.ts`; the frame contained no existing obligation and no transferred copper. The existing prompt already separated offers from authoritative transfers, but the returned ruling still treated job acceptance as an obligation effect. Attempt 2 returned a tool object and failed later final ruling validation, with no retained field-level artifact.

The added sentence resolves only the first proven ambiguity: accepting the assignment is not performance or payment. It does not relax a validator or normalize rejected output.

## Acceptance contract

- Trigger: the player accepts a visible offer of future paid work.
- Judge result: the action may accept the work, but `requiredObligationEffect` is `none` unless the current action independently completes paid work or authoritatively transfers money.
- Protected behavior: completed unpaid work may still incur nonplayer-to-player debt, accepted definite charges may still incur player-to-nonplayer debt, and actual payment still requires the existing visible obligation and possession authority.
- Forbidden surfaces: no schema/compiler change, automatic normalization, provider/model/reasoning/recovery change, mechanics replay, or player-visible copy change.

## Semantic review

The instruction is technical, literal, and limited to the observed authority distinction. It adds no narrative voice, visible copy, or filler.
