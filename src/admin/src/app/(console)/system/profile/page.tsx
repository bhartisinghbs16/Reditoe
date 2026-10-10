"use client";

import { TwoFactorCard } from "@/components/system/two-factor-card";
import * as React from "react";
import { KeyRound, Loader2, LogOut, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel, DetailRow } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { initials, phone as formatPhone } from "@/lib/format";

export default function ProfilePage() {
  const { user, setUser, signOut } = useSession();

  const [name, setName] = React.useState(user?.name ?? "");
  const [phone, setPhone] = React.useState(user?.phone ?? "");
  const [savingProfile, setSavingProfile] = React.useState(false);

  // The session restores asynchronously, so the form seeds itself the first time
  // a user arrives (and again if the account changes) — during render, not in an
  // effect, so the inputs are never briefly blank.
  const [seededId, setSeededId] = React.useState(user?.id ?? null);
  if (user && user.id !== seededId) {
    setSeededId(user.id);
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
  }

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [savingPassword, setSavingPassword] = React.useState(false);

  const profileDirty = name !== (user?.name ?? "") || phone !== (user?.phone ?? "");

  async function onSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await api.patch<{ user?: typeof user }>("/admin/auth/me", {
        name: name.trim(),
        phone: phone.trim(),
      });
      if (updated?.user) setUser(updated.user);
      else if (user) setUser({ ...user, name: name.trim(), phone: phone.trim() });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not update the profile"
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("The two new passwords don't match.");
      return;
    }

    setSavingPassword(true);
    try {
      await api.patch("/admin/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not change the password"
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Your profile"
        description="Your admin account details and sign-in security."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "System" },
          { label: "Profile" },
        ]}
        actions={
          <Button variant="outline" size="lg" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Account">
          <div className="flex items-center gap-3">
            <Avatar className="size-14">
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-semibold text-white">
                {initials(user?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{user?.name ?? "Administrator"}</p>
              <p className="truncate text-sm text-muted-foreground">
                {user?.email ?? "—"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <DetailRow
              label="Role"
              value={<StatusBadge tone="accent" dot={false} label={user?.role ?? "admin"} />}
            />
            <DetailRow label="Phone" value={formatPhone(user?.phone)} />
            <DetailRow
              label="Account ID"
              value={<span className="font-mono text-xs">{user?.id ?? "—"}</span>}
            />
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel
            title="Details"
            description="Your email is managed by a super admin and can't be changed here."
          >
            <form onSubmit={onSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 00000 00000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ""} disabled />
              </div>
              <Button type="submit" disabled={!profileDirty || savingProfile}>
                {savingProfile ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save changes
              </Button>
            </form>
          </Panel>

          <Panel
            title="Password"
            description="Use at least 8 characters. You stay signed in on this device."
          >
            <form onSubmit={onChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={
                  savingPassword || !currentPassword || !newPassword || !confirmPassword
                }
              >
                {savingPassword ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Change password
              </Button>
            </form>
          </Panel>

          <Panel title="Security">
            <div className="flex items-start gap-3">
              <span className="icon-tile bg-success-muted text-success-foreground">
                <ShieldCheck className="size-[1.15rem]" />
              </span>
              <div>
                <p className="text-sm font-medium">Session</p>
                <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                  Signing out clears the token on this device only. To end every
                  session, ask a super admin to rotate the platform JWT secret.
                </p>
              </div>
            </div>
          </Panel>

          <TwoFactorCard />
        </div>
      </div>
    </>
  );
}
