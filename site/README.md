# Gable site

The Gable marketing site, written as a Gable app. It is an npm workspace, so it builds against the packages in this repo.

```sh
npm run build                 # once, from the repo root: builds the packages
npm run dev -w site           # dev server with HMR
npm test -w site              # mounted tests
npm run check -w site         # tsc and gable-check
SITE_BASE=/gable/ npm run build -w site
```

- Sections are components in `src/`, assembled in `src/root.ts`. Theme (dark, light, OS default) lives in `src/theme.ts`.
- Screenshots are in `public/img/`. Regenerate them from the gallery, Designer and Editor examples when the UI changes.
- `.github/workflows/pages.yml` builds with `SITE_BASE=/gable/` and deploys to GitHub Pages. In the repository settings, set **Pages > Source** to **GitHub Actions** once.
