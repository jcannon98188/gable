# Canvas library spike: empirical checks for TASK-104

Run 2026-11-12 in a scratch project outside the repo (Windows 11, Node v24.21.0, Vite 8.3.8, esbuild, playwright-core 1.65.0 driving Chromium 1243 with `--use-angle=swiftshader`, i.e. software WebGL2, no real GPU). Packages installed from npm: `pixi.js@8.23.0`, `three@0.187.0`, `@babylonjs/core@9.35.0`, `@react-three/fiber@9.8.2`, `troika-three-text@0.53.1`. Everything below was observed; where I read source instead of running, it says so. Fills the gaps listed at the end of `docs/research/canvas-libraries.md` (branch `origin/research/canvas-libraries`). No recommendation.

"Pixel" results were read back from the framebuffer (Pixi `renderer.extract.pixels`, Three `gl.readPixels`) after an explicit render call, with no dirty/update call other than the one named.

## 1. Detached construction in plain Node (no DOM, no GPU)

`typeof document`, `window`, `HTMLCanvasElement` are all `undefined` in the Node run.

| | Pixi 8.23 | Three r187 |
|---|---|---|
| Container / Group / Object3D | OK | OK |
| Sprite | OK (`new Sprite()`, `Texture.EMPTY`, `Texture.WHITE`) | OK (`new Sprite()`, with `SpriteMaterial`) |
| Graphics, `g.rect().fill()` | OK | n/a (Mesh + geometry: OK) |
| Mesh | `new Mesh({})` FAILS (`Cannot read properties of undefined (reading 'on')`: needs a geometry); `Mesh({geometry: new MeshGeometry(...), texture})`, `MeshPlane`, `PerspectiveMesh` OK | `new Mesh()`, `Mesh(BoxGeometry, MeshBasicMaterial)` OK |
| Text constructor | `new Text({text, style})` OK, setting `.text` OK; **reading `.width` / `getBounds()` FAILS: `document is not defined`** (it measures with a canvas) | n/a |
| HTMLText, BitmapText, NineSliceSprite, TilingSprite, AnimatedSprite | all construct OK | n/a |
| Textures | `Texture.WHITE/EMPTY` OK; `Texture.from('x.png')` returns without loading (warns "Asset id not found in Cache") | `Texture`, `TextureLoader`, `CanvasTexture()` (no canvas), `DataTexture` OK |
| Scene / Camera | n/a (`Application`/renderer is what needs the DOM) | `Scene`, `OrthographicCamera`, `Raycaster` OK |
| Renderer | not attempted without a canvas | `new WebGLRenderer()` FAILS: `document is not defined` |
| 3rd-party text | n/a | `troika-three-text` `new Text()` + `.text/.fontSize/.color` OK detached (it is a `Mesh` subclass); glyph generation (`sync()`) was not run |

Take-away for a no-GPU test renderer: both libraries' scene-graph classes construct and form trees in Node. Pixi's only observed DOM touch was text measurement (`Text` size queries). Three's only observed DOM touch was the renderer. Neither needed a GL context for the object classes listed.

Pixi note on hit testing in Node: `worldTransform` is not computed until a render (or until a render group transform update), so hit tests are wrong before that. `updateRenderGroupTransforms(root.renderGroup, true)` (exported) on a `new Container({ isRenderGroup: true })` root fixed it (see section 4).

## 2. Insert-before and remove, parent/children bookkeeping

Tested in Node with 3 siblings (`a`, `c`, then insert `b` before `c`, move `c` to the front, reparent `b` into `a`, remove).

Pixi (all native API, results as expected):

```js
root.addChild(a); root.addChild(c);
root.addChildAt(b, root.getChildIndex(c));   // children: a,b,c ; b.parent === root
root.addChildAt(c, 0);                       // moves an existing child: c,a,b (length 3, no duplicate)
a.addChild(b);                               // reparent: removed from root automatically, a.children=[b]
root.removeChild(a);                         // a.parent === null
b.removeFromParent();                        // a.children.length 0, b.parent null
```

`added` / `removed` events fire on the child (`['added','removed']`). `destroy()` removes it from the parent (`destroyed: true`, no longer in `children`). `addChildAt` with the node's own index handled correctly.

