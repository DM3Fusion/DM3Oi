import assert from "node:assert/strict";
import test from "node:test";
import {
  getTaskAssigneeWorkloads,
  getTaskDashboardCounts,
  type TaskWorkloadUser,
} from "../lib/task-assignee-workload.ts";
import type { TaskRow } from "../lib/data/case-repository.ts";

const task = (
  id: string,
  status: TaskRow["status"],
  assignedUserId: string | null,
  dueAt: string | null = null,
  completedByUserId: string | null = null,
) =>
  ({
    id,
    status,
    assigned_user_id: assignedUserId,
    due_at: dueAt,
    completed_by_user_id: completedByUserId,
  }) as TaskRow;

const users: TaskWorkloadUser[] = [
  {
    role: "STAFF_USER",
    profile: {
      id: "a",
      display_name: "Alpha",
      email: "a@example.com",
      avatarUrl: null,
    },
  },
  {
    role: "STAFF_MANAGER",
    profile: {
      id: "b",
      display_name: "Bravo",
      email: "b@example.com",
      avatarUrl: null,
    },
  },
];

test("Task dashboard uses canonical Task status counts", () => {
  const rows = [
    task("1", "NOT_STARTED", "a"),
    task("2", "IN_PROGRESS", "a"),
    task("3", "COMPLETED", "a"),
    task("4", "WAITING_ON_CUSTOMER", "b"),
    task("5", "REQUIRED_UNAVAILABLE", "b"),
  ];

  assert.deepEqual(getTaskDashboardCounts(rows, "UTC"), {
    total: 5,
    overdue: 0,
    notStarted: 1,
    inProgress: 1,
    completed: 1,
  });
});

test("Task overdue excludes completed work", () => {
  const now = new Date("2026-10-06T16:00:00Z");
  const rows = [
    task("1", "NOT_STARTED", "a", "2026-10-05T12:00:00Z"),
    task("2", "COMPLETED", "a", "2026-10-05T12:00:00Z"),
  ];

  assert.equal(
    getTaskDashboardCounts(rows, "America/New_York", now).overdue,
    1,
  );
});

test("Task workloads count current assignment by user", () => {
  const rows = [
    task("1", "NOT_STARTED", "a"),
    task("2", "IN_PROGRESS", "a"),
    task("3", "NOT_STARTED", "b"),
  ];

  const result = getTaskAssigneeWorkloads(users, rows, "UTC");

  assert.deepEqual(
    result.map((item) => ({
      id: item.profile.id,
      notStarted: item.notStarted,
      inProgress: item.inProgress,
    })),
    [
      { id: "a", notStarted: 1, inProgress: 1 },
      { id: "b", notStarted: 1, inProgress: 0 },
    ],
  );
});

test("Task completion attribution survives current assignment changes when completed_by is preserved", () => {
  const rows = [
    task("1", "COMPLETED", "b", null, "a"),
  ];

  const result = getTaskAssigneeWorkloads(users, rows, "UTC");

  assert.equal(result[0].completed, 1);
  assert.equal(result[0].lifetime, 1);
  assert.equal(result[1].completed, 0);
  assert.equal(result[1].lifetime, 1);
});

test("Task Lifetime does not invent reassignment history", () => {
  const rows = [
    task("1", "IN_PROGRESS", "b"),
  ];

  const result = getTaskAssigneeWorkloads(users, rows, "UTC");

  assert.equal(result[0].lifetime, 0);
  assert.equal(result[1].lifetime, 1);
});

test("eligible zero-workload users remain visible", () => {
  const result = getTaskAssigneeWorkloads(users, [], "UTC");

  assert.equal(result.length, 2);
  assert.equal(result[0].lifetime, 0);
  assert.equal(result[1].lifetime, 0);
});
