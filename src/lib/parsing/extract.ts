export class UnsupportedFileError extends Error {
  constructor(message = "Unsupported file type") {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

export class ScannedPdfError extends Error {
  constructor(message = "PDF contains no extractable text") {
    super(message);
    this.name = "ScannedPdfError";
  }
}

const MAX_CHARS = 150_000;
const MIN_PDF_CHARS = 100;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

function normalize(text: string): string {
  return (
    text
      .replace(/\0/g, "")
      .replace(/\r\n?/g, "\n")
      // pdf-parse marks page boundaries with lines like "-- 1 of 2 --"; they
      // would otherwise be parsed as resume content.
      .replace(/^\s*-{2,}\s*\d+\s+of\s+\d+\s*-{2,}\s*$/gim, "")
      .replace(/^\s*(?:page\s+)?\d+\s*\/\s*\d+\s*$/gim, "")
      // Word puts a right-aligned date in its own run or tab stop, and raw text
      // extraction concatenates runs with nothing between them — producing
      // "BS Computer ScienceAug 2022" and "MCP server (.NET 10 / C#)2026". A
      // month name or 4-digit year butting straight against a letter or closing
      // bracket is always that seam, so a space is restored.
      .replace(
        /([a-z\])])((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/g,
        "$1 $2"
      )
      .replace(/([a-z\])])((?:19|20)\d{2}\b)/g, "$1 $2")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** PDF/DOCX buffer -> normalized plain text. Throws typed errors the UI turns into guidance. */
export async function extractResumeText(
  buffer: Buffer,
  filenameOrMime: string
): Promise<string> {
  const hint = filenameOrMime.toLowerCase();
  const isPdf = hint.endsWith(".pdf") || hint.includes("application/pdf");
  const isDocx =
    hint.endsWith(".docx") ||
    hint.includes("officedocument.wordprocessingml.document") ||
    hint.includes("application/msword");

  let raw: string;
  if (isPdf) {
    raw = await extractTextFromPdf(buffer);
    if (normalize(raw).length < MIN_PDF_CHARS) {
      throw new ScannedPdfError();
    }
  } else if (isDocx) {
    raw = await extractTextFromDocx(buffer);
  } else {
    throw new UnsupportedFileError("Only PDF and DOCX resumes are supported");
  }

  const text = normalize(raw);
  if (text.length > MAX_CHARS) {
    throw new UnsupportedFileError("That document is unusually large for a resume");
  }
  if (text.length === 0) {
    throw new ScannedPdfError("No text could be extracted from that file");
  }
  return text;
}
