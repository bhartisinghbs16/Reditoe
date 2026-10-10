"use client";

import * as React from "react";
import { KeyRound, Lock, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { DataTable, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { StackedCell } from "@/components/common/cells";
import { Button } from "@/components/ui/button";
import { useCreateRole, useRoles } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { CreateDialog } from "@/components/common/create-dialog";
import { date as formatDate, number as formatNumber } from "@/lib/format";
import type { Role } from "@/lib/types";

/**
 * The permission surface the console exposes. Grouped by module so a role can
 * be reasoned about one area at a time.
 */
const PERMISSION_GROUPS = [
  {
    module: "Orders",
    permissions: ["orders.view", "orders.update", "orders.cancel", "orders.refund"],
  },
  {
    module: "Customers",
    permissions: ["customers.view", "customers.edit", "customers.block"],
  },
  {
    module: "Restaurants",
    permissions: [
      "restaurants.view",
      "restaurants.approve",
      "restaurants.edit",
      "restaurants.suspend",
    ],
  },
  {
    module: "Delivery partners",
    permissions: ["riders.view", "riders.verify", "riders.block", "riders.payout"],
  },
  {
    module: "Finance",
    permissions: [
      "finance.view",
      "finance.settle",
      "finance.payout",
      "finance.invoice",
    ],
  },
  {
    module: "Marketing",
    permissions: ["marketing.view", "marketing.create", "marketing.publish"],
  },
  {
    module: "System",
    permissions: ["system.settings", "system.roles", "system.activity"],
  },
];

export default function RolesPage() {
  const list = useListState({}, 25);
  const roles = useRoles(list.params);
  const createRole = useCreateRole();
  const [creating, setCreating] = React.useState(false);
  const rows = roles.data?.items ?? [];

  const columns: Column<Role>[] = [
    {
      id: "role",
      header: "Role",
      /*
       * The name the admin typed, with the identifier under it.
       *
       * This led with `name`, the code identifier, so someone who created
       * "Refund team" found a row called "refund_team" and the name they had
       * chosen appeared nowhere. The description is optional, so the
       * identifier is the reliable second line.
       */
      cell: (role) => (
        <StackedCell
          primary={role.displayName || role.name || "Unnamed"}
          secondary={role.description || role.name}
        />
      ),
    },
    {
      id: "permissions",
      header: "Permissions",
      hideBelow: "md",
      cell: (role) => (
        <span className="tabular-nums">
          {formatNumber(role.permissions?.length ?? 0)}
        </span>
      ),
    },
    {
      id: "users",
      header: "Assigned",
      align: "right",
      hideBelow: "lg",
      cell: (role) => (
        <span className="tabular-nums">{formatNumber(role.userCount ?? 0)}</span>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (role) =>
        role.isSystem ? (
          <StatusBadge tone="info" label="Built-in" />
        ) : (
          <StatusBadge tone="neutral" label="Custom" />
        ),
    },
    {
      id: "created",
      header: "Created",
      hideBelow: "xl",
      cell: (role) => formatDate(role.createdAt),
    },
  ];

  const totalPermissions = PERMISSION_GROUPS.reduce(
    (sum, group) => sum + group.permissions.length,
    0
  );

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Who can do what in the console. Roles bundle permissions; people get roles."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "System" },
          { label: "Users & roles" },
        ]}
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Create role
          </Button>
        }
      />

      <StatGrid columns={3}>
        <StatCard
          label="Roles"
          value={formatNumber(roles.data?.total ?? rows.length)}
          icon={ShieldCheck}
          tone="indigo"
          loading={roles.isPending}
        />
        <StatCard
          label="Admins assigned"
          value={formatNumber(
            rows.reduce((sum, role) => sum + (role.userCount ?? 0), 0)
          )}
          icon={UsersRound}
          tone="violet"
          loading={roles.isPending}
        />
        <StatCard
          label="Permissions available"
          value={formatNumber(totalPermissions)}
          icon={KeyRound}
          tone="emerald"
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(role) => role._id}
          loading={roles.isPending}
          error={roles.error}
          onRetry={() => roles.refetch()}
          emptyTitle="No roles defined"
          emptyDescription="Create a role to grant scoped access to your team."
          emptyAction={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              Create role
            </Button>
          }
        />

        <Panel
          title="Permission catalogue"
          description="Every capability a role can be granted."
        >
          <div className="space-y-4">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.module}>
                <div className="label-eyebrow">{group.module}</div>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.permissions.map((permission) => (
                    <li key={permission}>
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                        <Lock className="size-2.5" />
                        {permission}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create role"
        description="Permissions are assigned from the role's own page once it exists."
        initial={{ level: "5" }}
        fields={[
          {
            name: "displayName",
            label: "Role name",
            required: true,
            placeholder: "Refund team",
            hint: "What the team is called in this console.",
          },
          {
            name: "name",
            label: "Identifier",
            required: true,
            placeholder: "refund_team",
            hint: "Used in code and permission checks. Lower case, no spaces.",
          },
          { name: "description", label: "Description", type: "textarea", placeholder: "Reviews and approves refund requests." },
          {
            name: "level",
            label: "Level",
            type: "select",
            required: true,
            hint: "Lower numbers outrank higher ones.",
            options: [
              { value: "1", label: "1 — Owner" },
              { value: "2", label: "2 — Administrator" },
              { value: "3", label: "3 — Manager" },
              { value: "4", label: "4 — Supervisor" },
              { value: "5", label: "5 — Staff" },
            ],
          },
        ]}
        onSubmit={(values) =>
          createRole.mutateAsync({
            name: values.name.trim().toLowerCase().replace(/\s+/g, "_"),
            displayName: values.displayName,
            description: values.description || undefined,
            level: Number(values.level),
            permissions: [],
          })
        }
      />
    </>
  );
}
