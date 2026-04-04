import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiffViewer } from "./DiffViewer";

vi.mock("../lib/highlighter", () => ({
  detectLanguage: vi.fn().mockReturnValue("typescript"),
  isSupportedLanguage: vi.fn().mockReturnValue(true),
  getHighlighter: vi.fn().mockResolvedValue({
    codeToTokens: (content: string) => ({
      tokens: [[{ content, color: "#ffffff" }]],
    }),
  }),
}));

describe("DiffViewer", () => {
  it("switches between inline, split, and full-file views", async () => {
    const user = userEvent.setup();
    render(
      <DiffViewer
        defaultOpen
        file={{
          filename: "src/math.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          changes: 3,
          patch: "@@ -1,2 +1,3 @@\n-const value = 1;\n+const value = 2;\n+export default value;",
          blobUrl: null,
          fullContent: "const value = 2;\nexport default value;",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /inline/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /split/i }));
    expect(screen.getByRole("button", { name: /split/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /full file/i }));
    expect(screen.getByText("export default value;")).toBeInTheDocument();
  });
});
