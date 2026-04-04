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

export interface DiffRefs {
  baseSha: string;
  headSha: string;
  startSha: string;
}

export interface MRData {
  platform: "github" | "gitlab";
  pr: PRInfo;
  files: FileDiff[];
  /** GitLab diff_refs needed for inline MR comments with position */
  diffRefs?: DiffRefs;
  /** GitLab numeric project id for follow-up repository API calls */
  projectId?: number | string;
  /** All blob paths in the repository (head branch). Used to validate file candidates before fetching. */
  treePaths?: string[];
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
  confidence: "low" | "medium" | "high";
  rationale: string;
  file?: string;
  lineHint?: string;
  currentCode?: string;
  suggestedFix: string;
  impact?: string;
  fixable?: boolean;
  verificationStatus?: "verified" | "uncertain";
  evidence?: Array<{
    type: "diff" | "full_file" | "related_file" | "repo_memory" | "test" | "contract";
    summary: string;
    file?: string;
    lineHint?: string;
    snippet?: string;
  }>;
}

export interface ArchitectureObservation {
  aspect: string;
  observation: string;
  recommendation: string;
}

export interface ReviewerSuggestion {
  reviewer: string;
  files: string[];
}

export interface ReviewContextInsight {
  file: string;
  reason: string;
  source: "import" | "test" | "sibling" | "symbol" | "contract";
  excerpt?: string;
}

export interface RepoReviewMemory {
  purpose: string[];
  architecture: string[];
  domainRules: string[];
  reviewPriorities: string[];
  intentionalPatterns: string[];
  avoidFlagging: string[];
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
  testGapSummary: string;
  riskHotspots: Array<{ file: string; score: number; reasons: string[] }>;
  contextInsights?: ReviewContextInsight[];
  reviewerSuggestions?: ReviewerSuggestion[];
  reviewDiff?: { addedIssueIds: string[]; removedIssueIds: string[]; changedSeverityIds: string[]; scoreDelta: number };
  verificationSummary?: string;
  mergeReadiness: string;
}

export type AnalysisStep = "idle" | "fetching" | "summarizing" | "flowing" | "reviewing" | "done" | "error";

export interface RequirementItem {
  requirement: string;
  status: "fulfilled" | "partially_fulfilled" | "not_fulfilled" | "not_applicable";
  evidence: string;
  notes: string;
}

export interface RequirementsCheck {
  issueTitle: string;
  issueSummary: string;
  overallCoverage: "fully_covered" | "mostly_covered" | "partially_covered" | "poorly_covered";
  coverageScore: number;
  requirements: RequirementItem[];
  missingItems: string[];
  suggestions: string[];
}

export interface MRDescriptionSuggestion {
  category: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
  example: string;
}

export interface MRDescriptionReview {
  currentQuality: "excellent" | "good" | "needs_improvement" | "poor";
  qualityScore: number;
  strengths: string[];
  suggestions: MRDescriptionSuggestion[];
  suggestedDescription: string;
}

export interface ReviewChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface AnalysisState {
  step: AnalysisStep;
  mrData: MRData | null;
  summary: ChangeSummary | null;
  executionFlow: ExecutionFlow | null;
  codeReview: CodeReview | null;
  error: string | null;
  activeTab: "summary" | "flow" | "review" | "requirements" | "mr-description";
  /** Free-text reviewer notes stored per MR */
  reviewerNotes?: string;
  /** Previous code review for comparison after re-review */
  previousReview?: CodeReview | null;
  /** Metadata about the comparison baseline shown in the review UI */
  previousReviewMeta?: {
    source: "history" | "rerun";
    previousCommits: number;
    commitDelta: number;
    timestamp?: number;
  } | null;
  /** Requirements check from linked issue */
  requirementsCheck?: RequirementsCheck | null;
  /** MR description review */
  mrDescriptionReview?: MRDescriptionReview | null;
  /** Linked GitLab/GitHub issue URL */
  linkedIssueUrl?: string;
  /** Conversation about the current PR review */
  reviewChat?: ReviewChatMessage[];
  /** Currently highlighted file in the UI */
  selectedFile?: string;
  /** Currently highlighted review issue in the UI */
  selectedIssueId?: string;
}
