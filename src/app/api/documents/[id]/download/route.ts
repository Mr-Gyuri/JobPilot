import { getActiveProfileId } from "@/lib/active-profile";
import { getDocument } from "@/lib/repos/documents";
import { streamFileResponse } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  // ?inline=1 renders in the preview pane; without it the browser downloads.
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const profileId = await getActiveProfileId();
  if (profileId == null) return new Response("No profile", { status: 400 });

  const doc = getDocument(Number(id));
  if (!doc || doc.profileId !== profileId || !doc.pdfPath) {
    return new Response("Not found", { status: 404 });
  }
  const filename =
    doc.docType === "resume"
      ? `tailored-resume-v${doc.version}-${doc.template}.pdf`
      : `cover-letter-v${doc.version}.pdf`;
  return streamFileResponse(
    doc.pdfPath,
    filename,
    "application/pdf",
    inline ? "inline" : "attachment"
  );
}
