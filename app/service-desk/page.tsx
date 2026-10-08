import { Suspense } from "react";
import { ServiceDeskBodySkeleton } from "@/components/loading/route-skeletons";
import {
  ServiceDeskBodyServerSection,
  ServiceDeskCreateActionServerSection,
} from "@/components/service-desk/service-desk-page-sections";
import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { getServiceDeskData } from "@/lib/data/case-repository";

export const metadata = { title: "Service Desk" };

export default function Page() {
  const dataPromise = getServiceDeskData();
  const accessPromise = getAccessContext();

  return (
    <>
      <PageHeader
        eyebrow="Customer Service"
        title="Service Desk"
        action={
          <Suspense fallback={null}>
            <ServiceDeskCreateActionServerSection
              accessPromise={accessPromise}
            />
          </Suspense>
        }
      />
      <Suspense fallback={<ServiceDeskBodySkeleton />}>
        <ServiceDeskBodyServerSection dataPromise={dataPromise} />
      </Suspense>
    </>
  );
}
