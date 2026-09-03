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

- **Velocity determines jump distance.** Faster approach = longer jump. This is
  the central skill expression; do not cap it with a fixed jump arc.
- **Backflips are a traversal move.** Each flip re-launches the player in mid
  air with an upward impulse plus forward speed, and each successive flip in
  the same airborne window lifts HARDER than the last. Chaining flips is how a
  player climbs and covers ground.
- Level progression grants **backflips**, so more levels means more air.

**Progression**

- **Boots** increase progression gained per step.
- **Rebirth** increases the level cap and the progression multiplier.
- **Treadmills** provide AFK progression.

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

- The gorge layout is **pure data** in `shared/src/config/gorge.ts` - platform
  positions, trophy values, bank terraces and redlines. Never scatter world
  coordinates through scene code.
- `TROPHY_PLATFORMS` is **generated from a gap list**, so a per-platform X,
  Y or rotation cannot be introduced by accident. Every platform shares one
  geometry and one material; only the mesh's Z differs.
- Islands are **rectangular and wider across the gorge than along it** (22 x 11).
  The collection pad sits at the **far left** of every island, so a player who
  wants a bigger trophy runs down the right-hand lane instead.
- `GorgeCollision` is the gameplay shape of the world and `GorgeWorld` is its
  visuals. Both read the same config, so they cannot drift apart.
- Redlines sit **over islands**, with one exception: a line high enough that a
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
- The collection pad is narrower than the platform on purpose - a player can
  skirt around it to push on for a bigger trophy. Banking is a choice.
- Trophy rewards are granted in exactly one place: `TrophyService` on the
  server. It validates the platform, the run's claim history, the player's
  reported position and a claim cooldown. The client only ever asks.

## Architecture rules

- **No god files.** Logic belongs in its module: `networking`, `player`, `input`,
  `rendering`, `camera`, `animation`, `world`, `progression`, `configuration`.
- Gameplay tuning is **data-driven** and lives in `shared/src/config/*`. Numbers
  the client and server must agree on go in `shared/`, never duplicated.
- `shared/` must not import `three`, `colyseus`, or anything DOM.
- The client touches `colyseus.js` only inside `client/src/net/`.

## Current milestone

Milestone 3 (the gorge) is complete: the linear gorge world in the toy-brick
reference style - blue tiled channel, steep canyon walls, studded grass rims
with instanced conifers, a cloudy sky - plus nine identical wide islands
(+1 to +100) on one straight axis, left-hand collection pads, server-validated
trophy collection, red hazard lines, and backflips as a traversal move.
All world textures are generated procedurally on canvas; no image assets.

The temporary test floor is gone.

**Not built yet, and out of scope until the milestone advances:** boot shop,
rebirth, treadmills, level progression, full UI, monetization, final VFX,
audio.

Backflips are ANIMATED and input-driven, but the progression that grants them
is not built: `BACKFLIP.defaultCapacity` in `shared/src/config/backflip.ts` is
a flat allowance that level progression will replace.

## Verification

Do not claim something works without running it. `npm run typecheck` must pass,
both servers must start, and browser behaviour must be checked in a real browser.
