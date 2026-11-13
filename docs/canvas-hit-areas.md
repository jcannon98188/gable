# Hit areas in a canvas scene

By default a scene node is hit where its bounds are (Pixi's behaviour). To make a node hittable somewhere else, say a small icon with a generous tap target or a round button, declare the hit shape as a child of the node.

```html
<sprite [texture]="icon()" (pointertap)="open()">
  <hit-circle x="16" y="16" [radius]="24"></hit-circle>
</sprite>
```

A node with a `hit-*` child gets that shape as its `hitArea`. Listening for an event on the node still turns on `eventMode: static` for you, exactly as without a hit child.

## Tags

Every scene tag (`container`, `sprite`, `text`, `graphics`, ...) accepts these children. They take the geometry of the matching graphics shape and no painting:

| Tag                | Properties                                   | Pixi shape         |
| ------------------ | -------------------------------------------- | ------------------ |
| `<hit-rect>`       | `x`, `y`, `width`, `height`                  | `Rectangle`        |
| `<hit-rounded-rect>` | `x`, `y`, `width`, `height`, `radius`      | `RoundedRectangle` |
| `<hit-circle>`     | `x`, `y`, `radius`                           | `Circle`           |
| `<hit-ellipse>`    | `x`, `y`, `halfWidth`, `halfHeight`          | `Ellipse`          |
| `<hit-polygon>`    | `points` (a flat `number[]`, at least three points) | `Polygon`   |

Coordinates are in the node's local space. Properties bind with signals like any other (`[radius]="r()"`), and `@if` and `@for` work around hit children, so a shape follows its state.

## Several shapes, and `[hitArea]`

- Several hit children make one hit area, the union of their shapes.
- While a node has hit children they win over a bound `[hitArea]`. Remove the children and the bound `[hitArea]` applies again.
- A polygon with fewer than three points contributes nothing until it has them.
- Hit children are not display nodes: they take no events and no paint properties (`fill`, `stroke`). Binding one is an error that names the tag.

## Testing

The scene test renderer hit-tests hit children with the same rules, so `scene.pointer.down(x, y)` and `scene.hitTest(x, y)` respect them. `find(...)` results list them in `hitShapes`:

```ts
const scene = createSceneTestRenderer();
// ... mount a scene component whose template has <hit-circle x="20" y="20" radius="10">
scene.pointer.down(50, 50); // inside the node's bounds but outside the circle: nothing fires
scene.pointer.down(25, 25); // inside the circle: the node's (pointerdown) handler runs
```

A scene component projected into `<gable-canvas>` from a page cannot inject the boundary's services (ADR 0019); build such a test with a host component that has its own template.
