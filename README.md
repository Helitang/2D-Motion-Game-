# Ashen Vow

A browser-based 2D side-scrolling action prototype focused on camera-driven punches and kicks.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`.

## Controls

| Action | Keyboard |
| --- | --- |
| Left straight punch | U |
| Right straight punch | I |
| Left front kick | J |
| Right front kick | K |
| Pause | Esc |

Touch buttons are available in landscape mode. Portrait screens show a rotate-device prompt.

## Motion controls

- The player enters automatically while the background scrolls left, then stays fixed in the left half of the screen and always faces right.
- Camera capture and pose inference run locally at 320×240.
- The preview is black with pose landmarks only; raw camera video is hidden and is not uploaded or stored.
- Face the camera and use a straight punch or front kick. Left/right actions have independent counters.
- Punches require forward hand movement; a held or still hand does not count as a new punch.
- Enemy AI and damage are paused while validating character actions.
- Keyboard and touch controls can test all four actions independently.

Pose thresholds are provisional. Recognition accuracy still needs validation with real users, lighting, and target devices; other game systems remain prototype scope for later work.