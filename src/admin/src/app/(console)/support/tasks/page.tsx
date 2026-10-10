"use client";

import * as React from "react";
import { CircleCheck, ClipboardList, Clock, Plus, TriangleAlert } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge, type Tone } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useCreateTask, useTasks } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { CreateDialog } from "@/components/common/create-dialog";
import { PRIORITY_OPTIONS } from "@/lib/domain";
import { date as formatDate, number as formatNumber, relativeTime, titleCase } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { AdminTask, Customer } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

function priorityTone(priority?: string): Tone {
  switch ((priority ?? "").toLowerCase()) {
    case "urgent":
      return "danger";
    case "high":
      return "warning";
    case "medium":
      return "info";
    default:
      return "neutral";
  }
}

/** Anything due before today that isn't done is overdue. */
function isOverdue(task: AdminTask) {
  if (!task.dueDate) return false;
  const done = ["done", "completed", "closed"].includes(
    (task.status ?? "").toLowerCase()
  );
  return !done && new Date(task.dueDate).getTime() < Date.now();
}

export default function TasksPage() {
  const list = useListState({ status: "", priority: "" });
  const tasks = useTasks(list.params);
  const createTask = useCreateTask();
  const [creating, setCreating] = React.useState(false);

  const columns: Column<AdminTask>[] = [
    {
      id: "task",
      header: "Task",
      cell: (task) => (
        <StackedCell primary={task.title ?? "Untitled"} secondary={task.description} />
      ),
    },
    {
      id: "module",
      header: "Area",
      hideBelow: "lg",
      cell: (task) => titleCase(task.module),
    },
    {
      id: "assignee",
      header: "Assigned to",
      hideBelow: "md",
      cell: (task) => {
        const assignee = refDoc<Customer>(task.assignedTo);
        if (!assignee) return <span className="text-muted-foreground">Unassigned</span>;
        return <IdentityCell name={assignee.name} secondary={assignee.email} />;
      },
    },
    {
      id: "priority",
      header: "Priority",
      cell: (task) => (
        <StatusBadge tone={priorityTone(task.priority)} label={titleCase(task.priority)} />
      ),
    },
    {
      id: "due",
      header: "Due",
      hideBelow: "lg",
      cell: (task) =>
        task.dueDate ? (
          <StackedCell
            primary={
              <span className={isOverdue(task) ? "text-danger" : undefined}>
                {formatDate(task.dueDate)}
              </span>
            }
            secondary={relativeTime(task.dueDate)}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (task) => <StatusBadge status={task.status} />,
    },
  ];

  const rows = tasks.data?.items ?? [];

  return (
    <>
    <ResourceListPage
      title="Tasks"
      description="Internal follow-ups assigned to the operations team."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Support", href: "/support" },
        { label: "Tasks" },
      ]}
      actions={
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New task
        </Button>
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Tasks"
            value={formatNumber(tasks.data?.total)}
            icon={ClipboardList}
            tone="indigo"
            loading={tasks.isPending}
          />
          <StatCard
            label="In progress (page)"
            value={formatNumber(
              rows.filter((task) => (task.status ?? "") === "in_progress").length
            )}
            icon={Clock}
            tone="amber"
            loading={tasks.isPending}
          />
          <StatCard
            label="Overdue (page)"
            value={formatNumber(rows.filter(isOverdue).length)}
            icon={TriangleAlert}
            tone="rose"
            loading={tasks.isPending}
          />
          <StatCard
            label="Done (page)"
            value={formatNumber(
              rows.filter((task) => ["done", "completed"].includes(task.status ?? ""))
                .length
            )}
            icon={CircleCheck}
            tone="emerald"
            loading={tasks.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search tasks…"
          />
          <FilterSelect
            value={list.filters.status ?? ""}
            onChange={(value) => list.setFilter("status", value)}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            allLabel="All statuses"
          />
          <FilterSelect
            value={list.filters.priority ?? ""}
            onChange={(value) => list.setFilter("priority", value)}
            options={PRIORITY_OPTIONS}
            placeholder="All priorities"
            allLabel="All priorities"
          />
        </>
      }
      columns={columns}
      query={tasks}
      list={list}
      rowKey={(task) => task._id}
      emptyTitle="No tasks"
      emptyDescription="Create a task to track follow-up work."
    />

    <CreateDialog
      open={creating}
      onOpenChange={setCreating}
      title="New task"
      initial={{ priority: "medium" }}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "Call MK Fast Foods about the missing invoice" },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          required: true,
          placeholder: "What needs doing, and anything the next person needs to know.",
        },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          required: true,
          options: [
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ],
        },
        { name: "dueDate", label: "Due", type: "date", required: true },
      ]}
      onSubmit={(values) => createTask.mutateAsync(values)}
    />
    </>
  );
}
