# Iron Fist Arena

A 3D fighting game in the style of Tekken 8 that runs in the browser. It is built with Three.js r128, and everything else, including the sound, is generated in code.

## Play

Open `dist/index.html` in a browser, with `dist/models.js` next to it. The page loads Three.js and fonts from public CDNs, so it needs an internet connection.

Pick **Arcade** to fight the CPU, **Versus** for two players on one keyboard, or **Training** to practice against a dummy.

| Action | Player 1 | Player 2 |
|---|---|---|
| Move, jump, crouch | W A S D | Arrow keys |
| Left punch, right punch | R, T | Num 4, Num 5 (or I, O) |
| Left kick, right kick | F, G | Num 1, Num 2 (or K, L) |
| Throw | Y | Num 6 (or P) |
| Heat Burst, Heat Smash | V | Num 8 (or N) |
| Rage Art | H | Num 3 (or ;) |
| Sidestep | Q, E | Num 7, Num 9 (or U, J) |
| Special Style on or off | Z | / or Num 0 |
| Pause | Esc | Esc |

Gamepads and on-screen touch controls also work. The pause menu has each fighter's full move list.

## Features

- Seven fighters with their own move sets, signature moves, idle styles and entrance poses.
- Four stages: a dojo, a warehouse, a rainy rooftop and a mountain temple.
- High, mid and low attacks, blocking, sidesteps, dashes, throws and throw breaks, juggles, counter hits, wall splats and wake-up options.
- Tekken 8 systems: Heat Burst, Heat Smash, Heat Engagers, recoverable health, chip damage, Power Crush, Tornado, low parries, breakable walls and Rage Arts.
- K.O. replays, a dynamic camera, a CPU opponent with three difficulty levels and a boss, and Special Style controls.

## Project layout

| Path | Contents |
|---|---|
| `src/00_head.html` | Page markup, HUD and menu styles |
| `src/01_core.js` | Settings and synthesized audio |
| `src/02_rig.js` | Animation skeleton, poses and move animations |
| `src/03_moves.js` | Move list, frame data and the fighter roster |
| `src/04_stage.js` | Stages, procedural textures and breakable walls |
| `src/05_fx.js` | Hit sparks, dust and limb trails |
| `src/06_fighter.js` | Fighter state machine, hit detection, Heat and juggles |
| `src/07_ai.js` | CPU opponent and training dummy |
| `src/08_input.js` | Keyboard, gamepad and touch input |
| `src/10_skin.js` | Loads the character models and drives them from the animation skeleton |
| `src/09_game.js` | Game flow, camera, menus, HUD and replays |
| `assets/models/` | Slimmed character models |
| `dist/` | Built game: `index.html` and `models.js` |
| `scripts/` | Build and test setup |
| `tools/` | Scripts that slimmed the source models |
| `tests/` | Gameplay regression tests |

## Build

```bash
scripts/build.sh
```

This joins the modules in `src/` into `dist/index.html` and packs `assets/models/` into `dist/models.js`. It needs Bash and Python 3.

## Tests

The tests drive the game headlessly with Playwright and check moves, blocking, throws, juggles, Heat, wall breaks, K.O.s and replays.

```bash
scripts/setup-tests.sh
```

```bash
scripts/build.sh
```

```bash
node tests/logic.test.js
```

## How the characters work

Each fighter has an invisible skeleton built in code. The moves animate that skeleton, and hit detection uses it. `src/10_skin.js` copies its joint rotations onto the bones of a skinned character model every frame.

The male fighters use the X Bot body, reshaped through bone scaling and painted with outfits by bone region. A Ready Player Me head is grafted onto them, and their hair is generated from the scalp. The female fighters use the Michelle model, one of them recolored. The boss is a chrome X Bot.

## Credits

- [Three.js](https://threejs.org) r128 (MIT license).
- The character models come from the three.js examples collection. They are Mixamo's X Bot and Michelle, and a Ready Player Me avatar head. These are third-party assets under their owners' terms, not covered by this project's code. The originals are at `examples/models/gltf/` in the [three.js repository](https://github.com/mrdoob/three.js); download them into `tools/source/` to rerun the slimming tools.