Three: no index API. This helper worked, same assertions all passed (order a,b,c; move c first -> c,a,b len 3; reparent via `add`; `remove` sets `parent` to null):

```js
function insertBefore(parent, child, ref) {
  if (child.parent) child.parent.remove(child);
  const i = ref ? parent.children.indexOf(ref) : -1;
  parent.add(child);                       // sets parent, fires 'added' / 'childadded'
  if (i >= 0) { parent.children.pop(); parent.children.splice(i, 0, child); }
}
```

Other observed Three behaviour: `add(child)` on a child that already has a parent removes it from the old parent first; adding the same child twice leaves one copy; `add({})` logs `THREE.Object3D.add: object not an instance of THREE.Object3D` through `console.error` (not thrown); `'added'` / `'removed'` events fire.

Source check, `@react-three/fiber@9.8.2` (`dist/events-e51d7528.esm.js`, `insertBefore` / `handleContainerEffects`): R3F itself does what the helper does, directly splicing `parent.object.children`, setting `child.object.parent`, and dispatching `{type:'added'}` / `{type:'childadded', child}` by hand.

**Draw order in Three is not child order** (section 5): reversing `children` of equal-depth sprites did not change which draws on top. So an `insert(parent,node,before)` in Three only fixes tree order; visual stacking is separate state.

Draw order in Pixi **is** child order (later sibling on top): `addChildAt(B, 0)` flipped red/blue at the overlap pixel; `sortableChildren = true` + `zIndex` also works.

## 3. Property writes

Method: build detached, attach, render, write property, render again, read the pixel. Software WebGL2.

### Pixi (WebGL, `autoStart: false`, manual `app.render()`)

| Write | Result |
|---|---|
| `sprite.x = 50`, `sprite.y = 50` | takes effect on next render, old pixel cleared |
| `sprite.alpha = .5` | effect (extract shows premultiplied `127,0,0,127`) |
| `sprite.visible = false` | gone next render |
| `sprite.rotation = Math.PI/2` | effect |
| `sprite.scale.set(40)`, `sprite.scale = 20` (number), `sprite.scale.x = 60` | all effect; `scale = number` is accepted and sets both axes |
| parent `group.x = 10` | child moves |
| `graphics.tint = 0x0000ff` | effect, no redraw (multiplies the fill) |
| `graphics.x = 140` | effect, no redraw |
| change a Graphics shape or fill | needs `g.clear().rect(...).fill(...)`; new fill showed on next render |
| `sprite.texture = other` | effect next render, no extra call |
| `text.text = 'ABCDEFGH'` | `.width` updates immediately (82.4 -> 222.2 px); `text.style.fontSize = 20` also updates width at once; both re-render lazily |
| `Sprite.width/height` | are scale setters over the texture size: on a 1x1 `Texture.WHITE`, `width = 20` is `scale.x = 20`, so `scale.set(2)` afterwards gives a 2px sprite (my first run tripped on this) |

Conclusion: x, y, rotation, scale, alpha, visible, tint, texture are plain writes; Graphics geometry is the one that needs a method call (retained, rebuilt via `clear()` + draw calls). Constructors take an options object; most options are also assignable properties.

### Three (WebGLRenderer, manual `renderer.render`)

| Write | Result |
|---|---|
| `object.position.x = 5` / `position.set(x,y,z)` | effect next render |
| `object.position = new Vector3()` | **throws** `Cannot assign to read only property 'position'` (also `rotation`, `scale`, `quaternion`: own data properties, `writable: false`, no setter). A property-name based `setProperty` must write into them (`.set()` / `.copy()`), as R3F does. |
| `rotation.z = 1` | quaternion updates immediately (0.479) |
| `scale.set(40, 40, 1)` | effect |
| `visible = false` | gone next render |
| `renderOrder = n` | plain write, effect (section 5) |
| `matrix` | stale until render or `updateMatrix()`: after `position.set(1,2,3)`, `matrix.elements[12]` was only 1 after an explicit `updateMatrix()`; `matrixAutoUpdate` defaults true so render does it |
| `material.color.set(0x0000ff)` | effect next render |
| `material.opacity = .5` | effect; `SpriteMaterial.transparent` defaults to **true**, `MeshBasicMaterial.transparent` to false (needs `transparent = true` for opacity on meshes) |
| `sprite.material.map = canvasTexture2` (map already set) | effect next render, no `needsUpdate` |
| `sprite.material.map = tex` when it was `null` | **no effect until `material.needsUpdate = true`** (pixel stayed white, then magenta after) |
| mutate the texture's source canvas | no effect until `texture.needsUpdate = true` |
| `Sprite.rotation` | `Sprite` has `material.rotation` (radians, 2D), not the Object3D `rotation.z` (observed `material.rotation` 1, `sprite.rotation.z` 0) |
| `Sprite.center` | Vector2 anchor, default 0.5; used `center.set(0, 1)` for top-left |

