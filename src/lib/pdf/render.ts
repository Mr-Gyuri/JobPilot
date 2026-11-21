import type { PaperSize } from "@/lib/types";
import { getBrowser } from "@/lib/pdf/browser";

/**
 * Render a self-contained HTML document to PDF. Templates embed zero external
 * resources (inline CSS only, system fonts), so domcontentloaded is sufficient.
 */
export async function renderHtmlToPdf(html: string, paper: PaperSize): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const result = await page.pdf({
      format: paper,
      printBackground: true,
      margin: { top: "0.55in", bottom: "0.55in", left: "0.65in", right: "0.65in" },
      displayHeaderFooter: false,
    });
    return Buffer.from(result);
  } finally {
    await page.close();
  }
}
