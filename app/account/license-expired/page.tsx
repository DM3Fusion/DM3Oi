import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { PageHeader, Badge } from "@/components/ui";

export default async function Page() {
  const access = await getAccessContext();
  if (!access?.activeOrganization) redirect("/");
  return <><PageHeader eyebrow="Organization access" title="License access unavailable" description="Your organization’s DM3Oi workspace is not currently available." /><section className="panel empty"><Badge value={access.license?.status ?? "EXPIRED"} /><h2>{access.activeOrganization.name}</h2><p>Contact your organization administrator or DM3Oi licensing contact to restore access.</p></section></>;
}
