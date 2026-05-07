# Personalized Sport Cards Design

**Goal:** Make the homepage sport cards feel more relevant for signed-in players by ordering them around sports where the player has performed well, while keeping the visible copy general and non-personalized.

**Design:** Keep the existing bottom sport-card section and card destinations. For signed-in players with enough answer history, rank the cards by per-sport strength derived from daily challenge answers. The card text should not say "recommended," "your strongest," or expose accuracy. It should read like normal sport-specific content.

**Ranking:** Derive per-sport performance from saved daily attempts and canonical daily challenge item snapshots. Use correct answers divided by answered questions as the primary score. Require a small minimum sample before a sport can outrank the default order. Break ties by larger sample size, then by the existing default order.

**Copy:** Keep the current general tone for every sport. Use this exact NFL description:

> You been watching film huh? That's cool, watch this

**Fallbacks:** Guests, signed-out players, and signed-in players without enough sport history see the default card order. If the performance lookup fails, render the default cards without blocking the homepage.

**Testing:** Add focused tests for the ranking helper: default order for low history, strongest sports first with enough history, tie handling, and exact NFL copy.
