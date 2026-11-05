---
id: TASK-1.19
title: Project scaffolding and starter template
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 06:58'
updated_date: '2026-11-05 07:02'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What does a new gable project look like on disk, and how does someone start one without a CLI or schematics (out of scope)? Consider the starter template contents (Vite config with @gable/vite and Tailwind v4, tsconfig with the language-service plugin and renderer option, test setup with @gable/testing, entry file and root component), how it is distributed (e.g. a degit/template repo or an npm create initializer), and what the docs' first-run path is, given the package layout.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 07:02
---
Resolved with the user.

**Distribution**: create-gable, one more lockstep package (npm create gable@latest my-app): asks only for a project name, no flags beyond --help, copies one template directory from the monorepo, substitutes names and versions, generates nothing afterwards (no schematics). Reads npm_config_user_agent to print the matching package-manager commands; the template ships no lockfile.
**Template**: one template, no variants or flags, no router/forms/http (one-line imports from @gable/core entry points). Vite + @gable/vite + TypeScript + Tailwind v4 + Vitest + @gable/testing + Prettier with @gable/prettier-plugin; no ESLint. Files: index.html, vite.config.ts, tsconfig.json, package.json (scripts dev, build, preview, test, check, format), src/main.ts (bootstrap), src/global.css (Tailwind import), src/root.ts, src/counter.ts (signal state), src/counter-store.ts (injected service), src/counter.test.ts (mount). kebab-case files, no role suffix, one class per file, tests beside source.
**Language service wiring**: tsconfig plugins entry for @gable/language-service plus explicit renderer option @gable/renderer-dom; check script runs gable-check for CI; .vscode recommends gable-vscode and sets typescript.tsdk to the workspace TypeScript.
**Versions**: @gable/* deps written at ~ the initializer's own version; third-party deps (vite, @tailwindcss/vite, vitest, typescript, rxjs, prettier) at ^ ranges the monorepo already tests. CI scaffolds the template into a temp directory, runs install, check, test and build, and asserts the production bundle has no HMR code.
**Docs**: short template README (five commands plus a link) and one Getting started page teaching HMR by editing the sample (template, computed field, service), then test, check, build, and the day-one HMR limits (renames lose values, static hmr='reset' opt-out). A separate manual-setup page for adding gable to an existing Vite app (install, plugin line, tsconfig requirements @gable/vite enforces, entry file, renderer option).
**Correction**: the DOM renderer is @gable/renderer-dom everywhere; the Template language service v0 design default renderer option @gable/dom is stale.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scaffolding decided: create-gable copies a single Vite/TypeScript/Tailwind v4/Vitest template with full language-service wiring, versions pinned to the lockstep release and verified by a CI scaffold test; Getting started and manual-setup docs. Agreed with the user in a grilling session.
<!-- SECTION:FINAL_SUMMARY:END -->
