import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceUploader } from "@/components/source-uploader";

const baseProps = {
  source: null,
  fileSize: null,
  error: null,
  correctedText: [],
  onCorrectedTextChange: () => {},
  onFile: () => {},
  onRetryAnalysis: () => {},
};

describe("SourceUploader", () => {
  it("shows the drop zone before artwork is selected", () => {
    const markup = renderToStaticMarkup(createElement(SourceUploader, {
      ...baseProps,
      status: "idle",
      localPreviewUrl: null,
    }));

    expect(markup).toContain("Drag &amp; drop your image here");
    expect(markup).not.toContain("Replace artwork");
  });

  it("hides the drop zone once a selected file has a local preview", () => {
    const markup = renderToStaticMarkup(createElement(SourceUploader, {
      ...baseProps,
      status: "uploading",
      localPreviewUrl: "blob:selected-artwork",
    }));

    expect(markup).not.toContain("Drag &amp; drop your image here");
    expect(markup).toContain("Replace artwork");
    expect(markup).toContain("Uploading artwork");
  });
});
