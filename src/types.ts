export interface FileDiff {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  blobUrl: string | null;
  /** Full file content at HEAD (post-change). Populated for context-aware code review. */
  fullContent?: string | null;
}

export interface PRInfo {
  title: string;
  description: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  createdAt: string;
  url: string;
}

export interface MRData {
  platform: "github" | "gitlab";
  pr: PRInfo;
  files: FileDiff[];
}

export interface KeyChange {
  area: string;
  description: string;
  impact: "high" | "medium" | "low";
}

export interface ChangeSummary {
  purpose: string;
  summary: string;
  changeType: string;
  scope: string;
  keyChanges: KeyChange[];
  techStack: string[];
  testingStatus: string;
  breakingChanges: boolean;
  breakingChangesDescription?: string;
}

export interface FlowFile {
  filename: string;
  role: string;
  keyChanges: string;
  callsInto?: string[];
}

export interface FlowGroup {
  order: number;
  layer: string;
  layerDescription: string;
  files: FlowFile[];
}

export interface ExecutionFlow {
  flowDescription: string;
  flowGroups: FlowGroup[];
  entryPoint: string;
  dataFlow: string;
}

export interface ReviewIssue {
  id: string;
  severity: "critical" | "warning" | "suggestion" | "nitpick";
  category: string;
  title: string;
  description: string;
  file?: string;
  lineHint?: string;
  currentCode?: string;
  suggestedFix: string;
  impact?: string;
}

export interface ArchitectureObservation {
  aspect: string;
  observation: string;
  recommendation: string;
}

export interface CodeReview {
  overallVerdict: "approve" | "approve_with_suggestions" | "request_changes" | "needs_discussion";
  overallScore: number;
  executiveSummary: string;
  strengths: string[];
  issues: ReviewIssue[];
  architectureObservations: ArchitectureObservation[];
  securityConsiderations: string[];
  performanceConsiderations: string[];
  testingAssessment: string;
  mergeReadiness: string;
}

export type AnalysisStep = "idle" | "fetching" | "summarizing" | "flowing" | "reviewing" | "done" | "error";

export interface AnalysisState {
  step: AnalysisStep;
  mrData: MRData | null;
  summary: ChangeSummary | null;
  executionFlow: ExecutionFlow | null;
  codeReview: CodeReview | null;
  error: string | null;
  activeTab: "summary" | "flow" | "review";
}
