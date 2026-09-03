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
  src/progression/    ProgressionStore (mirrors server-authoritative values)
  src/rendering/      RendererManager (+ resize), SceneManager (+ lighting)
  src/ui/             DebugOverlay (diagnostics, not the game UI)
  src/world/          TestFloor (temporary scaffolding)
server/               Colyseus + TypeScript
  src/config/         serverConfig
  src/progression/    ProgressionService, BackflipService (server-authoritative)
  src/rooms/          GorgeRoom + state/{PlayerState,GorgeState}
  src/util/           logger
shared/               Types and constants identical on both sides
  src/config/         movement, camera, backflip, progression (data-driven)
  src/constants/      network, world
  src/types/          math, player, messages
scripts/              inspect-fbx.mjs, verify-assets.mjs (zero-dependency)
```

Assets are served straight out of the repo-level `assets/` folder via Vite's
`publicDir`, so there is **no duplicate copy** of the FBX inside `client/`.

## Current milestone

**Milestone 2 — player foundation + procedural animation.** Verified working:

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
13. Temporary flat test floor.
14. Procedural animation on the real rig: idle, walk, run, jump start,
    airborne, landing, backflip and chained backflip.
15. Remote players animate from replicated compact state (no bone data on the wire).

Controls: **WASD** or arrow keys to move, **Shift** to sprint, **Space** to jump —
and **Space again while airborne** to spend one available backflip. Tap it
repeatedly to chain flips.

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
- **The test floor is not the gorge.** It is flat, square and temporary. The death
  plane exists server-side but is unreachable on a floor at `y = 0`.
- **No mobile touch controls yet.** The client is mobile-*ready* (viewport, pixel
  ratio cap, `touch-action`, orientation handling) but input is keyboard-only, so
  jumping and backflipping are unavailable on touch devices.
- **`base_rig.fbx` is unused**, byte-identical to `player.fbx`, and excluded from
  the production build.
- **`@colyseus/core` is pinned to `0.16.24`** via a root `overrides` entry —
  `0.16.25` ships a broken `workspace:^` dependency that npm cannot install.

## Next milestone

The linear gorge: real geometry, inaccessible banks, the blue death-zone floor,
trophy platforms that never shift left/right, and server-side movement
validation. Then trophies, boots, level progression (which grants the backflip
allowance the animation system already consumes), rebirth and treadmills — all
server-authoritative.
