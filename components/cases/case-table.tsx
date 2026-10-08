import Link from "next/link";
import type { CaseRegisterRow } from "@/lib/data/case-repository";
import { displayName } from "@/lib/data/case-repository";
import { formatDate } from "@/lib/format";
import { Badge, ProgressBar } from "@/components/ui";
import { NavigableRow } from "@/components/navigable-row";
import { UserAvatar } from "@/components/user-avatar";
export function CaseTable({
  items,
  compact = false,
}: {
  items: CaseRegisterRow[];
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
            <th>Status</th>
            <th>Priority</th>
            <th>Assigned Staff</th>
            <th>Progress</th>
            <th>Task Due</th>
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
                <span>{item.title}</span>
              </td>
              <td>
                <Badge value={item.status} />
              </td>
              <td>
                <Badge value={item.priority} />
              </td>
              <td>
                <div className="case-assigned-staff">
                  {item.assignedStaff.length ? (
                    item.assignedStaff.map((profile) => (
                      <div className="case-assigned-staff-person" key={profile.id}>
                        <UserAvatar
                          displayName={displayName(profile)}
                          email={profile.email}
                          src={profile.avatarUrl}
                          size="sm"
                        />
                        <span>{displayName(profile)}</span>
                      </div>
                    ))
                  ) : (
                    <em>Unassigned</em>
                  )}
                </div>
              </td>
              <td>
                <ProgressBar percentage={item.progress.progressPercent} compact />
              </td>
              <td>
                {item.status === "COMPLETED"
                  ? "—"
                  : formatDate(item.nextTaskDueAt ?? undefined)}
              </td>
            </NavigableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
