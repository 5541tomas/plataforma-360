import { Sidebar } from "@/components/Sidebar";
import { getContext } from "@/lib/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar orgName={ctx.org.name} userName={ctx.name} perms={ctx.perms} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-9 flex flex-col gap-6">{children}</main>
    </div>
  );
}
