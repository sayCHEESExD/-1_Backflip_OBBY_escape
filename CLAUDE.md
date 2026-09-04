# CLAUDE.md — +1 Backflip Obby Escape

Permanent project rules and design constraints. Read this before changing anything.

## What this is

A **production** browser multiplayer obby game. Not a demo, not a prototype.
"Roblox-inspired" describes the **visual and gameplay style only**.

## Technology (fixed)

| Layer     | Stack                                          |
| --------- | ---------------------------------------------- |
| Client    | Three.js + TypeScript + Vite                   |
| Server    | Colyseus + Node.js + TypeScript                |
| Shared    | TypeScript, framework-free                     |
| Target    | Browser / WebGL, desktop **and** mobile        |
| Repo      | npm workspaces monorepo                        |

**Not used, ever:** Unity. Roblox Studio or the Roblox engine. Any other game
engine. Do not add a framework or a build tool without a concrete need.

## Hard constraints

- Final browser build must stay **under 12 MB**.
- **Progression and rewards are server-authoritative.** The client may predict
  for UI feel but never decides, computes or claims a reward.
- Desktop and mobile browsers are both first-class. No desktop-only input
  assumptions.

## Core game design

**Layout — linear gorge**

- The gorge is linear. The player travels **along** it, never across it.
- Trophy platforms **never shift left/right**. Progress is forward only.
- The **banks are inaccessible** — they are scenery, not playable space.
- The **blue gorge floor is a death zone**. Falling respawns the player at spawn.

**Movement**

- **The MOUSE aims the camera; the camera defines forward.** WASD and the
  arrow keys move relative to it and never rotate it. The camera used to trail
  the player's own facing, so pressing a movement key turned the character,
  which swung the camera, which redefined forward - a feedback loop, not a
  control scheme. `ThirdPersonCamera` owns its yaw/pitch, `MouseLook` writes
  them, and `stepPlayer` rotates the stick by that yaw. The character's facing
  then follows where it actually moves.
- **One render transform.** `LocalPlayer.position` is the simulation
  interpolated to the current frame PLUS the eased reconciliation offset, and
  the camera, the character and the world triggers all read it. Two separate
  transforms is what caused camera vibration: the simulation only advances on
  60Hz boundaries, so a 144Hz display saw it move in bursts, and the camera
  followed the raw position while the character rendered at a corrected one.
- The camera smooths the POINT IT FOLLOWS, once. Smoothing the position while
  taking the look target raw makes the two disagree every frame, which reads as
  vibration however gentle the smoothing is.
- `reconcile` must not collapse the interpolation baseline onto the replayed
  state: replay re-runs inputs the client already ran, so the baseline is still
  valid, and re-basing it twenty times a second is a visible tick. Only a SNAP
  (past `SNAP_DISTANCE`) resets it.
- The camera's RIGHT is `(-cos yaw, sin yaw)`, not `(cos yaw, -sin yaw)`: with
  Y up and +X to the right of screen, +Z runs away from the viewer, which is
  why +X is the player's left down the gorge. Getting this backwards inverts
  strafing, and a trailing camera hides it completely.
- **Velocity determines jump distance.** Faster approach = longer jump. This is
  the central skill expression; do not cap it with a fixed jump arc.
- **Backflips are a traversal move.** Each flip re-launches the player in mid
  air with an upward impulse plus forward speed, and each successive flip in
  the same airborne window lifts HARDER than the last. Chaining flips is how a
  player climbs and covers ground.
- Level progression grants **backflips**, so more levels means more air.

**Progression**

- **Speed** is the currency. Players farm it by moving: distance travelled on
  foot plus a bonus each time they leave the ground.
- Crossing a level threshold grants **one more backflip**. Capacity EQUALS
  level - level 15 means fifteen flips before touching down.
- Gaps between islands are tuned so island N needs N flips. Farming Speed is
  what physically opens the route; you cannot run your way to +100.
