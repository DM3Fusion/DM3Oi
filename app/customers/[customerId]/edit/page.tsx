import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { CustomerEditForm } from "@/components/customer-edit-form";
import { getAccessContext } from "@/lib/auth/context";
import { hasTenantInternalAccess } from "@/lib/auth/access-routing";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format-phone";
export default async function Page({params}:{params:Promise<{customerId:string}>}){const [{customerId},access]=await Promise.all([params,getAccessContext()]);if(!access||!hasTenantInternalAccess(access)||!access.activeOrganization)notFound();const supabase=await createClient();const {data:customer}=await supabase.from("organization_customers").select("*").eq("id",customerId).eq("organization_id",access.activeOrganization.id).maybeSingle();if(!customer)notFound();return <><PageHeader eyebrow="Relationships" title="Edit Customer" description="Update customer contact and status information."/><section className="panel detail-section"><div className="section-head"><div><h2>{customer.customer_number}</h2><p>{customer.type}</p></div><Badge value={customer.status}/></div><CustomerEditForm customerId={customer.id} initial={{name:customer.name,email:customer.email??"",phone:formatPhone(customer.phone)==="—"?"":formatPhone(customer.phone),notes:customer.notes??"",status:customer.status}}/></section><Link className="auth-link" href={`/customers/${customer.id}`}>← Customer detail</Link></>}
