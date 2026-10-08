import {
  Dashboard,
  DashboardAttentionSummary,
} from "@/components/dashboard/dashboard";
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
  attentionSummary,
  casesAttention,
  operationalIntelligence,
}: {
  dataPromise: LiveDataPromise;
  attentionSummary: React.ReactNode;
  casesAttention: React.ReactNode;
  operationalIntelligence: React.ReactNode;
}) {
  const data = await dataPromise;

  return (
    <Dashboard
      data={data}
      intelligence={null}
      goalSummary={null}
      attentionSummary={attentionSummary}
      casesAttention={casesAttention}
      operationalIntelligence={operationalIntelligence}
    />
  );
}

export async function DashboardAttentionServerSection({
  dataPromise,
  unreadPromise,
}: {
  dataPromise: LiveDataPromise;
  unreadPromise: UnreadPromise;
}) {
  const [data, unreadCommunications] = await Promise.all([
    dataPromise,
    unreadPromise,
  ]);

  return (
    <DashboardAttentionSummary
      data={data}
      unreadCommunications={unreadCommunications}
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