- **Boots** set Speed gained per step, bought with trophy Wins. Buying is a
  DELIBERATE ACT: the player must walk onto a pedestal in the Win Shop while
  holding enough Wins. Reaching the Wins total alone does nothing.
  Wins are SPENT: the tier's cost is deducted on purchase. (This reverses the
  earlier "threshold, not a price" rule, by explicit request.) The highest tier
  OWNED is always equipped, so a purchase can never downgrade anyone, and
  spending never removes a boot already bought.
- **Trails** multiply ACTUAL MOVEMENT SPEED, bought with Wins and worn one at
  a time. They feed the one movement formula through its `extraMultiplier`
  parameter - never a calculation of their own.
- **Auras** multiply TROPHY REWARDS, bought with Wins and worn one at a time.
  Applied in `resolveTrophyReward`, after `TrophyService` has already validated
  the platform, the claim history, the position and the cooldown.
- The two never cross. A trail must never touch a reward and an aura must never
  touch speed; `resolveProgressionRate` (boots, rebirth, treadmill) is a third
  axis again. Keeping them separate is why each lives in its own shared config.
- **Rebirth** raises the level cap and the multiplier:
  `maxLevel = 10 x (rebirth + 1)`, `multiplier = 1 + rebirth x 0.5`.
  Available once the player reaches their current max level. It resets level
  and Speed but PRESERVES Wins, boots and every other permanent unlock.
- **Treadmills** multiply the progression gained per step while the player is
  running on one. They do NOT change movement speed. Eight tiers stand along
  the back wall of spawn, each gated by a rebirth count (0/1/3/9/18/36/100/200).
- Using a treadmill is a MOVEMENT STATE, owned by `stepPlayer`: come to a stop
  on an unlocked deck and the machine takes you, pinning position and velocity
  so you run without travelling. Any control at all - a nudge of the stick or
  the jump button - leaves on that same step, from exactly where you stood.
  Entry requires a still stick precisely because exit is any input; otherwise
  walking on would enter and leave on alternating steps.
- A runner earns progression from the BELT: distance is `runSpeed x step`
  instead of a position delta, fed through the same per-step formula. There is
  no second progression path.
- Treadmills are never single-occupancy. Entering preserves the player's own X
  within the belt and only snaps Z, so players sharing a machine keep distinct
  positions; all treadmill state is per-player.
- `player.speed` is the ANIMATION signal, not physics - it reports the speed a
  runner is running AT while the replicated velocity stays zero, or remote
  clients would show them idling on the spot.
- The gate is `maxTreadmillTier`, resolved from the server's own rebirth count
  and replicated so client prediction matches. There is no treadmill message,
  so there is nothing for a client to forge.

**Multiplayer**

- Other players are **ghosted**: translucent and non-colliding, so they can
  never block another player's run.

## Assets

- `assets/player/player.fbx` is the **canonical** player asset.
- `assets/player/base_rig.fbx` is **byte-identical** to it. Do not load both and
  do not create a second runtime player asset.
- **Never modify the supplied FBX files.**
- The FBX embeds **dead absolute texture paths** (`X:\legion\poxel\...`). Texture
  resolution is handled explicitly in `client/src/config/assets.ts` and
  `client/src/player/PlayerModelLoader.ts`: every texture request is remapped
  before it hits the network, and materials are assigned in code after load.
  Never rely on the FBX's own texture paths.
- The FBX contains **no animation clips** — it is a bind-pose rig with 12 bones
  (`Rig1 Spine1 Spine2 Neck1 ArmL1 ArmL2 ArmR1 ArmR2 LegR1 LegR2 LegL1 LegL2`).
  All animation is **procedural**, driven from those bones. Do not add an
  animation library or a downloaded clip pack.
- The FBX declares **two skin deformers**, so FBXLoader creates two Bone objects
  per name: the real joint and a zero-length terminal child. The arms mesh binds
  to the terminals, the body mesh to the real joints. `PlayerRig` binds the
  **first** bone of each name (traversal visits a parent before its child), which
  drives both meshes. Binding the terminals animates the arms only.
