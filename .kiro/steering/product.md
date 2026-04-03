# Product Overview

AI Code Reviewer is a browser-first code review workspace for GitHub pull requests and GitLab merge requests. Users paste a PR/MR URL, provide their OpenRouter API key, and receive structured AI-powered review outputs without backend infrastructure.

## Core Capabilities

- Change summary with purpose, scope, impact, tech stack, and breaking-change detection
- Execution-flow analysis grouped by architectural layers
- Senior-style code review with scoring, verdict, strengths, issues, and merge-readiness guidance
- Quick and deep review modes for balancing cost and depth
- Requirements checking against linked GitHub/GitLab issues
- MR description review with suggested rewrites
- Follow-up chat grounded in diff and file context
- Selective posting back to GitHub/GitLab as inline or general comments

## Architecture Philosophy

- Client-heavy: Summary and execution-flow run automatically; full code review, requirements, and MR description are manual to control API spend
- GitLab API requests proxy through a minimal Express server due to CORS restrictions
- OpenRouter requests made directly from browser with user-provided keys
- Local storage: Analysis history in IndexedDB, settings in localStorage
- Deep-linkable state via URL params for tab, file, and issue selection

## User Workflow

1. Paste GitHub PR or GitLab MR URL
2. App fetches metadata and diffs
3. Summary and execution flow run automatically (unless summary-only mode selected)
4. Code review runs on demand with lazy full-file hydration for richer context
5. Optional follow-up: requirements check, MR description review, PR chat, fix generation, comment posting

## Key Features

- Review trust signals: confidence levels, rationale, evidence, verification status
- Merge-readiness gates based on score, critical issues, test gaps, requirements coverage
- Review rerun comparison showing score delta and finding changes
- Named presets for model, custom rules, posting mode
- Repo-specific defaults and review memory
- CODEOWNERS-based reviewer suggestions
- Local history with cached-analysis reload and manual refresh
- Export as Markdown or JSON
