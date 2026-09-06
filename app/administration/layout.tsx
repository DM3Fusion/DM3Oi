import { notFound } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { canAccessOrganizationAdministration } from "@/lib/auth/permissions";

export default async function AdministrationLayout({children}:{children:React.ReactNode}) {
  const access=await getAccessContext();
  if(!canAccessOrganizationAdministration(access)) notFound();
  return children;
}
