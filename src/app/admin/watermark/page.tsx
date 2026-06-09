import { saveWatermarkSettingsAction } from "@/app/actions";
import { AdminNav } from "@/app/admin/admin-nav";
import { requireRole } from "@/lib/auth";
import { getWatermarkSettings } from "@/lib/settings";

type WatermarkPageProps = {
  searchParams: Promise<{ success?: string }>;
};

export default async function AdminWatermarkPage({ searchParams }: WatermarkPageProps) {
  const user = await requireRole(["admin"]);
  const { success } = await searchParams;
  const settings = getWatermarkSettings();
  const selectedMode = settings.enabled ? settings.mode : "off";
  const opacityPercent = Math.round(settings.opacity * 100);

  return (
    <main className="shell">
      <AdminNav user={user} />
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Watermark</p>
          <h1>水印配置</h1>
          <p>水印用于预览追责，不能绝对阻止截图或拍照。</p>
        </div>
      </section>

      {success === "save" ? <p className="success">水印配置已保存。</p> : null}

      <section className="panel form-panel">
        <form className="stack-form" action={saveWatermarkSettingsAction}>
          <label className="radio-card">
            <input name="mode" type="radio" value="edge-and-body" defaultChecked={selectedMode === "edge-and-body"} />
            <span>边缘 + 极淡正文水印</span>
          </label>
          <label className="radio-card">
            <input name="mode" type="radio" value="edge" defaultChecked={selectedMode === "edge"} />
            <span>仅边缘水印</span>
          </label>
          <label className="radio-card">
            <input name="mode" type="radio" value="off" defaultChecked={selectedMode === "off"} />
            <span>关闭水印</span>
          </label>
          <label>
            透明度：{opacityPercent}%
            <input name="opacityPercent" type="range" min="3" max="20" step="1" defaultValue={opacityPercent} />
          </label>
          <button className="fit" type="submit">保存</button>
        </form>
      </section>
    </main>
  );
}
