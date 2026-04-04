# Tech Stack

## Core Technologies

- React 19 with TypeScript 5
- Vite 7 (build tool and dev server)
- Node.js 20+ runtime
- Express 5 for production server and GitLab API proxy

## UI & Styling

- Tailwind CSS 3.3.5 with custom CSS variables for theming
- Framer Motion for animations
- Lucide React for icons
- Dark/light/system theme support via CSS class switching
- Custom design tokens in CSS variables (colors, shadows, typography, transitions)

## State & Data Management

- React hooks for local state
- TanStack React Query for async state
- IndexedDB for analysis history persistence
- localStorage for AI settings and repo defaults
- URL params for deep-linkable UI state (tab, file, issue selection)

## Code Highlighting & Visualization

- Shiki for syntax highlighting (trimmed to common review languages)
- @xyflow/react for flow diagrams
- Recharts for data visualization
- @dagrejs/dagre for graph layout

## Forms & Validation

- React Hook Form with Zod resolvers
- Zod for schema validation

## Testing

- Vitest as test runner
- Testing Library (React + Jest DOM + User Event)
- jsdom for DOM environment

## Development Proxy

Vite dev server proxies `/api/gitlab/*` to `https://gitlab.com` to work around CORS restrictions.

## Common Commands

```bash
# Development
npm run dev              # Start Vite dev server on port 3000

# Building
npm run build            # Production build to dist/
npm run preview          # Preview production build locally

# Production
npm start                # Serve dist/ with Express + GitLab proxy (PORT=3000 default)

# Testing & Validation
npm run test             # Run Vitest in watch mode
npm run test:run         # Run Vitest once
npm run lint:types       # TypeScript typecheck (tsc --noEmit)
npm run lint:css         # Stylelint on src/**/*.css
npm run lint             # Run both type and CSS linting
npm run check            # Full validation: lint + test:run

# Docker
docker compose up -d     # Run containerized app on port 3000
```

## TypeScript Configuration

- Target: ES2020
- Module: ESNext with bundler resolution
- JSX: react-jsx (React 19 automatic runtime)
- Strict mode: disabled for rapid prototyping
- Path alias: `@/*` maps to `./src/*`

## Build Output

- Production build outputs to `dist/`
- Express server serves static files from `dist/` and proxies GitLab API requests
- Default port: 3000 (override with PORT env var)
