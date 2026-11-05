"use client";

import * as React from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { DataTable, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { StackedCell } from "@/components/common/cells";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAdminUsers,
  useCreateAdminUser,
  useCreateRole,
  useRoles,
  useUpdateAdminUser,
  useUpdateRole,
} from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { CreateDialog } from "@/components/common/create-dialog";
import { date as formatDate, number as formatNumber } from "@/lib/format";
import type { AdminUser, Role } from "@/lib/types";

/**
 * What a role can be granted: the resources and actions the API stores
 * (Role.js on the server). These are the only values it accepts, so the
 * editor offers exactly these rather than free text.
 */
const RESOURCES: { value: string; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "orders", label: "Orders" },
  { value: "users", label: "Customers" },
  { value: "restaurants", label: "Restaurants" },
  { value: "vendors", label: "Vendors" },
  { value: "riders", label: "Delivery partners" },
  { value: "financial", label: "Finance" },
  { value: "marketing", label: "Marketing" },
  { value: "analytics", label: "Analytics" },
  { value: "reports", label: "Reports" },
  { value: "notifications", label: "Notifications" },
  { value: "settings", label: "Settings" },
  { value: "backups", label: "Backups" },
];

const ACTIONS: { value: string; label: string }[] = [
  { value: "read", label: "View" },
  { value: "create", label: "Create" },
  { value: "update", label: "Edit" },
  { value: "delete", label: "Delete" },
  { value: "manage", label: "Manage all" },
];

const LEVEL_OPTIONS = [
  { value: "1", label: "1 — Owner" },
  { value: "2", label: "2 — Administrator" },
  { value: "3", label: "3 — Manager" },
  { value: "4", label: "4 — Supervisor" },
  { value: "5", label: "5 — Staff" },
];

/** `{ financial: Set(read, update) }` ⇄ the API's `[{ resource, actions }]`. */
type Grid = Record<string, Set<string>>;

function toGrid(role: Role): Grid {
  const grid: Grid = {};
  for (const permission of role.permissions ?? []) {
    grid[permission.resource] = new Set(permission.actions);
  }
  return grid;
}

function fromGrid(grid: Grid) {
  return Object.entries(grid)
    .filter(([, actions]) => actions.size > 0)
    .map(([resource, actions]) => ({ resource, actions: [...actions] }));
}

