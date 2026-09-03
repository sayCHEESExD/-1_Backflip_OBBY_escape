# +1 Backflip Obby Escape

A production browser multiplayer obby game. Three.js + TypeScript on the client,
Colyseus + Node.js on the server, in an npm-workspaces monorepo.

"Roblox-inspired" describes the **visual and gameplay style only** — this is not
a Roblox Studio project and uses no game engine. See [CLAUDE.md](CLAUDE.md) for
the permanent project rules and game design constraints.

## Prerequisites

- **Node.js >= 20.11** (developed on 22.17)
- **npm >= 10** (workspaces)
- A WebGL2-capable browser

## Install

```bash
npm install
```

That installs all three workspaces at once. No per-workspace install needed.

## Development

Run both the server and the client together:

```bash
npm run dev
```

- Client: <http://localhost:5173>
- Server: `ws://localhost:2567`

Vite binds to all interfaces, so a phone on the same LAN can reach the client at
`http://<your-lan-ip>:5173` (set `VITE_SERVER_URL` if the server is elsewhere).

### Running them separately

```bash
npm run dev:server
```

```bash
npm run dev:client
```

`shared/` compiles to `shared/dist` and both consumers read from there, so build
it first if you start a workspace directly:

```bash
npm run build:shared
```

### Other commands

| Command                  | What it does                                          |
| ------------------------ | ----------------------------------------------------- |
| `npm run typecheck`      | Type-checks every workspace                           |
| `npm run build`          | Production build of shared + server + client          |
| `npm start`              | Runs the compiled server from `server/dist`           |
| `npm run inspect:fbx`    | Dumps bones, meshes and texture paths from player.fbx |
| `npm run verify:assets`  | Checks the player assets are present and unmodified   |

Environment variables: `PORT` and `HOST` on the server; `VITE_SERVER_URL` and
`VITE_DEBUG=1` on the client.

## Project structure

```text
assets/player/        player.fbx (canonical), base_rig.fbx (unused dupe), green.png
client/               Vite + Three.js + TypeScript
  src/animation/      PlayerAnimator (state machine), LocomotionCycle,
                      BackflipAnimator, PoseBuffer, AnimationInput,
                      rig/PlayerRig + rig/boneNames
  src/camera/         ThirdPersonCamera
  src/config/         client, asset and player-visual configuration
  src/core/           Game (composition root), GameLoop
  src/input/          InputManager, KeyboardSource, InputState
  src/net/            NetworkClient (only place colyseus.js is imported)
  src/player/         PlayerModelLoader, PlayerCharacter, LocalPlayer,
                      RemotePlayer, RemotePlayerManager
  src/progression/    ProgressionStore (mirrors server values), RunController
  src/rendering/      RendererManager (+ resize), SceneManager (+ lighting)
  src/ui/             DebugOverlay (diagnostics, not the game UI)
  src/world/          GorgeWorld, GorgeCollision, GorgeTerrain,
                      TrophyPlatforms, Redlines, Foliage, WorldTextures
server/               Colyseus + TypeScript
  src/config/         serverConfig
  src/progression/    ProgressionService, BackflipService, TrophyService
                      (all server-authoritative)
  src/rooms/          GorgeRoom + state/{PlayerState,GorgeState}
  src/util/           logger
shared/               Types and constants identical on both sides
  src/config/         movement, camera, backflip, progression, gorge
                      (all data-driven; gorge.ts owns the whole world layout)
  src/constants/      network, world
  src/types/          math, player, messages
scripts/              inspect-fbx.mjs, verify-assets.mjs (zero-dependency)
```

Assets are served straight out of the repo-level `assets/` folder via Vite's
`publicDir`, so there is **no duplicate copy** of the FBX inside `client/`.

## Current milestone

**Milestone 3 — the gorge.** A linear obby route down a blue gorge with
terraced banks, nine trophy platforms and red hazard lines. Verified working:

1. Long straight gorge along +Z: a blue tiled channel (a river visually, not
   water), steep tiled canyon walls, studded grass rims and a cloudy sky.
   Every texture is drawn procedurally on canvas — no image assets.
2. Nine trophy islands — +1 +3 +5 +10 +15 +25 +35 +45 +100 — sharing one
   geometry and one material. Identical width, length, thickness, X, Y and
   rotation; **only Z differs**. Each is 22 × 11, twice as wide across the
   gorge as it is deep.
3. Gaps grow from 7.0 to 9.5 units against a 10.9-unit sprint jump.
4. Gold collection pads at the **far left** of each island, with floating
   "+N Wins" labels — run the right-hand lane to skip a trophy and push on.
5. Walking into a pad awards that platform's wins **once**, then respawns at
   spawn. The server validates and grants; the client only asks.
6. Falling into the pit respawns at spawn.
7. Red hazard lines span bank to bank; touching one respawns at spawn.
8. Hazards start at the +35 platform, with more and tighter ones at +45 and
   +100 as the tilt increases.
9. Each line has one fair answer — run under the high ones, jump the low ones,
   and cross the high gap line without flipping.
10. Invisible boundaries at x = ±13 keep players off the walls (which start at
    x = ±16).
11. 300 layered conifers in two instanced draw calls; 38 meshes for the whole world.
12. **Backflips are traversal.** Each flip re-launches the player with an
    upward impulse and forward speed, and each successive flip lifts harder:
    measured peaks 3.5 → 4.6 → 6.9 → 9.9 units, carrying 14.3 → 25.6 units
    forward. One redline is strung high over a gap specifically as a "do not
    flip here" hazard.

### Previous milestone — player foundation + procedural animation

Still working, unchanged:

