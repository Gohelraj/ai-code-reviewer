# Repository Memory

## Snapshot

- Project: `ai-code-reviewer`
- Type: browser-first AI code review workspace
- Primary use case: analyze GitHub pull requests and GitLab merge requests from a pasted URL
- Core outputs:
  - change summary
  - execution flow analysis
  - code review with findings and trust signals
  - linked issue requirements coverage
  - MR description review
- Frontend: React 19 + TypeScript + Vite 7
- Styling: Tailwind CSS, CSS variables, Framer Motion
- Backend: minimal Express server for static hosting and GitLab proxying
- AI provider: OpenRouter, called directly from the browser
- Persistence: localStorage + IndexedDB only

## Product Model

This app is intentionally client-heavy and BYOK.

- Users paste a GitHub PR URL or GitLab MR URL.
- The app fetches metadata plus changed-file diffs.
- Summary and execution-flow analysis can run automatically after fetch.
- Code review, requirements check, and MR description review are user-triggered follow-up actions.
- OpenRouter API calls are made directly from the browser using the user-supplied key.
- GitLab API calls go through `/api/gitlab` because GitLab does not expose permissive CORS headers.

There is no real application backend for auth, shared state, or server-side AI orchestration.

## Runtime Architecture

### Frontend responsibilities

- Parse GitHub/GitLab PR and issue URLs.
- Fetch GitHub data directly from GitHub REST APIs.
- Fetch GitLab MR and issue data through the local/prod proxy.
- Build structured AI prompts and JSON-schema responses.
- Render the review workflow UI and diff experience.
- Persist local settings, repo defaults, and history.

### Backend responsibilities

`server.js` only:

- serves `dist/`
- proxies `/api/gitlab/*` to `https://gitlab.com/*`
- serves `index.html` as the SPA fallback

## Main Source Layout

### Entrypoints

- `index.html`: Vite entry HTML
- `src/main.tsx`: React root, React Query provider, toaster, app bootstrap
- `src/App.tsx`: top-level orchestration and app state machine
- `server.js`: production Express server
- `vite.config.ts`: Vite config, aliasing, dev proxy, port config

### Core UI

- `src/components/InputForm.tsx`
  - PR/MR URL input
  - optional token and linked issue input
  - AI settings entry point
  - recent history access
- `src/components/ResultsDashboard.tsx`
  - main post-analysis workspace
  - tab routing
  - history, export, AI settings, keyboard shortcuts
- `src/components/NavigationSidebar.tsx`
  - tab navigation
  - file tree
  - notes and export actions
- `src/components/ChangeSummaryPanel.tsx`
  - summary output and diff browsing
- `src/components/ExecutionFlowPanel.tsx`
  - execution flow view
- `src/components/FlowDiagram.tsx`
  - diagram rendering using React Flow + dagre
- `src/components/CodeReviewPanel.tsx`
  - findings UI, filtering, selection, posting, fix generation surface
- `src/components/RequirementsPanel.tsx`
  - linked issue requirement coverage analysis
- `src/components/MRDescriptionPanel.tsx`
  - description quality review and rewrite suggestions
- `src/components/DiffViewer.tsx`
  - inline and split diff viewing with syntax highlighting

### Libraries / utilities

- `src/lib/api.ts`
  - GitHub/GitLab fetch logic
  - OpenRouter requests
  - schema definitions
  - prompt construction
  - review-context preparation
- `src/lib/github-comment.ts`
  - GitHub/GitLab comment posting logic
- `src/lib/review-utils.ts`
  - review diffing, repo keying, UI state helpers, hotspot/test-gap helpers
- `src/lib/codeowners.ts`
  - CODEOWNERS parsing and reviewer suggestion helpers
- `src/lib/history.ts`
  - IndexedDB persistence for prior analyses
- `src/lib/export.ts`
  - markdown and JSON exports
- `src/lib/highlighter.ts`
  - Shiki highlighter lifecycle
- `src/lib/cost.ts`
  - model cost estimation
- `src/lib/useDarkMode.ts`
  - theme persistence and system sync
- `src/lib/utils.ts`
  - utility helpers such as `cn()`

### Shared types

`src/types.ts` is the main contract for fetched MR/PR data and AI outputs, including:

