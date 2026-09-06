import { EmptyFoundation, PageHeader } from "@/components/ui";
import { UrlSearch } from "@/components/question-search";
import { normalizeQuestionQuery } from "@/lib/question-filters";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){const query=await searchParams;const q=normalizeQuestionQuery(query.q);return <><PageHeader eyebrow="Insights" title="Reports" description="Operational reporting across cases, customers, and staff work."/><UrlSearch q={q} label="Search reports" placeholder="Search reports..." clearLabel="Clear report search"/><EmptyFoundation icon="↗" title="Reporting foundation is ready" description={q?"No reports are available to search yet.":"Saved reports, performance trends, and exports will be built here."}/></>}
