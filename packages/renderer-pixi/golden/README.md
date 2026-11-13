# Golden images (TASK-105.14)

A small set of scenes (`shapes`, `transforms`, `polygons`; see `browser-page/golden.ts`) is rendered in a real
headless Chromium and compared pixel by pixel with the PNGs in this directory. The test is
`src/browser-golden.test.ts`; the PNG codec and comparison are `src/golden-image.ts` (unit-tested in
`src/golden-image.test.ts`, which runs in the normal suite).

## Stability conditions

Pixels are only comparable when they come from the same stack. The suite pins:

| Condition | Value |
| --- | --- |
| Platform | Linux, the GitHub `ubuntu-latest` runner (`.github/workflows/canvas-browser.yml`). **Goldens are generated there.** |
| Browser | The runner's preinstalled Google Chrome (`/usr/bin/google-chrome`), headless (`--headless=new`) |
| GPU | None: software WebGL through ANGLE on SwiftShader (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) |
| Scale | `resolution: 1` and `--force-device-scale-factor=1`; fixed 160x120 canvases |
| Content | Shapes, transforms and alpha only. No text and no remote assets, which depend on installed fonts and the network |
| Anti-aliasing | Pixi `antialias: true` (MSAA on SwiftShader) |

A different OS, browser version, GPU or driver anti-aliases edges differently, so a golden made on a developer machine
will not match CI. A local run on another platform is for development only: do not commit its PNGs. A Chrome upgrade
on the runner image can shift edge pixels; if that happens the diff images show it (see below) and the goldens are
regenerated the same way.

## Tolerance

A pixel *differs* when any RGBA channel is more than **16** (of 255) away from the golden; the comparison fails when
more than **0.2%** of the pixels differ (`DEFAULT_TOLERANCE` in `src/golden-image.ts`). The per-channel threshold absorbs
rounding noise in anti-aliased edges; the fraction absorbs a few stray edge pixels, while a moved shape, a wrong colour
or a missing node fails clearly.

## Running

The suite is opt-in, so `npm test` never starts a browser.

```sh
# Compare (what CI does). Needs GABLE_BROWSER, or Chrome/Chromium/Edge in a common install location.
node packages/renderer-pixi/golden/run.mjs
# or: GABLE_GOLDEN=1 npx vitest run packages/renderer-pixi/src/browser-golden.test.ts
```

On failure the test prints, per scene, how many pixels differ and writes `<scene>.actual.png`, `<scene>.expected.png`
and `<scene>.diff.png` (differing pixels in red over a faded copy of the golden) into `golden/__output__/`
(gitignored). CI uploads that directory as the `golden-diffs` artifact.

## (Re)generating goldens

Goldens must come from the Linux CI environment that compares them.

1. Open the **Canvas browser smoke** workflow in GitHub Actions and choose *Run workflow* on your branch with
   `update_goldens` ticked. The job runs `node packages/renderer-pixi/golden/run.mjs --update` and uploads the
   result as the `golden-images` artifact.
2. Download the artifact, put its PNGs in `packages/renderer-pixi/golden/`, review them by eye, and commit.
3. Normal pushes and pull requests then compare against them.

Regenerate whenever a rendering change is intended (the diff images from the failing run show exactly what moved) or
the runner's Chrome changes pixels. Review the new PNGs in the pull request like any other change.

A scene with no golden fails with a message pointing here, so adding a scene to `browser-page/golden.ts` means
regenerating as above.