- Assets are served straight from the repo `assets/` folder via Vite's
  `publicDir`. Do not copy assets into `client/`.

## Animation

Procedural, bone-driven, and required for the finished game — not a placeholder.

- `PlayerAnimator` is the only animation state machine. Animation logic never
  goes in movement, input or networking code.
- It consumes a read-only `AnimationInput` (grounded, speed, vertical velocity,
  jump/land/flip-request edges) and writes **only** to bones, the flip pivot and
  the visual bob node. It must never move the character's physics root, change
  velocity, or decide gameplay outcomes.
- Poses are authored in **character space** (`+X` pitch swings a limb backward)
  and resolved onto each bone's baked local axes by `PlayerRig`. Every frame
  rebuilds `rotation * restQuaternion` from scratch, so posing cannot drift.
- Backflips rotate a **flip pivot** at hip height inside the character, plus a
  bone tuck. Never rotate the whole rendered object.
- The flip's lift and forward impulse are applied by `LocalPlayer`, which owns
  velocity — **never by the animator**. The animator stays purely visual: it
  writes bones, the flip pivot and the bob node, and nothing else. Keeping the
  impulse in gameplay is what lets flips change the arc without the animation
  system ever being able to move the player.
- Chained flips ADD a full turn to the target angle rather than restarting.
  Rotation is one scalar, wrapped modulo 2π only at read time and rebuilt with
  `setFromAxisAngle`; quaternions are never accumulated across frames.
- "Available backflips" (server-authoritative allowance) and "flips being
  performed" are **different state**. Having flips available never performs one.
- Remote players run the same animator, reconstructed locally from compact
  replicated signals. **Never transmit bone transforms.**

## World

- The island ladder is **generated, not authored past the opening**. The
  hand-tuned first ten islands end exactly at the rebirth-0 level cap; every
  island after that continues the same curve by compounding (`GAP_GROWTH`,
  `REWARD_GROWTH`, both read off the authored tail). Adding more islands is a
  one-number change to `EXTENDED_ISLANDS`, never another table of values.
- `GORGE.horizonZ` is DERIVED from `ROUTE_END_Z`. The terrain is a handful of
  scaled boxes, so length is free, but a fixed horizon would leave the last
  islands floating over open sky. Foliage is a DENSITY for the same reason.
- The gorge layout is **pure data** in `shared/src/config/gorge.ts` - platform
  positions, trophy values, bank terraces and redlines. Never scatter world
  coordinates through scene code.
- `TROPHY_PLATFORMS` is **generated from a gap list**, so a per-platform X,
  Y or rotation cannot be introduced by accident. Every platform shares one
  geometry and one material; only the mesh's Z differs.
- Islands are **rectangular and wider across the gorge than along it** (22 x 11).
  The collection pad sits at the **far left** of every island, so a player who
  wants a bigger trophy runs down the right-hand lane instead.
- Each island has a themed **name and deck colour** (Starter, Cloud, Volcano,
  Tsunami, Hot, Nature, Crystal, Thunder, Ancient). Names live in shared config
  as island identity; colours live in `client/src/config/worldVisuals.ts`. The
  deck is a separate thin mesh laid on top - the island body keeps the shared
  geometry AND the shared material, so the geometry rule is untouched.
- `GorgeCollision` is the gameplay shape of the world and `GorgeWorld` is its
  visuals. Both read the same config, so they cannot drift apart.
- Redlines cover EVERY gap from the +10 island to the end of the route. The
  ramp is 1 line, 2 lines, three single columns, then the endgame pattern -
  three columns of three rows - repeated for every remaining gap. It repeats
  rather than escalating with gap length: out past +100 the gaps run to two
  thousand units, and scaling the hazard count with them would build a wall no
  arc could pass instead of a gate to thread.
- Redlines sit **in the gaps between islands**, never on an island. An island
  is where a player lands, re-aims and launches; a hazard there punishes the
  one part of the route that must be safe. A gap is the opposite - the player
  is already committed to an arc, so a line there is a shape to fly through.
