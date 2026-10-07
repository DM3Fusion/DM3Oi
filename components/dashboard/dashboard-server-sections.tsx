import { Dashboard } from "@/components/dashboard/dashboard";
import {
  CasesNeedingAttention,
  OperationalIntelligenceSection,
} from "@/components/dashboard/operational-intelligence";
import type { getLiveOrganizationData } from "@/lib/data/case-repository";
import type { getUnreadNotificationCount } from "@/lib/data/communications-repository";
import type { getGoalDashboardSummary } from "@/lib/data/goals-repository";
import type { getOperationalIntelligence } from "@/lib/data/operational-intelligence-repository";

type LiveDataPromise = ReturnType<typeof getLiveOrganizationData>;
type UnreadPromise = ReturnType<typeof getUnreadNotificationCount>;
type IntelligencePromise = ReturnType<typeof getOperationalIntelligence>;
type GoalSummaryPromise = ReturnType<typeof getGoalDashboardSummary>;

export async function DashboardServerSection({
  dataPromise,
  unreadPromise,
  casesAttention,
  operationalIntelligence,
}: {
  dataPromise: LiveDataPromise;
  unreadPromise: UnreadPromise;
  casesAttention: React.ReactNode;
  operationalIntelligence: React.ReactNode;
}) {
  const [data, unreadCommunications] = await Promise.all([
    dataPromise,
    unreadPromise,
  ]);

  return (
    <Dashboard
      data={data}
      unreadCommunications={unreadCommunications}
      intelligence={null}
      goalSummary={null}
      casesAttention={casesAttention}
      operationalIntelligence={operationalIntelligence}
    />
  );
}

export async function DashboardCasesAttentionServerSection({
  intelligencePromise,
}: {
  intelligencePromise: IntelligencePromise;
}) {
  const intelligence = await intelligencePromise;
  return intelligence ? <CasesNeedingAttention intelligence={intelligence} /> : null;
}

export async function DashboardIntelligenceServerSection({
  intelligencePromise,
  goalSummaryPromise,
}: {
  intelligencePromise: IntelligencePromise;
  goalSummaryPromise: GoalSummaryPromise;
}) {
  const [intelligence, goalSummary] = await Promise.all([
    intelligencePromise,
    goalSummaryPromise,
  ]);

  return intelligence ? (
    <OperationalIntelligenceSection
      intelligence={intelligence}
      goalSummary={goalSummary}
    />
  ) : null;
}
