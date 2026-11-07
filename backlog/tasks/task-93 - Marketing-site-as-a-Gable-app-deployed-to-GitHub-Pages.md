---
id: TASK-93
title: Marketing site as a Gable app, deployed to GitHub Pages
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T18:20:00Z'
updated_date: '2026-11-07T18:23:00Z'
labels:
  - site
dependencies: []
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the Gable marketing site (designed in the Claude design artifact: dark and light themes, real screenshots of gable-ui, Designer and Editor) as a real Gable app in site/, an npm workspace so it builds against the in-repo packages. Deploy to GitHub Pages from a GitHub Actions workflow. Theme follows the OS setting with a manual toggle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 site/ is a workspace Gable app that builds with vite and a GitHub Pages base path
- [x] #2 Page has all sections: hero, no compiler, true HMR, framework, state/forms/i18n, tooling, gable-ui, Designer, Editor, packages, get started, footer
- [ ] #3 Dark and light themes: follows prefers-color-scheme, manual toggle persisted in localStorage
- [x] #4 Real screenshots committed under site/public and used for gable-ui, Designer and Editor
- [x] #5 A mounted test covers the page and the theme toggle; gable-check and tsc pass
- [ ] #6 GitHub Actions workflow builds and deploys site/ to Pages
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. site/ npm workspace (package.json, vite.config with BASE env, tsconfig, index.html).
2. Components: SiteRoot, ThemeStore (root service, localStorage + prefers-color-scheme), section components, copy as data.
3. CSS ported from the design tokens (dark/light) in src/site.css.
4. Screenshots into public/img.
5. Test mounting page + theme toggle.
6. .github/workflows/pages.yml: build packages, build site with BASE=/gable/, deploy via actions/deploy-pages.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as workspace site/ (generated from the design artifact markup, now hand-owned). Verified: tsc, gable-check, 2 mounted tests, vite build with SITE_BASE, headless render of the dark theme. Not yet verified: manual theme toggle persistence and prefers-color-scheme in a real browser; the Pages workflow has not run (needs push and Pages source set to GitHub Actions).
<!-- SECTION:NOTES:END -->
