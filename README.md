# AI Code Reviewer

A self-hosted, AI-powered code review tool for **GitHub Pull Requests** and **GitLab Merge Requests**. Paste a PR/MR link, get instant change summaries, execution flow diagrams, and a comprehensive senior-level code review — then selectively post issues as inline comments back to your MR.

> **BYOK (Bring Your Own Key)** — Uses [OpenRouter](https://openrouter.ai) so you pick the model (Claude, GPT, Gemini, Llama, etc.) and pay only for what you use.

---

## Features

### Core Analysis

| Feature                  | Description                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Change Summary**       | AI-generated purpose, scope, key changes with impact levels, tech stack detection, breaking change alerts                                                           |
| **Execution Flow**       | Architectural layer grouping of changed files with entry points and data flow. Interactive **ReactFlow diagram** with dagre auto-layout                             |
| **Code Review**          | Senior-engineer-level review with overall score (0–10), verdict, issues, strengths, architecture/security/performance observations, testing & merge readiness       |
| **Context-Aware Review** | Fetches full file content (not just diffs) so the AI catches issues spanning the entire file — wrong arguments, duplicate logic, naming violations, type mismatches |

### Review Workflow

| Feature                           | Description                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-Issue Checkboxes**          | Select individual issues to post — don't flood the MR with noise                                                                                                                                        |
| **Inline GitLab/GitHub Comments** | Posts selected issues as **line-level inline comments** using the GitLab Discussions API (with position) or GitHub PR Review Comments API. Falls back to general comments when line info is unavailable |
| **Dismiss / False Positive**      | Mark issues as dismissed. They fade out, get excluded from selection, and can be restored anytime                                                                                                       |
| **Copy Single Issue as MD**       | One-click copy of any issue as formatted markdown for pasting into Slack, Jira, or anywhere                                                                                                             |
| **Copy Full Review as MD**        | Copies the entire review as GitLab/GitHub-compatible markdown with code fences, severity emojis, all sections                                                                                           |
| **Post Full Review**              | Post the complete review as a single MR/PR comment                                                                                                                                                      |
| **Re-run Review**                 | Re-run the code review and see a score comparison (↑/↓) vs the previous run                                                                                                                             |
| **Custom Review Rules**           | Add team-specific rules (e.g. "flag console.log", "enforce camelCase") that get injected into the AI prompt                                                                                             |
| **Reviewer Notes**                | Free-text notepad per MR, auto-saved to history                                                                                                                                                         |

### UI & UX

| Feature                         | Description                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **24 AI Models**                | Claude Sonnet/Opus 4.6, GPT-5.3, Gemini 2.5, DeepSeek, Llama 4, Grok 3, and more                            |
| **Dark / Light / System Theme** | Full theme support with smooth transitions                                                                  |
| **Keyboard Shortcuts**          | `1`/`2`/`3` for tabs, `R` to run review, `Esc` to go back                                                   |
| **File Tree Sidebar**           | Collapsible sidebar showing changed files grouped by directory, with status icons and per-file issue counts |
| **Severity Filters**            | Filter issues by Critical / Warning / Suggestion with one-click toggles                                     |
| **Group by File / Severity**    | Toggle between grouping issues by severity or by file                                                       |
| **Syntax-Highlighted Diffs**    | Powered by Shiki with line numbers, inline/split view, and collapsible file sections                        |
| **Flow Diagram**                | Interactive ReactFlow + dagre diagram showing architectural layers and file dependencies                    |
| **Cost Estimator**              | Shows estimated token cost per model in the stats bar                                                       |
| **Review History**              | IndexedDB-backed history of recent reviews, loadable from the landing page                                  |
| **Export as Markdown**          | Download the full analysis as a `.md` file                                                                  |
| **Print**                       | Print-friendly output                                                                                       |
| **Skeleton Loaders**            | Smooth loading states while AI processes                                                                    |
| **Toast Notifications**         | Success/error feedback for all actions                                                                      |
| **Mobile Responsive**           | Works on tablets and phones                                                                                 |

---

## Tech Stack

- **Frontend**: React 18, TypeScript 5.9, Vite 7
- **Styling**: Tailwind CSS 3.3, Framer Motion
- **Icons**: Lucide React
- **Diagrams**: @xyflow/react + @dagrejs/dagre
- **Syntax Highlighting**: Shiki
- **State**: React hooks + TanStack React Query
- **Storage**: IndexedDB (review history), localStorage (AI settings)
- **Backend**: Express 5 (static files + GitLab CORS proxy)
- **AI**: OpenRouter API (browser-side, BYOK)

---

## Getting Started

### Prerequisites

- **Node.js 20+** (tested with 22.x)
- **npm** (comes with Node.js)
- An **OpenRouter API key** — get one free at [openrouter.ai/keys](https://openrouter.ai/keys)

### Local Development

```bash
# Clone the repo
git clone https://github.com/your-username/ai-code-reviewer.git
cd ai-code-reviewer

# Install dependencies
npm install

# Start dev server (with hot reload)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter your OpenRouter API key in the AI Settings panel, paste a PR/MR URL, and go.

### Production Build

```bash
# Build the frontend
npm run build

# Start the production server
npm start
```

The production server serves the built frontend and proxies GitLab API requests (needed because GitLab doesn't send CORS headers). Runs on port 3000 by default — override with `PORT=8080 npm start`.

---

## Docker

### Using Docker Compose (recommended)

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Using Docker directly

```bash
# Build the image
docker build -t ai-code-reviewer .

# Run the container
docker run -d -p 3000:3000 --name ai-code-reviewer ai-code-reviewer
```

Override the port:

```bash
docker run -d -p 8080:8080 -e PORT=8080 --name ai-code-reviewer ai-code-reviewer
```

---

## Environment Variables

| Variable | Default | Description                |
| -------- | ------- | -------------------------- |
| `PORT`   | `3000`  | Port the server listens on |

> **Note**: The OpenRouter API key is entered in the browser UI and sent directly from the browser to OpenRouter. It is **never** sent to or stored on the server.

---

## Project Structure

```
ai-code-reviewer/
├── src/
│   ├── components/
│   │   ├── AISettings.tsx         # Model selector, API key, custom rules
│   │   ├── AnalysisProgress.tsx   # Progress bar during analysis
│   │   ├── ChangeSummaryPanel.tsx # Change summary with diff viewer
│   │   ├── CodeReviewPanel.tsx    # Review verdict, issues, checkboxes, post to MR
│   │   ├── DiffViewer.tsx         # Shiki-powered syntax-highlighted diffs
│   │   ├── ExecutionFlowPanel.tsx # Execution flow list + diagram toggle
│   │   ├── FileTreeSidebar.tsx    # File tree sidebar with issue counts
│   │   ├── FlowDiagram.tsx        # ReactFlow + dagre interactive diagram
│   │   ├── InputForm.tsx          # Landing page with URL input + history
│   │   ├── ResultsDashboard.tsx   # Tabbed results with stats, notes, sidebar
│   │   └── ThemeToggle.tsx        # Dark/light/system toggle
│   ├── lib/
│   │   ├── api.ts                 # GitHub/GitLab fetching + OpenRouter AI calls
│   │   ├── cost.ts                # Token/cost estimation per model
│   │   ├── export.ts              # Markdown export
│   │   ├── github-comment.ts      # Post inline/general comments to GitHub/GitLab
│   │   ├── highlighter.ts         # Shiki singleton
│   │   ├── history.ts             # IndexedDB CRUD for review history
│   │   └── useDarkMode.ts         # Theme hook
│   ├── types.ts                   # All TypeScript interfaces
│   ├── App.tsx                    # Main app with state machine
│   └── main.tsx                   # Entry point
├── server.js                      # Production Express server + GitLab proxy
├── vite.config.ts                 # Vite config with dev proxy
├── Dockerfile                     # Multi-stage Docker build
├── docker-compose.yml             # One-command Docker deployment
└── package.json
```

---

## How It Works

1. **Paste a PR/MR URL** — supports GitHub (`/pull/123`) and GitLab (`/-/merge_requests/123`)
2. **Fetches diff + full file content** via GitHub REST API or GitLab API (through the CORS proxy)
3. **AI analysis runs in parallel**: Change Summary + Execution Flow (then Code Review on demand)
4. **All AI calls go directly from the browser to OpenRouter** — the server only serves static files and proxies GitLab
5. **Review results** show issues with file locations, code snippets, and suggested fixes
6. **Select & post** individual issues as inline comments on the MR/PR

---

## License

MIT

## How It Works

The detection happens during the `npm run lint` command, which will:
- Exit with error code 1 if undefined variables are found
- Show exactly which variables need to be added to your CSS file
- Integrate seamlessly with your development workflow

This prevents runtime CSS issues where Tailwind classes reference undefined CSS variables.