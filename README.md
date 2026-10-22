# Ashen Vow

A browser-based 2D side-scrolling action RPG prototype. The current focus is on-device camera motion controls mapped to the player: left/right movement, punches, and kicks.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`.

## Controls

| Action | Keyboard |
| --- | --- |
| Move | A / D or Left / Right |
| Punch | J |
| Kick | K |
| Heavy attack | L |
| Pause | Esc |

The touch controls are available below the game stage on narrow screens.

## Motion controls

- Camera capture and pose inference run locally at 320×240.
- The preview is black with pose landmarks only; raw camera video is hidden and is not uploaded or stored.
- Calibrate at the center of the frame, then shift left/right to move; extend an arm to punch and a leg to kick.
- Keyboard and touch remain available as fallback controls.

Pose thresholds are provisional. Recognition accuracy still needs validation with real users, lighting, and target devices; other game systems remain prototype scope for later work.