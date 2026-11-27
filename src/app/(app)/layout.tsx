import { Sidebar } from "@/components/Sidebar";
import { getContext } from "@/lib/context";
import { aiConfigured } from "@/lib/ai";
import { CommandPalette } from "@/components/CommandPalette";
import { NavProgress } from "@/components/NavProgress";
import { Suspense } from "react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense><NavProgress /></Suspense>
      <CommandPalette ai={aiConfigured()} />
      <Sidebar orgName={ctx.org.name} userName={ctx.name} perms={ctx.perms} ai={aiConfigured()} />
      <main className="min-w-0 flex-1 overflow-x-clip px-4 pt-5 pb-[calc(88px+env(safe-area-inset-bottom))] md:px-10 md:py-9 flex flex-col gap-6">{children}</main>
    </div>
  );
}
