import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isClerkSession } from "@/lib/auth";
import { saveUpload } from "@/lib/repository";

export async function POST(request: Request) {
  if (!(await isClerkSession())) {
    return NextResponse.json({ ok: false, message: "没有资料员权限" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, message: "请选择要上传的文件。" }, { status: 400 });
    }

    const result = await saveUpload(file);
    revalidatePath("/");

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "上传失败"
      },
      { status: 500 }
    );
  }
}
