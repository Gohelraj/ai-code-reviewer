# Project Structure

## Root Layout

```
├── src/                    # React application source
├── api/                    # Serverless API functions (Vercel)
├── public/                 # Static assets
├── dist/                   # Production build output
├── .kiro/                  # Kiro AI assistant configuration
├── server.js               # Express production server
├── vite.config.ts          # Vite build configuration
├── vitest.config.ts        # Test configuration
├── tailwind.config.cjs     # Tailwind CSS configuration
└── tsconfig.json           # TypeScript configuration
```

## Source Directory (`src/`)

### Components (`src/components/`)

React components organized by feature area:

- `InputForm.tsx` - Initial PR/MR URL input and settings
- `AnalysisProgress.tsx` - Loading states during analysis
- `ResultsDashboard.tsx` - Main results container with tab navigation
- `ChangeSummaryPanel.tsx` - Change summary display
- `ExecutionFlowPanel.tsx` - Execution flow visualization
- `CodeReviewPanel.tsx` - Code review results with issues
- `RequirementsPanel.tsx` - Requirements checking against linked issues
- `MRDescriptionPanel.tsx` - MR description review and suggestions
- `DiffViewer.tsx` - Inline/split/full-file diff viewing
- `FlowDiagram.tsx` - Visual flow diagram rendering
- `AISettings.tsx` - OpenRouter config, model selection, presets
- `RepoContextSettings.tsx` - Repo-specific memory and defaults
- `ReviewModePicker.tsx` - Quick vs deep review selection
- `NavigationSidebar.tsx` - File and issue navigation
- `ThemeToggle.tsx` - Dark/light/system theme switcher
- `ConfirmModal.tsx` - Confirmation dialogs
- `Skeleton.tsx` - Loading skeleton components

### Library (`src/lib/`)

Utility modules and business logic:

- `api.ts` - GitHub/GitLab API integration, OpenRouter calls
- `history.ts` - IndexedDB persistence for analysis history
- `review-utils.ts` - Review comparison, diff computation, URL parsing
- `codeowners.ts` - CODEOWNERS file parsing and reviewer suggestions
- `github-comment.ts` - GitHub/GitLab comment posting logic
- `export.ts` - Markdown/JSON export functionality
- `repo-memory.ts` - Repository review memory management
- `token-storage.ts` - Secure token handling
- `highlighter.ts` - Shiki syntax highlighting setup
- `cost.ts` - API cost estimation
- `useDarkMode.ts` - Theme management hook
- `utils.ts` - General utilities

### Core Files

- `App.tsx` - Root component with analysis orchestration
- `main.tsx` - React app entry point
- `types.ts` - TypeScript type definitions for domain models
- `index.css` - Global styles and CSS variables

### Test Setup

- `src/test/setup.ts` - Vitest global test configuration

## API Directory (`api/`)

- `gitlab.ts` - Vercel serverless function for GitLab proxy (production alternative to Express)

## Component Organization Patterns

- Components are co-located with their tests (e.g., `DiffViewer.tsx` + `DiffViewer.test.tsx`)
- Lib modules follow the same pattern (e.g., `api.ts` + `api.test.ts`)
- Each component is self-contained with its own state management
- Shared types live in `src/types.ts`
- Shared utilities live in `src/lib/`

## State Management Patterns

- Top-level state in `App.tsx` using `useState` and callbacks
- Analysis state follows a step-based flow: idle → fetching → summarizing → flowing → done
- UI state (active tab, selected file, selected issue) synced to URL params
- Persistent state stored in IndexedDB (history) and localStorage (settings)
- Deep linking via URL params enables shareable result states

## Import Alias

Use `@/*` to import from `src/`:

```typescript
import { api } from '@/lib/api';
import { DiffViewer } from '@/components/DiffViewer';
```

## Naming Conventions

- Components: PascalCase (e.g., `CodeReviewPanel.tsx`)
- Utilities: camelCase (e.g., `review-utils.ts`)
- Types: PascalCase interfaces (e.g., `AnalysisState`, `CodeReview`)
- Hooks: camelCase with `use` prefix (e.g., `useDarkMode`)
- Test files: Same name as source with `.test.ts` suffix