- Every line spans **bank to bank**. Its half-span comes from `bankXAtHeight`,
  which follows the canyon wall, so a high line is a LONGER line and both ends
  are always buried in terrain rather than stopping in mid air.
- A stacked column is now a TIGHT BAND (rows 2.4 apart), deliberately below the
  threading threshold, so it has one answer: clear the whole thing. Widening
  the spacing back past 3.64 silently re-opens the gaps between rows.
- Superseded, kept for the arithmetic - a column that DOES want a passable
  window between rows: the hit test treats
  the player as a box 3.2 tall and each line is 0.22 thick, so rows need more
  than 3.64 units of clear air between them. `ROW_HEIGHTS` uses 4.8.
- Superseded, kept for context - redlines used to sit over islands: a line high enough that a
  normal jump passes under it (y >= 7.2) may span a gap, where it reads as "do
  not flip here". Any other height over a gap is unfair - the jump arc is under
  a metre high at the launch edge, so a low line is unclearable, and it peaks
  above head height mid-gap, so a mid line is unavoidable.
- **Hazard spacing is a hard constraint, not taste.** A low line needs ~1.9
  units of run-up before it, because it is only cleared once the player's FEET
  pass it. A high line cannot be launched from within ~0.9 units, because the
  head rises into it immediately. Place a high line just before a low one and
  those windows exclude each other, leaving no legal launch point. A pair on one
  island needs ~4.5 units between them; most islands carry a single line.
- **One owner per visible surface.** The island body stops where its deck
  begins, and the spawn grass is cut into four slabs around the treadmill bay
  (`TREADMILL_BAY`, shared config, so the hole and the floor come from one
  rectangle). Two surfaces a hundredth apart is z-fighting, not layering; the
  fix is always to remove one of them, never to nudge it.
- Walls stop at the INNER FACE of the wall they meet, never at the platform
  edge - running them to the edge buries one wall inside another with both tops
  at the same height.
- The canyon SLOPES start at the gorge mouth, not at `GORGE.startZ`. A slope
  crosses platform height at x = 27.9 while the starting headland reaches
  x = 33, so running them the full length pushed five units of blue bank up
  through the spawn grass on both sides. The RIMS still run the full length -
  they sit outboard of the headland and cannot intersect it.
- A sign hung near a wall must clear that wall's COPING, which oversails it by
  a quarter on each side.
- **Platforms are solid slabs, not one-way floors.** `resolveCeiling` stops a
  rising player at the underside; without it the whole route was climbable from
  below. The head test is gated on the player's PREVIOUS head height, so
  standing on a platform never traps them under the one they are on, and the
  ceiling footprint is deliberately not inflated by the player radius - the
  ground test inflates so you can stand on an edge, but inflating a ceiling
  would block you in mid air beside one.
- The Win pad is a BUILT object - framed chequered slab plus gold trophies -
  because the place a reward is banked has to read from across a gap. One
  frame geometry, one top geometry and a single InstancedMesh carrying every
  trophy on the route. It marks the spot; `TrophyService` decides the reward.
- The treadmill bay's floor is INLAID - its top sits exactly at platform level
  rather than raised - so the area reads as a dedicated room without adding a
  step the simulation would have to know about. The machines keep their own
  0.2 deck step, which is the only thing the player actually walks onto.
- The collection pad is narrower than the platform on purpose - a player can
  skirt around it to push on for a bigger trophy. Banking is a choice.
- Trophy rewards are granted in exactly one place: `TrophyService` on the
  server. It validates the platform, the run's claim history, the player's
  reported position and a claim cooldown. The client only ever asks.
- **Wins are spent in exactly one place**: `Wallet.spend`. Boots, trails and
  auras are three shops but must not become three ways to take payment - a
  second deduction path is how a wallet ends up disagreeing with an inventory.
  Wins are only ever ADDED by `TrophyService`, and only ever removed there.
