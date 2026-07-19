# Narrator surname identity boundary

## Outcome

The first formal `glm-5-turbo` player action now completes through the rendered Campaign Play surface. Narrator validation still rejects an unbound visible actor's full name or unique first name, but it no longer treats an isolated surname on a visible object as that actor's identity.

## Field failure

Campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` entered the formal pristine-60 lane from accepted template hash `93a09e46b8f5adfc96db1f184c20f0a426ff6428223cb312c427a716bbeeb717`. The ordinary player character Mira Senn chose **Examine the board of household names** instead of following the suggested work route.

Judge and Game Master accepted their first native-JSON Turbo responses. The authoritative consequence listed six carved household names, including `Kast`. Both narrator attempts returned native JSON with `finish_reason=stop`, then semantic compilation rejected them at the unbound-actor identity check. The visible scene correctly exposed the committed observation and an explicit Resume action; no hidden retry, text fallback, provider switch, model switch, or code-authored prose ran.

## Root cause and repair

`Vedris Kast` was present in the scene but was not an actor subject of the board observation. The validator treated every unique token from a visible actor's name as actor identification, so the carved household surname `Kast` was misread as a reference to Vedris.

Actor identity matching now protects the full canonical name and its unique first token. It does not promote a standalone later name token to actor identity. This preserves the existing rejection of unsupported prose such as `Mara's footsteps` while allowing an independently supported surname literal such as `Venn` on a registry.

## Product proof

After the backend restarted on the same materialized run, the rendered Resume control started a new narrator attempt. The turn completed without changing the accepted Judge result, Game Master result, world consequence, or player decision. The final prose described only the board and its visible markings, then offered four grounded continuations: ask Dren about the red marks, ask Vedris about the board, examine the sealed doors, or go to the market.

The signed browser decision is bound to durable player-action turn `turn-player-action:d78f5633a61c13274ccd6cc5f21e539c587ce162`. Reload checkpoint 1 produced the same public-state hash before and after reload: `e6625a21673092fb4d56dda7cc1d7ee44aa490e88184fa0649becf8ff3bb91de`.

Focused narrator tests pass `18/18`, including the new household-surname collision regression. Backend typecheck passes. Humanizer and deslop review kept this note factual, scoped to the observed campaign, and free of a general model-quality claim.
