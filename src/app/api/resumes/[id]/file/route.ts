import { getActiveProfileId } from "@/lib/active-profile";
import { getResume } from "@/lib/repos/resumes";
import { streamFileResponse } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const profileId = await getActiveProfileId();
  if (profileId == null) return new Response("No profile", { status: 400 });

  const resume = getResume(Number(id));
  if (!resume || resume.profileId !== profileId || !resume.storedPath) {
    return new Response("Not found", { status: 404 });
  }
  const mime =
    resume.mimeType ??
    (resume.storedPath.endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  return streamFileResponse(resume.storedPath, resume.originalFilename ?? "resume", mime);
}