- Trails and auras share one `CosmeticService`, parameterised by a binding, so
  the buy-and-equip transaction exists once. What each multiplier DOES is never
  decided in that service.
- **Movement speed has exactly one EVALUATOR**: `SpeedService.movementProfile`.
  It is the only place that knows every modifier feeding the shared formula,
  so nothing else may write `moveMultiplier`. `RebirthService.sync` used to,
  and silently dropped the equipped trail the moment trails existed.
- Boots are decided in exactly one place: `BootService` on the server. It
  validates the slot, the Wins, that the player is standing at that pedestal
  and a purchase cooldown, then DEDUCTS the price and equips the best tier
  owned. Taking payment, granting the item and equipping happen together in
  that one method, so the wallet and the inventory cannot disagree. The client
  only asks and renders.
- **Movement is SERVER-AUTHORITATIVE.** Clients send INPUT only
  (`MoveMessage` carries seq, dt and the stick - no transform). The server runs
  `stepPlayer` from `shared/src/sim/PlayerSim.ts` and owns position, velocity,
  rotation, grounded, jump and backflip state. The client runs the identical
  function to predict, keeps unacknowledged inputs, and on each server update
  snaps and replays them. Never add a second physics implementation, and never
  let a client assert a transform.
- `WorldCollision` lives in `shared/src/sim/` because BOTH sides collide
  against it. The client's `world/GorgeCollision.ts` is only a re-export.
- **Actual movement speed has exactly ONE formula**: `resolveMovementProfile`
  in `shared/src/config/rebirth.ts`. The server evaluates it from level and
  rebirth and replicates `moveMultiplier`; the client multiplies its base
  speeds by that and never derives its own. Boots and treadmills multiply in
  through the `extraMultiplier` parameter - never by adding a second formula.
  Server movement validation reads the same profile, so what the player moves
  at and what the server will credit can never disagree.
- **Progression gained per step has exactly ONE formula**:
  `resolveProgressionRate` in `shared/src/config/progressionGain.ts`. Boots,
  rebirth and treadmill multiply together there and nowhere else. A new
  modifier is added to that function, never to a caller - `SpeedService` is its
  only caller and does no arithmetic of its own.
- Persistence sits behind `PersistenceAdapter` in `server/src/persistence/`.
  Nothing above that boundary knows where profiles are stored, and
  `createPersistence` is the ONLY place naming a concrete adapter.
- Rebirth state is server-authoritative: `RebirthService` alone decides
  eligibility and performs the reset.
- Speed is granted in exactly one place: `SpeedService` on the server. It is
  DERIVED from movement the server observes - the distance between consecutive
  reported positions, capped at a plausible step so a teleport pays nothing.
  A client cannot request Speed, and the HUD only ever renders the replicated
  total. Reset the movement baseline on every respawn.

- The starting area is walled on the left (+X) and the back (-Z), with the Win
  Shop's backdrop closing the right. The front is open only across the GORGE
  MOUTH (`|x| <= GORGE.channelHalfWidth`); the rest of the front edge is wall,
  because the start is far wider than the channel it feeds into and an open
  edge out there would yank a player sideways to the channel limit in one step.
  `WorldCollision.clampToBounds` owns those limits and applies them anywhere at
  or behind the platform's front edge - a range test would let a large
  displacement tunnel the back wall.
- The start is the HEAD OF THE GORGE, not a floating slab: solid ground from
  rim to rim running down past the river floor, with the blue channel beginning
  at its front face (`GORGE_HEAD`). Only the starting area is grounded like
  this - the trophy islands stay floating platforms.
- The canyon slope is a rotated slab whose TOP FACE is the visible bank. Its
  centre must be offset along that face's own normal, never straight down in
  world Y: offsetting in Y slides the face inward and down, so the slope starts
  inside the channel and never reaches the rim, which is what left the green
  bank visibly disconnected from the blue wall.

## Architecture rules

- **No god files.** Logic belongs in its module: `networking`, `player`, `input`,
  `rendering`, `camera`, `animation`, `world`, `progression`, `configuration`.
