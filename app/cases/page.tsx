import { Suspense } from "react";
import {
  CaseKpisServerSection,
  CaseRegisterServerSection,
  CasesHeaderServerSection,
  CaseWorkloadServerSection,
  resolveCasesPageModel,
  type CasePageParams,
} from "@/components/cases/cases-page-sections";
import {
  CasesBodySkeleton,
  PageHeaderSkeleton,
} from "@/components/loading/route-skeletons";
import { getAccessContext } from "@/lib/auth/context";
import { getCasesRegisterData } from "@/lib/data/case-repository";

export const metadata = { title: "Cases" };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<CasePageParams>;
}) {
  const dataPromise = getCasesRegisterData();
  const modelPromise = resolveCasesPageModel(dataPromise, searchParams);
  const accessPromise = getAccessContext();

  return (
    <>
      <Suspense fallback={<PageHeaderSkeleton label="Loading Cases heading" />}>
        <CasesHeaderServerSection
          modelPromise={modelPromise}
          accessPromise={accessPromise}
        />
      </Suspense>
      <Suspense fallback={<CasesBodySkeleton />}>
        <CaseKpisServerSection modelPromise={modelPromise} />
        <CaseWorkloadServerSection modelPromise={modelPromise} />
        <CaseRegisterServerSection modelPromise={modelPromise} />
      </Suspense>
    </>
  );
}