1. Vite client starts.
2. Colyseus server starts.
3. Browser connects and joins the `gorge` room.
4. Server creates a player entity on join and removes it on leave.
5. Local player renders from the supplied `player.fbx`.
6. Model loads through `FBXLoader` (2 meshes, 312 triangulated verts, 3.20 world units tall).
7. Skeleton verified at runtime — 12 bones: `Rig1 Spine1 Spine2 Neck1 ArmL1 ArmL2 ArmR1 ArmR2 LegR1 LegR2 LegL1 LegL2`.
8. Texture fallback works — the FBX's dead absolute paths are remapped before any request.
9. Third-person follow camera.
10. Desktop movement: WASD/arrows, `Shift` sprint, `Space` jump.
11. Position and rotation sync through the server.
12. Remote players render as translucent ghosts.
13. Procedural animation on the real rig: idle, walk, run, jump start,
    airborne, landing, backflip and chained backflip.
14. Remote players animate from replicated compact state (no bone data on the wire).

Controls: **WASD** or arrow keys to move, **Shift** to sprint, **Space** to jump —
and **Space again while airborne** to spend one available backflip. Tap it
repeatedly to chain flips and climb higher with each one.

### Animation system

The FBX has no clips, so the character is animated **procedurally** from its 12
bones. No animation library, no clip pack: the whole system is ~13 KB of source
and the production bundle got *smaller*, because dropping three.js'
`AnimationMixer` saved more than the new code costs.

| Module | Responsibility |
| ------ | -------------- |
| `rig/PlayerRig` | Binds the 12 bones, resolves character-space axes onto each bone's baked orientation, applies poses |
| `PoseBuffer` | Flat allocation-free pose storage and blending |
| `LocomotionCycle` | One walk/run cycle; cadence and pose strength follow real movement speed |
| `BackflipAnimator` | Rotation angle, chaining, abort-on-landing |
| `PlayerAnimator` | The state machine; blends poses and drives the rig, flip pivot and bob |
| `config/animationConfig.ts` | Every tunable number |

Key invariants:

- **Animation never moves the player.** It writes to bones, a flip pivot and a
  visual bob node — never to the character root that carries the physics
  position. Verified: jump trajectories are bit-for-bit identical with 0, 1 and
  3 flips.
- **Poses are authored in character space** (`+X` pitch swings a limb backward)
  and mapped onto each bone's baked local axes at bind time, so the rig's
  non-trivial authored orientations never leak into pose authoring.
- **Chaining cannot drift.** Rotation is a single scalar; each chained flip adds
  a full turn to the target rather than restarting, and the pivot quaternion is
  rebuilt from an axis-angle every frame. After 6 continuous rotations the pivot
  returns to exactly `(0,0,0,1)`.
- **Availability and performance are separate state.** `flipsRemaining` (server
  allowance) is distinct from flips in flight; having flips never performs one.
- **The flip impulse is gameplay, not animation.** `LocalPlayer` applies the
  lift and forward push because it owns velocity; the animator still cannot
  move the player.

### FBX texture handling

`player.fbx` references two textures by absolute path on a machine that does not
exist here (`X:\legion\poxel\...`). Three.js reduces those to their basenames,
so the client would otherwise request `/player/test.png` and
`/player/small_bevel.png`.

Two layers prevent that:

1. A `LoadingManager` URL modifier remaps every texture request before it is
   issued — `test.png` → `green.png`, `small_bevel.png` → an inline flat normal
   map. No dead path ever reaches the network.
2. After parsing, all materials are replaced with a `MeshStandardMaterial` built
   in code, using `green.png` with nearest-neighbour filtering (it is a 64×64
   pixel-art atlas, not a smooth texture).

Both live in `client/src/config/assets.ts` and
`client/src/player/PlayerModelLoader.ts`. The FBX files themselves are untouched.

## Known limitations

- **Backflip allowance is a flat default.** `BACKFLIP.defaultCapacity` is 3 per
  airborne window, server-validated. Level progression will grant it later; the
  animation system already supports any number of chained flips.
- **Flip duration vs airtime.** A flip takes 0.45s and a standing jump gives
  0.73s of airtime, so exactly one flip fits a flat-ground jump. Chaining needs
  the longer falls the gorge will provide.
- **Movement is client-simulated.** The server validates message shape and
  replicates the transform but does not yet re-simulate movement. Progression is
  already server-authoritative. Server-side movement lands with gorge collision.
- **`green.png` is a stand-in.** It is a plausible 64×64 atlas for this model but
  is not confirmed to be the original `test.png`. UVs land on sensible regions.
- **Movement is client-simulated.** The server validates the shape of every
  message, owns all trophy awards and issues the authoritative respawns, but it
  does not yet re-simulate movement, so it cannot detect a client that lies
  about its position between two valid points.
- **Hazard density is limited by island depth.** A low line needs ~1.9 units of
  run-up and a high line blocks launching within ~0.9, so a fair pair needs
  ~4.5 units between them. Only the +100 island carries both kinds; the others
  carry one. More hazards per island would need deeper islands.
- **The route ends at +100.** The gorge geometry continues to the horizon but
  there is nothing to reach past the last platform.
- **No mobile touch controls yet.** The client is mobile-*ready* (viewport, pixel
  ratio cap, `touch-action`, orientation handling) but input is keyboard-only, so
  jumping and backflipping are unavailable on touch devices.
- **`base_rig.fbx` is unused**, byte-identical to `player.fbx`, and excluded from
  the production build.
- **`@colyseus/core` is pinned to `0.16.24`** via a root `overrides` entry —
  `0.16.25` ships a broken `workspace:^` dependency that npm cannot install.

## Next milestone

Progression: level progression driven by collected wins (which also grants the
backflip allowance the animation system already consumes), then boots, the boot
shop, rebirth and treadmills — all server-authoritative. Server-side movement
re-simulation belongs in the same pass.
