# Repository Memory

## Snapshot

- Project: `ai-code-reviewer`
- Type: self-hosted AI code review web app
- Primary purpose: analyze GitHub pull requests and GitLab merge requests, then generate:
  - change summaries
  - execution-flow views
  - senior-style code reviews
  - requirements coverage checks against linked issues
  - MR/PR description quality reviews
- Frontend: React + TypeScript + Vite
- Backend: small Express server used only for static hosting and GitLab proxying
- AI provider: OpenRouter, called directly from the browser

## What The App Actually Does

The user pastes a GitHub PR URL or GitLab MR URL into the landing form. The app fetches diff metadata plus file context, then runs AI analysis in stages:

1. Fetch MR/PR metadata and changed files.
2. Optionally fetch a linked GitHub or GitLab issue.
3. Run summary analysis and execution-flow analysis in parallel.
4. Let the user manually trigger:
   - code review
   - requirements check
   - MR description review
5. Allow export/copy/posting workflows from the results UI.

The app is intentionally BYOK: the OpenRouter API key is entered in the UI and sent from the browser to OpenRouter.

## Runtime Architecture

### Frontend responsibilities

- Fetch GitHub PRs directly from GitHub REST APIs.
- Fetch GitLab MRs and issues through `/api/gitlab` because GitLab CORS is blocked.
- Call OpenRouter directly from the browser using strict JSON-schema responses.
- Render all review surfaces and posting tools.
- Persist local user state in browser storage.

### Backend responsibilities

`server.js` is minimal:

- serves the built `dist/` directory
- proxies `/api/gitlab/*` to `https://gitlab.com/*`
- provides SPA fallback to `dist/index.html`

There is no real application backend, database, auth service, or server-side AI pipeline.

## Main Source Layout

### Entrypoints

- `index.html`: boots the app through `/src/main.tsx`
- `src/main.tsx`: React root, React Query provider, toast provider
- `src/App.tsx`: top-level state machine and orchestration
- `server.js`: production Express server
- `vite.config.ts`: Vite config, alias `@ -> src`, dev GitLab proxy, fixed port `3000`

### Core UI components

- `src/components/InputForm.tsx`
  - landing page
  - PR/MR URL input
  - optional repo token input
  - optional linked issue input
  - AI settings panel
  - recent review history
- `src/components/ResultsDashboard.tsx`
  - top-level post-analysis workspace
  - keyboard shortcuts
  - export/copy/history modal/model-settings modal
  - tab routing between summary/flow/review/requirements/MR-description
- `src/components/NavigationSidebar.tsx`
  - left nav with progress tracking
  - inline changed-file tree
  - notes area
  - export and print actions
- `src/components/ChangeSummaryPanel.tsx`
  - summary cards + changed-file diffs
- `src/components/ExecutionFlowPanel.tsx`
  - layer-based execution flow
  - list and diagram view
- `src/components/FlowDiagram.tsx`
  - React Flow + dagre auto-layout diagram
- `src/components/CodeReviewPanel.tsx`
  - score/verdict/issues display
  - issue filtering/grouping
  - dismiss/select/edit issue comments
  - inline/general comment posting to GitHub/GitLab
- `src/components/RequirementsPanel.tsx`
  - requirement coverage score
  - fulfilled/partial/missing requirement breakdown
- `src/components/MRDescriptionPanel.tsx`
  - MR description quality score
  - suggestions and generated replacement description
- `src/components/DiffViewer.tsx`
  - inline/split diff viewer
  - custom patch parsing
  - Shiki highlighting
  - collapsible unchanged sections

### Utility/libs

- `src/lib/api.ts`
  - URL parsing for GitHub/GitLab PRs and issues
  - diff fetching
  - full file-content fetching for context-aware review
  - OpenRouter request builder
  - JSON schemas for all AI outputs
  - analysis prompt construction
- `src/lib/github-comment.ts`
  - posts general comments
  - posts inline GitHub review comments
  - posts GitLab discussions with `diff_refs`
  - falls back to general comments when inline positioning fails
- `src/lib/history.ts`
  - IndexedDB persistence of past analyses
- `src/lib/export.ts`
  - markdown export
  - JSON export
- `src/lib/cost.ts`
  - rough token/cost estimates by model
- `src/lib/highlighter.ts`
  - singleton Shiki highlighter
- `src/lib/useDarkMode.ts`
  - theme persistence and system-theme sync
- `src/lib/utils.ts`
  - `cn()` helper using `clsx` + `tailwind-merge`

### Shared types

`src/types.ts` defines the full app data contract:

- `MRData`, `PRInfo`, `FileDiff`, `DiffRefs`
- `ChangeSummary`
- `ExecutionFlow`
- `CodeReview`, `ReviewIssue`
- `RequirementsCheck`
- `MRDescriptionReview`
- `AnalysisState`

## Analysis Pipeline Details

### Fetch stage

`fetchMRDiff()` routes based on URL:

- GitHub:
  - `GET /repos/{owner}/{repo}/pulls/{number}`
  - `GET /repos/{owner}/{repo}/pulls/{number}/files`
  - fetches each `raw_url` for full file context when available
