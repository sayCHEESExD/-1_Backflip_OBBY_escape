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
- Level progression grants **backflips**.

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
  bone tuck. Never rotate the whole rendered object, and never let a flip touch
  horizontal velocity — the jump arc must be identical with and without flips.
- Chained flips ADD a full turn to the target angle rather than restarting.
  Rotation is one scalar, wrapped modulo 2π only at read time and rebuilt with
  `setFromAxisAngle`; quaternions are never accumulated across frames.
- "Available backflips" (server-authoritative allowance) and "flips being
  performed" are **different state**. Having flips available never performs one.
- Remote players run the same animator, reconstructed locally from compact
  replicated signals. **Never transmit bone transforms.**

## Architecture rules

- **No god files.** Logic belongs in its module: `networking`, `player`, `input`,
  `rendering`, `camera`, `animation`, `world`, `progression`, `configuration`.
- Gameplay tuning is **data-driven** and lives in `shared/src/config/*`. Numbers
  the client and server must agree on go in `shared/`, never duplicated.
- `shared/` must not import `three`, `colyseus`, or anything DOM.
- The client touches `colyseus.js` only inside `client/src/net/`.

## Current milestone

Milestone 2 (player foundation + animation) is complete: client + server start,
the client joins the room, `player.fbx` loads with a working material fallback,
third-person camera, desktop movement, position/rotation sync with ghosted
remote players, and the full procedural animation system (idle, walk, run,
jump start, airborne, landing, backflip, chained backflip) — all on a
**temporary flat test floor**.

`client/src/world/TestFloor.ts` is scaffolding. Delete it when the real gorge
lands.

**Not built yet, and out of scope until the milestone advances:** gorge,
trophy platforms, trophies, boots, rebirth, treadmills, level progression,
full UI, monetization, final environment, VFX, audio.

Backflips are ANIMATED and input-driven, but the progression that grants them
is not built: `BACKFLIP.defaultCapacity` in `shared/src/config/backflip.ts` is
a flat allowance that level progression will replace.

## Verification

Do not claim something works without running it. `npm run typecheck` must pass,
both servers must start, and browser behaviour must be checked in a real browser.