- `MRData`
- `PRInfo`
- `FileDiff`
- `DiffRefs`
- `ChangeSummary`
- `ExecutionFlow`
- `CodeReview`
- `ReviewIssue`
- `RequirementsCheck`
- `MRDescriptionReview`
- `AnalysisState`

## App State / Flow

`src/App.tsx` is the central coordinator.

- Initial fetch gathers MR/PR diff data and optionally linked issue data.
- Summary runs automatically after fetch.
- Execution flow may also auto-run depending on `analysisStartMode`.
- Code review, requirements, and MR description review are triggered manually.
- Analysis state tracks tabs, selected file, selected issue, notes, review chat, and loading/error state.

Important step values in state:

- `idle`
- `fetching`
- `summarizing`
- `flowing`
- `reviewing`
- `done`
- `error`

## Platform Integration Details

### GitHub

- Direct browser calls to GitHub REST API
- PR metadata from `/repos/{owner}/{repo}/pulls/{number}`
- changed files from `/pulls/{number}/files`
- optional raw file content fetch via `raw_url`
- general and inline comment posting supported

### GitLab

- Requests routed through `/api/gitlab/api/v4/...`
- MR metadata, changes, commits, issue/work-item fetches supported
- `diff_refs` captured for inline discussion posting
- inline and fallback general comment posting supported

## AI / Prompting Model

OpenRouter is called with strict JSON-schema response formatting.

Main analysis surfaces handled in `src/lib/api.ts`:

- summary
- execution flow
- code review
- requirements coverage
- MR description review

Context-management constraints in the current implementation matter:

- diff snippets are truncated for lighter analyses
- review mode uses larger full-file context
- full-content hydration is selective and capped
- total review context is capped to avoid runaway prompts

Behavioral changes in `src/lib/api.ts` can have large product impact.

## Persistence Model

### localStorage

- AI config
- repo defaults
- theme
- navigation/sidebar UI state

### IndexedDB

- database: `mergeai_history`
- store: `analyses`
- stores recent analysis history with URL, metadata, analysis state, and AI config

## UX / Design System

- Tailwind CSS with CSS-variable-driven tokens
- fonts loaded in `src/index.css`
  - `DM Sans`
  - `Lora`
  - `IBM Plex Mono`
- theme palette is neutral/charcoal with green accent
- dark mode works by toggling `.dark` on the root element
- Framer Motion is used across the interface
- print styles intentionally strip navigation and nonessential UI

## Build / Run

### Scripts

- `npm run dev`: Vite dev server
- `npm run build`: production build
- `npm run preview`: Vite preview
- `npm start`: serve built app with Express
- `npm run lint:types`: TypeScript check
- `npm run lint:css`: stylelint on `src/**/*.css`
- `npm run lint`: typecheck + css lint
- `npm run test`: Vitest watch
- `npm run test:run`: Vitest once
- `npm run check`: lint + tests

### Environment assumptions

- Node.js 20+
- local OpenRouter API key entered in the UI
- dev/prod app commonly runs on port `3000`

## Testing

- Vitest
- Testing Library
- tests exist in both `src/components/*.test.tsx` and `src/lib/*.test.ts`

## Current Codebase Realities

- `src/main.tsx` is the active React entrypoint.
- There is no `src/main.ts` in the current repo.
- README is broadly useful and currently matches the product direction reasonably well.
- TypeScript is intentionally permissive:
  - `strict: false`
  - many safety flags are disabled
- `package.json` contains several libraries that may not all be on the hot path; dependency cleanup could be worthwhile later.

## High-Sensitivity Files

When debugging or making behavioral changes, start with:

- `src/App.tsx`
- `src/lib/api.ts`
- `src/lib/github-comment.ts`
- `src/lib/review-utils.ts`
- `src/components/ResultsDashboard.tsx`
- `src/components/CodeReviewPanel.tsx`
- `src/components/NavigationSidebar.tsx`
- `src/components/DiffViewer.tsx`

## Working Mental Model

Treat this repository as:

- a client-heavy review SPA
- with a very thin server layer
- optimized around structured AI output
- focused on reviewing external code changes, not editing local repositories

The biggest correctness risks usually live in:

- URL parsing
- API response assumptions
- context truncation and full-content hydration
- schema and prompt changes
- posting/comment-position logic
- persistence compatibility