function PermissionEditor({
  role,
  onClose,
}: {
  role: Role | null;
  onClose: () => void;
}) {
  const updateRole = useUpdateRole();
  const [grid, setGrid] = React.useState<Grid>({});

  React.useEffect(() => {
    setGrid(role ? toGrid(role) : {});
  }, [role]);

  const toggle = (resource: string, action: string) =>
    setGrid((current) => {
      const next: Grid = { ...current, [resource]: new Set(current[resource] ?? []) };
      if (next[resource].has(action)) next[resource].delete(action);
      else next[resource].add(action);
      return next;
    });

  const save = async () => {
    if (!role) return;
    try {
      await updateRole.mutateAsync({ id: role._id, permissions: fromGrid(grid) });
      toast.success("Permissions saved");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save permissions");
    }
  };

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Permissions — {role?.displayName || role?.name}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tick what this role may do. “Manage all” covers every action on that area.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Area</th>
                {ACTIONS.map((action) => (
                  <th key={action.value} className="px-2 py-2 text-center font-medium">
                    {action.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((resource) => (
                <tr key={resource.value} className="border-t">
                  <td className="py-2 pr-3">{resource.label}</td>
                  {ACTIONS.map((action) => (
                    <td key={action.value} className="px-2 py-2 text-center">
                      <Checkbox
                        aria-label={`${resource.label}: ${action.label}`}
                        checked={grid[resource.value]?.has(action.value) ?? false}
                        onCheckedChange={() => toggle(resource.value, action.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateRole.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateRole.isPending}>
            {updateRole.isPending ? "Saving…" : "Save permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function summarise(role: Role) {
  const count = (role.permissions ?? []).reduce(
    (sum, permission) => sum + permission.actions.length,
    0
  );
  return count;
}

export default function RolesPage() {
  const list = useListState({}, 25);
  const roles = useRoles(list.params);
  const adminUsers = useAdminUsers({});
  const createRole = useCreateRole();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();

  const [creatingRole, setCreatingRole] = React.useState(false);
  const [creatingUser, setCreatingUser] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<Role | null>(null);
  const [editingUser, setEditingUser] = React.useState<AdminUser | null>(null);

  const rows = roles.data?.items ?? [];
  const people = adminUsers.data?.items ?? [];
  const roleOptions = rows.map((role) => ({
    value: role._id,
    label: role.displayName || role.name || "Unnamed",
  }));

  const roleColumns: Column<Role>[] = [
    {
      id: "role",
      header: "Role",
      /*
       * The name the admin typed, with the identifier under it. The
       * description is optional, so the identifier is the reliable second
       * line.
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
      cell: (role) => <span className="tabular-nums">{formatNumber(summarise(role))}</span>,
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
      id: "created",
      header: "Created",
      hideBelow: "xl",
      cell: (role) => formatDate(role.createdAt),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (role) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            setEditingRole(role);
          }}
        >
          <KeyRound className="size-3.5" />
          Permissions
        </Button>
      ),
    },
  ];

  const userColumns: Column<AdminUser>[] = [
    {
      id: "person",
      header: "Person",
      cell: (person) => (
        <StackedCell primary={person.name || "Unnamed"} secondary={person.email} />
      ),
    },
    {
      id: "role",
      header: "Role",
      cell: (person) =>
        person.rbacRole ? (
          person.rbacRole.displayName || person.rbacRole.name
        ) : (
          <span className="text-muted-foreground">Full access (legacy admin)</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "md",
      cell: (person) => (
        <StatusBadge
          tone={person.isBlocked ? "danger" : "success"}
          label={person.isBlocked ? "Deactivated" : "Active"}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (person) => (
        <Button size="sm" variant="outline" onClick={() => setEditingUser(person)}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
      ),
    },
  ];

  const totalPermissions = RESOURCES.length * (ACTIONS.length - 1);

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
          <>
            <Button size="lg" variant="outline" onClick={() => setCreatingRole(true)}>
              <Plus className="size-4" />
              Create role
            </Button>
            <Button size="lg" onClick={() => setCreatingUser(true)} disabled={rows.length === 0}>
              <UserPlus className="size-4" />
              Add admin user
            </Button>
          </>
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
          label="Admin users"
          value={formatNumber(adminUsers.data?.total ?? people.length)}
          icon={UsersRound}
          tone="violet"
          loading={adminUsers.isPending}
        />
        <StatCard
          label="Permissions available"
          value={formatNumber(totalPermissions)}
          icon={KeyRound}
          tone="emerald"
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Roles" description="Open a role to choose what it may do.">
          <DataTable
            columns={roleColumns}
            rows={rows}
            rowKey={(role) => role._id}
            loading={roles.isPending}
            error={roles.error}
            onRetry={() => roles.refetch()}
            onRowClick={(role) => setEditingRole(role)}
            emptyTitle="No roles defined"
            emptyDescription="Create a role to grant scoped access to your team."
            emptyAction={
              <Button size="sm" onClick={() => setCreatingRole(true)}>
                <Plus className="size-3.5" />
                Create role
              </Button>
            }
          />
        </Panel>

        <Panel title="Admin users" description="People who can sign in to this console.">
          <DataTable
            columns={userColumns}
            rows={people}
            rowKey={(person) => person._id}
            loading={adminUsers.isPending}
            error={adminUsers.error}
            onRetry={() => adminUsers.refetch()}
            emptyTitle="No admin users"
            emptyDescription="Add a person and give them a role."
          />
        </Panel>
      </div>

      <PermissionEditor role={editingRole} onClose={() => setEditingRole(null)} />

      <CreateDialog
        open={creatingRole}
        onOpenChange={setCreatingRole}
        title="Create role"
        description="Choose what the role may do from its Permissions button once it exists."
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
            hint: "Used in code and permission checks. Letters, numbers, underscores.",
          },
          { name: "description", label: "Description", type: "textarea", placeholder: "Reviews and approves refund requests." },
          {
            name: "level",
            label: "Level",
            type: "select",
            required: true,
            hint: "Lower numbers outrank higher ones.",
            options: LEVEL_OPTIONS,
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

      <CreateDialog
        open={creatingUser}
        onOpenChange={setCreatingUser}
        title="Add admin user"
        description="They sign in with this email and password, and can do what their role allows."
        fields={[
          { name: "name", label: "Full name", required: true, placeholder: "Asha Verma" },
          { name: "email", label: "Email", type: "email", required: true, placeholder: "asha@reditoe.com" },
          {
            name: "password",
            label: "Temporary password",
            type: "password",
            required: true,
            hint: "They can change it after signing in.",
          },
          {
            name: "roleId",
            label: "Role",
            type: "select",
            required: true,
            options: roleOptions,
          },
        ]}
        onSubmit={(values) =>
          createUser.mutateAsync({
            name: values.name.trim(),
            email: values.email.trim().toLowerCase(),
            password: values.password,
            roleId: values.roleId,
          })
        }
      />

      <CreateDialog
        // Remounted per person so the form starts from their current values.
        key={editingUser?._id ?? "none"}
        open={editingUser !== null}
        onOpenChange={(open) => !open && setEditingUser(null)}
        title={`Edit ${editingUser?.name ?? "admin user"}`}
        submitLabel="Save"
        initial={{
          roleId: editingUser?.rbacRole?._id ?? "",
          status: editingUser?.isBlocked ? "inactive" : "active",
        }}
        fields={[
          { name: "roleId", label: "Role", type: "select", required: true, options: roleOptions },
          {
            name: "status",
            label: "Access",
            type: "select",
            required: true,
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Deactivated — cannot sign in" },
            ],
          },
        ]}
        onSubmit={(values) =>
          updateUser.mutateAsync({
            id: editingUser!._id,
            roleId: values.roleId,
            isActive: values.status === "active",
          })
        }
      />
    </>
  );
}