Conclusion: Three's transform properties are read-only references to mutable vector objects (a name->`.set()` mapping is needed, the same job R3F's `applyProps` does); material and texture swaps have the `needsUpdate` caveats above; no scene-level dirty call is needed for transforms.

## 4. Event model

### Pixi

- `eventMode = 'static'`, `.on('pointerdown', fn)` is plain EventEmitter3 on the node. Works with `import 'pixi.js/events'` (in the full `pixi.js` entry it is already loaded). Listener count and `.off()` / `.removeAllListeners()` observed correct.
- In a real browser with an `Application`: clicking the canvas at (20,20) on a sprite with `eventMode='static'` fired `pointerdown` (`e.global` = 20,20) and `click`. No per-node setup beyond `eventMode` and `.on`.
- **Without an Application, no DOM:** I drove it by hand with `new EventBoundary(root)` and a hand-built `FederatedPointerEvent`, then `boundary.mapEvent(ev)`. Result: `pointerdown` and `pointertap` fired on the sprite for a hit, nothing on a miss. This required the root container to be a render group with `updateRenderGroupTransforms(root.renderGroup, true)` called first; without it `hitTest` returned null because world transforms are only computed during render. Observed: the render-group root's own `x` is not folded into children's `worldTransform`.
- Fresh `Container` had `eventMode: undefined` (the sprite had to be set to `static`). Only `eventMode` of `static`/`dynamic` receive pointer events; `passive` and `none` do not; ancestors do not need it for hit testing in my test.
- `added` / `removed` events observed on a Container.

### Three

No built-in pointer events. Minimal working code (tested, ortho camera, in Chromium; picked the sprite at (60,60), empty space returned 0 hits):

```js
const rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rc.setFromCamera(ndc, camera);                     // also sets rc.camera, which Sprite.raycast requires
  const hits = rc.intersectObjects(scene.children, true);
  hits[0]?.object.userData.onPointerDown?.(e);       // dispatch to a per-object handler
});
```

Observed: raycasting also hit an object with `visible = false` (`pick` returned 1 hit after `sp.visible = false`); Raycaster does not check `visible`.

What `@react-three/fiber@9.8.2` does (read from `dist/events-e51d7528.esm.js`, `createEvents`, `createPointerEvents`, `applyProps`):

1. Each node's handlers live on `object.__r3f.handlers` (`onClick`, `onPointerDown`, ...) with `eventCount`. In `applyProps`, when a prop starting `on...` changes the count, the object is **pushed into / spliced out of `state.internal.interaction`**, a flat array of "objects that have handlers".
2. One set of DOM listeners on the canvas (or a connected element): `click`, `contextmenu`, `dblclick`, `wheel`, `pointerdown`, `pointerup`, `pointerleave`, `pointermove`, `pointercancel`, `lostpointercapture` (the `DOM_EVENTS` table).
3. On each DOM event: `compute` sets `pointer` from `offsetX/Y` and calls `raycaster.setFromCamera`. Then `raycaster.intersectObject(obj, true)` for every object in `interaction`, flattened, sorted by priority then distance, with duplicates removed.
4. It then **bubbles manually**: for each hit it walks `object.parent` and emits an intersection for every ancestor that has `eventCount`. Events carry `stopPropagation`, `setPointerCapture`, `pointer`, `delta`, etc.
5. Enter/leave, hover set, click-vs-down distance and `onPointerMissed` are R3F's own bookkeeping on top of that.
6. On unmount `removeInteractivity` drops the object from `interaction`.

