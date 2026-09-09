import Link from "next/link";
import type { LiveCase } from "@/lib/data/case-repository";
import { displayName } from "@/lib/data/case-repository";
import { formatDate } from "@/lib/format";
import { Badge, ProgressBar } from "@/components/ui";
import { NavigableRow } from "@/components/navigable-row";
import { UserAvatar } from "@/components/user-avatar";
export function CaseTable({
  items,
  compact = false,
}: {
  items: LiveCase[];
  compact?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className={compact ? "compact-table" : ""}>
        <thead>
          <tr>
            <th>Case Number</th>
            <th>Customer</th>
            <th>Case</th>
            {!compact && <th>Case Type</th>}
            <th>Status</th>
            <th>Priority</th>
            {!compact && <th>Manager</th>}
            <th>Assigned Staff</th>
            <th>Progress</th>
            <th>Due Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <NavigableRow
              key={item.id}
              href={`/cases/${item.id}`}
              label={`Open case ${item.case_number}`}
            >
              <td>
                <Link className="case-link" href={`/cases/${item.id}`}>
                  {item.case_number}
                </Link>
              </td>
              <td>{item.customer?.name ?? "Unknown"}</td>
              <td>
                <b>{item.title}</b>
              </td>
              {!compact && <td>{item.case_type}</td>}
              <td>
                <Badge value={item.status} />
              </td>
              <td>
                <Badge value={item.priority} />
              </td>
              {!compact && <td>{displayName(item.manager)}</td>}
              <td>
                <div className="avatar-stack">
                  {item.assignedStaff.length ? (
                    item.assignedStaff.map((profile) => (
                      <UserAvatar
                        key={profile.id}
                        displayName={displayName(profile)}
                        email={profile.email}
                        src={profile.avatarUrl}
                        size="sm"
                      />
                    ))
                  ) : (
                    <em>Unassigned</em>
                  )}
                </div>
              </td>
              <td>
                <ProgressBar percentage={item.progress.progressPercent} compact />
              </td>
              <td>{formatDate(item.due_at ?? undefined)}</td>
            </NavigableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