- Gameplay tuning is **data-driven** and lives in `shared/src/config/*`. Numbers
  the client and server must agree on go in `shared/`, never duplicated.
- `shared/` must not import `three`, `colyseus`, or anything DOM.
- The client touches `colyseus.js` only inside `client/src/net/`.

## Current milestone

Milestone 9 (treadmill interaction, Wins spending, map connection) and
milestone 10 (redlines, Space Island, trails and auras) are complete. The route
now ends at Space Island (+200), redlines live in the gaps in a 1 / 2 / 3 / 3 /
3 / 3x3 pattern, and two cosmetic ladders exist: trails multiply movement speed
and auras multiply trophy rewards.

Milestone 8 (durable persistence and treadmills) is complete.

Profiles are now written to disk behind a `PersistenceAdapter`, so progression
survives a server RESTART, not just a reconnect. The shipped adapter is a
single JSON file under `server/data/`, written debounced and ATOMICALLY - temp
file, fsynced, then renamed - so a crash mid-write cannot corrupt a save. The
room also autosaves every connected player every 15s, because Speed accrues
continuously between the discrete events that otherwise trigger a save.

Treadmills are the new gameplay system: eight decks along the back wall of the
starting platform, which grew to 54 x 56 to hold them without crowding the run.
A deck is a 0.2 step - deliberately inside the simulation's landing tolerance,
so walking on and off needs no step-up rule. Visual tier ramps with the gate:
colour, emissive frame, belt scroll speed, a lit halo from tier 4 and orbiting
energy cubes from tier 6. Every machine shares one geometry per part.

Milestone 7 (server-authoritative movement) is complete: the physics step and
the collision model moved into `shared/src/sim/`, the client sends input on a
fixed 60Hz step and predicts with reconciliation, and the server simulates and
owns every movement field. The old x3.5 speed cap is gone (now a 50x safety
rail), so R2+ scales properly.

Milestone 6 (real movement speed, rebirth, longer route) is complete on top of
milestone 5: level and rebirth now drive ACTUAL movement speed through one
shared formula, rebirth is implemented with the 10/20/30/40 cap ladder, gaps
after the second island are much larger, and progression survives a reconnect
via an in-memory profile store keyed by a browser-stored player id.

Milestone 5 (boots and the Win Shop) is complete, on top of milestone 4:
seven boot tiers bought by walking onto their pedestal, the Win Shop on the
right of an enlarged walled starting area, and sneakers worn on the player's
feet.

Milestone 4 (Speed, levels and game UI) remains, on top of the milestone 3
gorge: Speed farming from movement, a level curve that grants one backflip per
level, flip-gated island gaps, themed named islands, and the game HUD - wins
counter, Speed/level bar, airborne jump counter and floating Speed popups.

The gorge itself is the toy-brick reference style - blue tiled channel, steep
canyon walls, studded grass rims with instanced conifers, a cloudy sky - with
nine identical wide islands (+1 to +100) on one straight axis, left-hand
collection pads, server-validated trophy collection and red hazard lines. All
world textures are generated procedurally on canvas; no image assets.

The temporary test floor is gone.

**Not built yet, and out of scope until the milestone advances:** full UI,
monetization, final VFX, audio.

`ProfileStore` stays a process-wide singleton because a room dies with its last
client, but it is now a CACHE in front of a durable adapter rather than the
only copy. Two tabs in one browser still share a `playerId`, and therefore one
profile.

The level cap is `PROGRESSION.baseLevelCap`; rebirth will raise it. Boots will
multiply Speed per step - that hook belongs in `SpeedService`, nowhere else.

Backflips are ANIMATED and input-driven, but the progression that grants them
is not built: `BACKFLIP.defaultCapacity` in `shared/src/config/backflip.ts` is
a flat allowance that level progression will replace.

## Verification

Do not claim something works without running it. `npm run typecheck` must pass,
both servers must start, and browser behaviour must be checked in a real browser.