So a Gable `listen(node, 'pointerdown', h)` for Three would: register `node` in an interaction array and store `h`; use one canvas listener that raycasts the array and walks `parent` for bubbling; `listen`'s unsubscribe removes the handler and, if none left, the node from the array.

### Babylon (not in scope; noted only that picking is its own system, not tested)

## 5. 2D with Three; 3D with Pixi

### Three doing 2D (observed in Chromium)

- Pixel coordinate system: `new OrthographicCamera(0, W, 0, -H, -1000, 1000)` with `camera.position.z = 10` gives origin top-left, 1 world unit = 1 canvas pixel, **y negative downward**: author y is stored as `position.y = -y`. This rendered sprites and `PlaneGeometry` meshes correctly. `Sprite.center.set(0, 1)` anchors the top-left corner.
- Flipped variant `OrthographicCamera(0, W, 0, H, ...)` (y down natively) renders **nothing** for default-material sprites and `PlaneGeometry` meshes: winding is mirrored and they are back-face culled. It worked only with `side: DoubleSide`; text sprite from the same code showed 0 lit pixels in that mode. Test run in "flip" mode: sprite/mesh pixels all black.
- Sprites: `Sprite` + `SpriteMaterial` (`color`, `map`, `opacity`, `rotation`). A colour sprite, a `CanvasTexture` sprite, and texture swap all rendered.
- Text: `CanvasTexture` text sprite worked (2D canvas `fillText` -> `CanvasTexture` -> `Sprite`; 115 white-ish pixels for "Hello" at 24px). `troika-three-text@0.53.1` is the usual SDF route (peer `three >=0.125`, modified 2026-11-02); it constructs detached in Node. Rendering it was not run in this spike. `CanvasTexture` text needs a DOM canvas (not available in Node).
- Draw-order control (all sprites transparent by default; camera at z=10, depth test on):

| Test | Result |
|---|---|
| Two same-z sprites, children `[A,B]` | B on top |
| Children reversed `[B,A]` | **B still on top** (sort ties fall to object id, not child index) |
| `B.renderOrder = -1` | A on top |
| `B.renderOrder = 1` | B on top |
| `A.position.z = 1` (nearer camera) | A on top |
| `depthTest = depthWrite = false` on both | B on top before and after reversing children (still id-ordered) |
| `Group.renderOrder` on a parent group (no child values set) | applies to descendants: `g2.renderOrder = -1` put g1's red on top, `g1.renderOrder = -1` put g2's blue on top |

So for a Gable tree where child order means stacking order, a Three binding would have to derive `renderOrder` (or z) from sibling index on every insert/remove, or lean on `Group.renderOrder`. Pixi gets it from child order.

- Pixel coordinates in Pixi: the stage is already top-left, y-down, 1 unit = 1 pixel (`app.stage` at default transform).

### Pixi doing 3D

What exists in 8.23.0 (checked by constructing in Node): `Mesh` (needs `geometry`), `MeshGeometry`, `MeshPlane`, `PerspectiveMesh` (a 2D-with-perspective-quad, not a 3D engine), `Shader`, `GlProgram`, `GpuProgram`. `WebGLRenderer.prototype.resetState` is a function. Source-doc claim in `canvas-libraries.md`: 3D textures arrived in the WebGPU renderer in 8.22. So the in-library path is custom `Mesh` + `Shader` (GLSL/WGSL) with your own matrices; there is no camera, lights, materials library or loader for 3D models.

`pixi3d` (community, npm): latest 2.5.0, last modified 2023-12-17; I did not install or run it; given that date and Pixi 8 shipping in 2024 I did not check v8 compatibility.

Interop with Three: `resetState()` exists on the Pixi WebGL renderer, which is the hook for sharing one GL context between two renderers; I did not build that interop. Using both libraries means two separate scene graphs and two Renderer bindings.

## 6. Tree-shaken bundle sizes (Vite 8.3.8 library build, minify on, target es2022; sizes are the sum of all emitted `.js`/`.mjs` chunks)

