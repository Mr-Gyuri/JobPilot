import { Settings as SettingsIcon } from "lucide-react";
import { PLAIN_KEYS, SECRET_KEYS, getKeyStatus } from "@/lib/config";
import { getModel, getProviderLabel } from "@/lib/ai/client";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const statuses = [...SECRET_KEYS, ...PLAIN_KEYS].map((key) => getKeyStatus(key));
  const activeProvider = getProviderLabel();
  const activeModel = activeProvider ? getModel() : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every key is optional. Keys saved here are stored in the local SQLite database and
            override anything in <code className="text-xs">.env.local</code>.
          </p>
        </div>
      </div>

      <SettingsClient
        statuses={statuses}
        activeProvider={activeProvider}
        activeModel={activeModel}
      />
    </div>
  );
}