- GitLab:
  - proxied through `/api/gitlab/api/v4/...`
  - fetches MR metadata, changes, commits count
  - fetches raw file contents from repository files API
  - captures `diff_refs` for inline discussion posting

### AI stage

OpenRouter is called with `response_format.type = "json_schema"` and strict schemas for:

- summary
- execution flow
- code review
- requirements coverage
- MR description review

Important context limits in `src/lib/api.ts`:

- per-file diff cap for summary/flow: `8,000` chars
- per-file full-content cap for review: `25,000` chars
- full-content fetch cap: `30,000` chars
- total review context cap: `120,000` chars

### App state sequencing

`App.tsx` manages a simple state machine:

- `idle`
- `fetching`
- `summarizing`
- `flowing`
- `reviewing`
- `done`
- `error`

Summary and flow run automatically after fetch. Review/requirements/MR-description are manual follow-up actions.

## Storage Model

### localStorage

- AI config key: `mergeai_ai_config`
- theme key: `mergeai_theme`
- nav sidebar expansion: `nav-sidebar-expanded`

### IndexedDB

- DB name: `mergeai_history`
- Store: `analyses`
- Max retained entries: `20`
- Each history entry stores:
  - URL
  - PR title
  - platform
  - model
  - timestamp
  - full `AnalysisState`
  - `AIConfig`

## Posting / Collaboration Features

The app can post review findings back to the source platform.

### GitHub

- inline comments: PR review comments API
- fallback/general comments: issue comments API on the PR

### GitLab

- inline comments: MR discussions API using `position`
- fallback/general comments: MR notes API

Issues can be:

- selected in bulk
- dismissed/restored
- edited before posting
- copied individually as markdown

## Styling / Design System

- Tailwind CSS with custom CSS-variable-driven theme tokens
- Fonts loaded from Google Fonts in `src/index.css`
  - `DM Sans`
  - `Lora`
  - `IBM Plex Mono`
- Theme palette is neutral/dark-charcoal with green accent
- Dark mode toggles by applying `.dark` to `document.documentElement`
- Motion uses Framer Motion heavily
- Print styles hide nav/header and simplify cards

## Build / Run / Deploy

### Scripts in `package.json`

- `dev`: Vite dev server
- `build`: Vite production build
- `preview`: Vite preview
- `start`: run `server.js`
- `lint`, `lint:*`, and `check:*` are present but the lint toolchain is not fully healthy in the current repo state

### Docker

- multi-stage `Dockerfile`
  - builder: `npm ci` + `npm run build`
  - runner: production install + `server.js` + `dist/`
- `docker-compose.yml` exposes `${PORT:-3000}`

### Public assets

- `public/favicon.svg`
- `public/vite.svg`
- `public/_redirects`

## Important Current Realities / Inconsistencies

These are worth remembering before future work:

- `src/main.ts` is leftover Vite starter code and is not used by the app.
- `src/Shell.tsx` looks like a generic mobile shell helper and is not part of the main flow.
- `src/FileTreeSidebar.tsx` appears redundant now that `NavigationSidebar.tsx` embeds the file tree.
- `package.json` references:
  - `eslint`
  - root `scripts/check-css-variables.js`
  - root `scripts/check-css-classes.js`
  - `bun run ...`
  but:
  - there is no root `scripts/` directory
  - `eslint` is not declared in `package.json`
  - lint execution is likely broken in the current state
- `README.md` is useful but not fully trustworthy as a source of truth; some details are stale/duplicated.
- The workspace currently contains `dist/` and `node_modules/`, but those are environment artifacts, not architecture.
- TypeScript is intentionally permissive:
  - `strict: false`
  - many `noImplicit*`/safety checks disabled

## Dependency Notes

Dependencies clearly used by the current codebase include:

- `react`, `react-dom`
- `vite`, `typescript`
- `@vitejs/plugin-react`
- `@tanstack/react-query`
- `framer-motion`
- `lucide-react`
- `@xyflow/react`
- `@dagrejs/dagre`
- `shiki`
- `express`
- `http-proxy-middleware`
- `date-fns`
- `clsx`
- `tailwind-merge`
- `tailwindcss`
- `tailwindcss-animate`
- `postcss`
- `autoprefixer`
- `stylelint`

There are also several dependencies in `package.json` that are not obviously part of the current main code path from the files inspected, so dependency cleanup may be worthwhile later.

## Mental Model For Future Work

When changing this repo, think of it as:

- a client-heavy SPA
- with a thin static/proxy server
- built around AI-generated structured JSON
- optimized for reviewing external code changes rather than editing local repos

The most sensitive files for behavior changes are:

- `src/App.tsx`
- `src/lib/api.ts`
- `src/lib/github-comment.ts`
- `src/components/ResultsDashboard.tsx`
- `src/components/CodeReviewPanel.tsx`
- `src/components/NavigationSidebar.tsx`
- `src/components/DiffViewer.tsx`

If future work involves correctness, start by checking:

- URL parsing logic
- GitHub/GitLab API assumptions
- OpenRouter response schemas
- file context truncation rules
- inline-comment fallback behavior
- local persistence compatibility

## Suggested Follow-up Cleanup

- remove dead starter/legacy files
- repair or remove broken lint scripts
- audit unused dependencies
- tighten TypeScript settings gradually
- sync README with current behavior
