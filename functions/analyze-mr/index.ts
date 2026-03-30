import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ─── OpenRouter direct call ───────────────────────────────────────────────────

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  schema: Record<string, unknown>
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mergeai-reviewer-r0u311ck.sites.blink.new",
        "X-Title": "MergeAI Reviewer",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "analysis_result",
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty response");

    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Schema helpers ───────────────────────────────────────────────────────────

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    purpose: { type: "string" },
    summary: { type: "string" },
    changeType: { type: "string", enum: ["feature", "bugfix", "refactor", "chore", "docs", "test", "perf", "security", "breaking"] },
    scope: { type: "string" },
    keyChanges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          description: { type: "string" },
          impact: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["area", "description", "impact"],
        additionalProperties: false,
      },
    },
    techStack: { type: "array", items: { type: "string" } },
    testingStatus: { type: "string" },
    breakingChanges: { type: "boolean" },
    breakingChangesDescription: { type: "string" },
  },
  required: ["purpose", "summary", "changeType", "scope", "keyChanges", "techStack", "testingStatus", "breakingChanges", "breakingChangesDescription"],
  additionalProperties: false,
};

const FLOW_SCHEMA = {
  type: "object",
  properties: {
    flowDescription: { type: "string" },
    flowGroups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "number" },
          layer: { type: "string" },
          layerDescription: { type: "string" },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                filename: { type: "string" },
                role: { type: "string" },
                keyChanges: { type: "string" },
                callsInto: { type: "array", items: { type: "string" } },
              },
              required: ["filename", "role", "keyChanges", "callsInto"],
              additionalProperties: false,
            },
          },
        },
        required: ["order", "layer", "layerDescription", "files"],
        additionalProperties: false,
      },
    },
    entryPoint: { type: "string" },
    dataFlow: { type: "string" },
  },
  required: ["flowDescription", "flowGroups", "entryPoint", "dataFlow"],
  additionalProperties: false,
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    overallVerdict: { type: "string", enum: ["approve", "approve_with_suggestions", "request_changes", "needs_discussion"] },
    overallScore: { type: "number" },
    executiveSummary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["critical", "warning", "suggestion", "nitpick"] },
          category: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          file: { type: "string" },
          lineHint: { type: "string" },
          currentCode: { type: "string" },
          suggestedFix: { type: "string" },
          impact: { type: "string" },
        },
        required: ["id", "severity", "category", "title", "description", "file", "lineHint", "currentCode", "suggestedFix", "impact"],
        additionalProperties: false,
      },
    },
    architectureObservations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          aspect: { type: "string" },
          observation: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["aspect", "observation", "recommendation"],
        additionalProperties: false,
      },
    },
    securityConsiderations: { type: "array", items: { type: "string" } },
    performanceConsiderations: { type: "array", items: { type: "string" } },
    testingAssessment: { type: "string" },
    mergeReadiness: { type: "string" },
  },
  required: ["overallVerdict", "overallScore", "executiveSummary", "strengths", "issues", "architectureObservations", "securityConsiderations", "performanceConsiderations", "testingAssessment", "mergeReadiness"],
  additionalProperties: false,
};

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID");
    const secretKey = Deno.env.get("BLINK_SECRET_KEY");

    if (!projectId || !secretKey) {
      return new Response(
        JSON.stringify({ error: "Missing server configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { pr, files, analysisType, aiProvider, aiApiKey, aiModel } = body;

    if (!pr || !files) {
      return new Response(
        JSON.stringify({ error: "pr and files are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const useOpenRouter = aiProvider === "openrouter" && aiApiKey && aiModel;

    // Build compact diff content (limit tokens)
    const MAX_PATCH_CHARS = 600;
    const diffContent = files
      .map((f: { filename: string; status: string; additions: number; deletions: number; patch?: string | null }) => {
        const patchPreview = f.patch
          ? f.patch.slice(0, MAX_PATCH_CHARS) + (f.patch.length > MAX_PATCH_CHARS ? "\n... (truncated)" : "")
          : "(binary or no patch)";
        return `### ${f.filename} [${f.status}] +${f.additions}/-${f.deletions}\n${patchPreview}`;
      })
      .join("\n\n");

    // ── Summary ────────────────────────────────────────────────────────────────
    if (analysisType === "summary") {
      const systemPrompt = `You are an expert software engineer reviewing a pull/merge request. Analyze the PR and produce a structured summary. Always return valid JSON matching the exact schema.`;
      const userPrompt = `PR Title: ${pr.title}
PR Description: ${pr.description || "No description provided"}
Base Branch: ${pr.baseBranch} → Head Branch: ${pr.headBranch}
Author: ${pr.author}
Stats: ${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions} lines, ${pr.commits} commit(s)

FILE DIFFS:
${diffContent}

Provide a comprehensive summary. For breakingChangesDescription, use an empty string "" if there are no breaking changes.`;

      let object: unknown;
      if (useOpenRouter) {
        object = await callOpenRouter(aiApiKey, aiModel, [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ], SUMMARY_SCHEMA);
      } else {
        const blink = createClient({ projectId, secretKey });
        const result = await blink.ai.generateObject({
          model: "gpt-4.1",
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          schema: {
            type: "object",
            properties: {
              purpose: { type: "string", description: "1-2 sentence high-level description" },
              summary: { type: "string", description: "Detailed 3-5 sentence summary" },
              changeType: { type: "string", enum: ["feature", "bugfix", "refactor", "chore", "docs", "test", "perf", "security", "breaking"] },
              scope: { type: "string" },
              keyChanges: { type: "array", items: { type: "object", properties: { area: { type: "string" }, description: { type: "string" }, impact: { type: "string", enum: ["high", "medium", "low"] } }, required: ["area", "description", "impact"] } },
              techStack: { type: "array", items: { type: "string" } },
              testingStatus: { type: "string" },
              breakingChanges: { type: "boolean" },
              breakingChangesDescription: { type: "string" },
            },
            required: ["purpose", "summary", "changeType", "scope", "keyChanges", "techStack", "testingStatus", "breakingChanges"],
          },
        });
        object = result.object;
      }

      return new Response(JSON.stringify({ success: true, data: object }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Execution Flow ─────────────────────────────────────────────────────────
    if (analysisType === "executionFlow") {
      const fileList = files.map((f: { filename: string; status: string }) => `${f.filename} [${f.status}]`).join("\n");
      const systemPrompt = `You are a senior software architect. Organize changed files into a logical execution flow grouped by architectural layer. Always return valid JSON.`;
      const userPrompt = `PR Title: ${pr.title}
Changed Files:
${fileList}

FILE DIFFS:
${diffContent}

Organize files into execution flow groups (Route/Entry → Middleware → Controller → Service → Repository/DAL → Model/Schema → Utils → Tests → Config). For callsInto, always provide an array (empty [] if none).`;

      let object: unknown;
      if (useOpenRouter) {
        object = await callOpenRouter(aiApiKey, aiModel, [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ], FLOW_SCHEMA);
      } else {
        const blink = createClient({ projectId, secretKey });
        const result = await blink.ai.generateObject({
          model: "gpt-4.1",
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          schema: {
            type: "object",
            properties: {
              flowDescription: { type: "string" },
              flowGroups: { type: "array", items: { type: "object", properties: { order: { type: "number" }, layer: { type: "string" }, layerDescription: { type: "string" }, files: { type: "array", items: { type: "object", properties: { filename: { type: "string" }, role: { type: "string" }, keyChanges: { type: "string" }, callsInto: { type: "array", items: { type: "string" } } }, required: ["filename", "role", "keyChanges"] } } }, required: ["order", "layer", "layerDescription", "files"] } },
              entryPoint: { type: "string" },
              dataFlow: { type: "string" },
            },
            required: ["flowDescription", "flowGroups", "entryPoint", "dataFlow"],
          },
        });
        object = result.object;
      }

      return new Response(JSON.stringify({ success: true, data: object }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Code Review ────────────────────────────────────────────────────────────
    if (analysisType === "codeReview") {
      const systemPrompt = `You are a very senior software engineer (10+ years) performing a thorough code review. Be precise, constructive, and insightful. Focus on things that matter. Always return valid JSON. For optional string fields like file, lineHint, currentCode, impact — always provide a string value (use "" if not applicable).`;
      const userPrompt = `PR Title: ${pr.title}
PR Description: ${pr.description || "No description"}
Author: ${pr.author}
Stats: ${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions}

FILE DIFFS:
${diffContent}

Perform a comprehensive senior-level code review.`;

      let object: unknown;
      if (useOpenRouter) {
        object = await callOpenRouter(aiApiKey, aiModel, [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ], REVIEW_SCHEMA);
      } else {
        const blink = createClient({ projectId, secretKey });
        const result = await blink.ai.generateObject({
          model: "gpt-4.1",
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          schema: {
            type: "object",
            properties: {
              overallVerdict: { type: "string", enum: ["approve", "approve_with_suggestions", "request_changes", "needs_discussion"] },
              overallScore: { type: "number" },
              executiveSummary: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              issues: { type: "array", items: { type: "object", properties: { id: { type: "string" }, severity: { type: "string", enum: ["critical", "warning", "suggestion", "nitpick"] }, category: { type: "string" }, title: { type: "string" }, description: { type: "string" }, file: { type: "string" }, lineHint: { type: "string" }, currentCode: { type: "string" }, suggestedFix: { type: "string" }, impact: { type: "string" } }, required: ["id", "severity", "category", "title", "description", "suggestedFix"] } },
              architectureObservations: { type: "array", items: { type: "object", properties: { aspect: { type: "string" }, observation: { type: "string" }, recommendation: { type: "string" } }, required: ["aspect", "observation", "recommendation"] } },
              securityConsiderations: { type: "array", items: { type: "string" } },
              performanceConsiderations: { type: "array", items: { type: "string" } },
              testingAssessment: { type: "string" },
              mergeReadiness: { type: "string" },
            },
            required: ["overallVerdict", "overallScore", "executiveSummary", "strengths", "issues", "architectureObservations", "securityConsiderations", "performanceConsiderations", "testingAssessment", "mergeReadiness"],
          },
        });
        object = result.object;
      }

      return new Response(JSON.stringify({ success: true, data: object }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown analysisType. Use: summary, executionFlow, or codeReview" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-mr:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

Deno.serve(handler);
