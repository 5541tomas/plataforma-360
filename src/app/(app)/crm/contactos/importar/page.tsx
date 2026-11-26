import Link from "next/link";
import { requireModule } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { ImportContacts } from "./ImportContacts";

export default async function ImportContactsPage() {
  await requireModule("crm", "write");
  return (
    <>
      <PageHeader title="Importar contactos"><Link href="/crm/contactos" className="btn-ghost">‹ Contactos</Link></PageHeader>
      <ImportContacts />
    </>
  );
}
