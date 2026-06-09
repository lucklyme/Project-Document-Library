import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canMaintain, getCurrentUser, getRequestContextFromRequest } from "@/lib/auth";
import { saveUpload } from "@/lib/repository";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const context = getRequestContextFromRequest(request);

  if (!canMaintain(user)) {
    writeAuditLog({ user, action: "document.upload", result: "denied", context });
    return NextResponse.json({ ok: false, message: "没有上传权限。" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      writeAuditLog({ user, action: "document.upload", result: "failure", message: "empty file", context });
      return NextResponse.json({ ok: false, message: "请选择要上传的文件。" }, { status: 400 });
    }

    const result = await saveUpload(file);
    revalidatePath("/");
    writeAuditLog({
      user,
      action: "document.upload",
      targetType: "file",
      targetLabel: file.name,
      result: result.ok ? "success" : "failure",
      message: result.message,
      context
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    writeAuditLog({
      user,
      action: "document.upload",
      result: "failure",
      message: error instanceof Error ? error.message : "upload failed",
      context
    });
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "上传失败"
      },
      { status: 500 }
    );
  }
}
