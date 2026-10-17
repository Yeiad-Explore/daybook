import type { ReactNode } from "react";
import { SettingsNav } from "./settings-nav";

export const metadata = { title: "Settings · Daybook" };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="pt-6">
        <SettingsNav />
      </div>
      {children}
    </div>
  );
}