Sources: `C:\Users\Jason\AppData\Local\Temp\spike\size\*.js` (not committed; code reproduced below).

| Bundle | Contents | min | gzip | brotli |
|---|---|---|---|---|
| Pixi, `Application` | `Application`, `Sprite`, `Text`, `Texture` from `'pixi.js'`; `preference: 'webgl'` | 730.3 KB | 190.1 KB | 165.2 KB |
| Pixi, bare `WebGLRenderer` | `WebGLRenderer`, `Container`, `Sprite`, `Text`, `Texture` | 609.8 KB | 155.2 KB | 131.4 KB |
| Three | `WebGLRenderer`, `OrthographicCamera`, `Scene`, `Sprite`, `SpriteMaterial`, `CanvasTexture` | 624.7 KB | 138.0 KB | 110.6 KB |
| Babylon | `Engine`, `Scene`, `FreeCamera`, `Vector3`, `Sprite`, `SpriteManager` + `spriteSceneComponent` via `@babylonjs/core/...js` deep imports | 1031.7 KB | 238.1 KB | 200.8 KB |

Caveats, all observed:

- The Pixi `Application` bundle contains the WebGL, WebGPU and Canvas renderer chunks (dynamic imports; `autoDetectRenderer` loads them lazily). A browser using WebGL fetches the entry plus the WebGL chunk, not all 730 KB; I did not compute that split separately. The bare-`WebGLRenderer` figure (610 KB) is the nearest measure of the WebGL-only path. I did not run that bundle in a browser.
- Pixi's tree shaking is coarse: the documented subpath entries (`pixi.js/text`, `/events`, `/graphics`, ...) are side-effect inits and the root entry imports `./events`, accessibility, filters, etc. I did not find a documented way (and the architecture guide I fetched shows none) to import fewer than these; the `skipExtensionImports: true` option exists in `AbstractRenderer.init` (it skips loading environment extensions and per-renderer loaders) but is not about bundle size.
- Three `WebGLRenderer` includes its whole shader library and uniforms code regardless of what scene is drawn.
- Babylon's size is dominated by `Engine`; `NullEngine` plus the sprite deep imports built in Node (below).

## 7. Babylon in Node

`NullEngine` works headless with no DOM (`node bab.mjs`, deep imports only):

```
BJS - Babylon.js v9.35.0 - Null engine
children [ 'b', 'c' ]                     // TransformNode parent assignment
box ok, children [ 'b', 'c', 'box' ]      // CreateBox with NullEngine
sprite ok 3 (sprites are not scene nodes: no parent/children)   // `'parent' in sprite` is false
scene.render() ok on NullEngine
has addChild function setParent function insertBefore undefined
after removeChild b [ 'c', 'box' ] b.parent null
```

`getChildren()` returns creation/assignment order, appending; there is no insert-at-index/before API (`insertBefore` undefined). `Sprite` is not a scene node, and `SpriteManager` needs an image URL/texture: 2D sprites are a parallel system to the node tree.

Minimal one-sprite size: see table in section 6 (1031.7 KB min / 238.1 KB gzip).

## Summary table

| Question | Pixi 8.23 | Three r187 |
|---|---|---|
| Objects usable without DOM/GPU | yes, except Text size queries | yes, except `WebGLRenderer` |
| Insert-before | `addChildAt(child, index)` | manual `children.splice` + `parent` (what R3F does) |
| Child order = draw order | yes | no (renderOrder / z / id) |
| Transform props | plain writable; `scale` takes a number | `position`/`rotation`/`scale` are read-only refs: write via `.set()` |
| Per-node events | built in (`eventMode` + `.on`), needs world transforms (render) | none; one canvas listener + Raycaster over a registered list, manual bubbling (R3F design) |
| 2D pixel coords | native (y down) | ortho camera `(0,W,0,-H)` with negated y |
| Text | `Text` / `BitmapText` / `HTMLText` built in | CanvasTexture sprite or `troika-three-text` |
| Min bundle (this spike) | 610 KB / 155 KB gz (WebGLRenderer only) to 730 KB / 190 KB gz (`Application`) | 625 KB / 138 KB gz |
