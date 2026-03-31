import type { AnalysisState } from "../types";

export function exportAsMarkdown(state: AnalysisState): string {
  const { mrData, summary, executionFlow, codeReview, reviewerNotes } = state;
  const lines: string[] = [];

  if (mrData) {
    lines.push(`# AI Code Review: ${mrData.pr.title}`);
    lines.push(``);
    lines.push(`**Platform:** ${mrData.platform === "github" ? "GitHub" : "GitLab"}`);
    lines.push(`**Author:** ${mrData.pr.author}`);
    lines.push(`**Branch:** ${mrData.pr.headBranch} → ${mrData.pr.baseBranch}`);
    lines.push(`**Stats:** ${mrData.pr.changedFiles} files, +${mrData.pr.additions}/-${mrData.pr.deletions}, ${mrData.pr.commits} commit(s)`);
    lines.push(`**URL:** ${mrData.pr.url}`);
    lines.push(``);
  }

  if (reviewerNotes?.trim()) {
    lines.push(`## Reviewer Notes`);
    lines.push(``);
    lines.push(reviewerNotes.trim());
    lines.push(``);
  }

  if (summary) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Change Summary`);
    lines.push(``);
    lines.push(`**Type:** ${summary.changeType} | **Scope:** ${summary.scope}`);
    if (summary.breakingChanges) {
      lines.push(`**⚠️ Breaking Changes:** ${summary.breakingChangesDescription}`);
    }
    lines.push(``);
    lines.push(`### Purpose`);
    lines.push(summary.purpose);
    lines.push(``);
    lines.push(`### Summary`);
    lines.push(summary.summary);
    lines.push(``);
    lines.push(`### Key Changes`);
    for (const c of summary.keyChanges) {
      lines.push(`- **${c.area}** (${c.impact}): ${c.description}`);
    }
    lines.push(``);
    lines.push(`### Technologies`);
    lines.push(summary.techStack.join(", "));
    lines.push(``);
    lines.push(`### Testing`);
    lines.push(summary.testingStatus);
    lines.push(``);
  }

  if (executionFlow) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Execution Flow`);
    lines.push(``);
    lines.push(executionFlow.flowDescription);
    lines.push(``);
    lines.push(`**Entry Point:** ${executionFlow.entryPoint}`);
    lines.push(`**Data Flow:** ${executionFlow.dataFlow}`);
    lines.push(``);
    const sorted = [...executionFlow.flowGroups].sort((a, b) => a.order - b.order);
    lines.push(`**Layers:** ${sorted.map((g) => g.layer).join(" → ")}`);
    lines.push(``);
    for (const g of sorted) {
      lines.push(`### Layer ${g.order}: ${g.layer}`);
      lines.push(g.layerDescription);
      lines.push(``);
      for (const f of g.files) {
        lines.push(`- **${f.filename}** — ${f.role}`);
        lines.push(`  ${f.keyChanges}`);
        if (f.callsInto?.length) {
          lines.push(`  Calls: ${f.callsInto.join(", ")}`);
        }
      }
      lines.push(``);
    }
  }

  if (codeReview) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Code Review`);
    lines.push(``);
    lines.push(`**Verdict:** ${codeReview.overallVerdict.replace(/_/g, " ").toUpperCase()}`);
    lines.push(`**Score:** ${codeReview.overallScore}/10`);
    lines.push(``);
    lines.push(`### Executive Summary`);
    lines.push(codeReview.executiveSummary);
    lines.push(``);

    if (codeReview.strengths.length > 0) {
      lines.push(`### Strengths`);
      for (const s of codeReview.strengths) {
        lines.push(`- ${s}`);
      }
      lines.push(``);
    }

    if (codeReview.issues.length > 0) {
      lines.push(`### Issues (${codeReview.issues.length})`);
      lines.push(``);
      for (const i of codeReview.issues) {
        lines.push(`#### [${i.severity.toUpperCase()}] ${i.title}`);
        if (i.file) lines.push(`**File:** ${i.file}${i.lineHint ? ` · ${i.lineHint}` : ""}`);
        lines.push(`**Confidence:** ${i.confidence.toUpperCase()}`);
        lines.push(``);
        lines.push(i.description);
        lines.push(``);
        lines.push(`**Rationale:** ${i.rationale}`);
        if (i.currentCode) {
          lines.push(``);
          lines.push(`**Problematic Code:**`);
          lines.push("```");
          lines.push(i.currentCode);
          lines.push("```");
        }
        if (i.suggestedFix) {
          lines.push(``);
          lines.push(`**Suggested Fix:**`);
          lines.push("```");
          lines.push(i.suggestedFix);
          lines.push("```");
        }
        if (i.impact) {
          lines.push(``);
          lines.push(`**Impact:** ${i.impact}`);
        }
        lines.push(``);
      }
    }

    if (codeReview.testGapSummary) {
      lines.push(`### Test Gap Summary`);
      lines.push(codeReview.testGapSummary);
      lines.push(``);
    }

    if (codeReview.riskHotspots.length > 0) {
      lines.push(`### Risk Hotspots`);
      for (const hotspot of codeReview.riskHotspots) {
        lines.push(`- **${hotspot.file}** (${hotspot.score}) — ${hotspot.reasons.join("; ")}`);
      }
      lines.push(``);
    }

    if (codeReview.reviewerSuggestions && codeReview.reviewerSuggestions.length > 0) {
      lines.push(`### Reviewer Routing`);
      for (const suggestion of codeReview.reviewerSuggestions) {
        lines.push(`- **${suggestion.reviewer}** — ${suggestion.files.join(", ")}`);
      }
      lines.push(``);
    }

    if (codeReview.architectureObservations.length > 0) {
      lines.push(`### Architecture Observations`);
      for (const obs of codeReview.architectureObservations) {
        lines.push(`- **${obs.aspect}:** ${obs.observation}`);
        lines.push(`  → ${obs.recommendation}`);
      }
      lines.push(``);
    }

    if (codeReview.securityConsiderations.length > 0) {
      lines.push(`### Security Considerations`);
      for (const s of codeReview.securityConsiderations) {
        lines.push(`- ${s}`);
      }
      lines.push(``);
    }

    if (codeReview.performanceConsiderations.length > 0) {
      lines.push(`### Performance Considerations`);
      for (const p of codeReview.performanceConsiderations) {
        lines.push(`- ${p}`);
      }
      lines.push(``);
    }

    lines.push(`### Merge Readiness`);
    lines.push(codeReview.mergeReadiness);
    lines.push(``);
  }

  return lines.join("\n");
}

export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAsJSON(state: AnalysisState): string {
  const { mrData, summary, executionFlow, codeReview, requirementsCheck, mrDescriptionReview, reviewerNotes } = state;
  return JSON.stringify({ mrData, summary, executionFlow, codeReview, requirementsCheck, mrDescriptionReview, reviewerNotes }, null, 2);
}

export function downloadJSON(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
