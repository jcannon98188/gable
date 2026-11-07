# gable-ui gallery

Every `@gable/ui` component on one page (buttons and overlays, form controls, Form and Field, menus, display and navigation components), with a dark-mode toggle. `npm test` runs on the in-memory renderer, so Zag machines that need a real DOM (menus, combobox) are only rendered, not driven; their behaviour is tested in `packages/ui` under jsdom.

Run it from the repository root (this installs the local, unpublished packages from `vendor/`):

```
npm install
npm run pack:local examples/ui-gallery
cd examples/ui-gallery
npm install
npm run dev
```

`npm run build`, `npm test` (in-memory renderer) and `npm run check` (`tsc` + `gable-check`) also work. After changing `packages/ui` or `packages/ui-primitives`, run `npm run pack:local examples/ui-gallery` again and, on an EINTEGRITY error, delete `package-lock.json` and `node_modules/@gable`.
