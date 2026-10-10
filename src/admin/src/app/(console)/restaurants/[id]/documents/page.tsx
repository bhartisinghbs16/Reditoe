"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Download,
  Eye,
  FileCheck2,
  Flame,
  Landmark,
  MoreVertical,
  Pencil,
  Plus,
  ReceiptText,
  ShieldPlus,
  Upload,
} from "lucide-react";
import { Panel } from "@/components/common/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect } from "@/components/common/filter-bar";
import {
  RestaurantBoundary,
  RestaurantShell,
} from "@/components/restaurants/restaurant-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Restaurant } from "@/lib/types";
import { toast } from "sonner";
import {
  useUpdateRestaurantDocument,
  useUploadRestaurantDocument,
  useVerifyRestaurantDocument,
} from "@/lib/queries";

/**
 * Documents — the compliance paperwork a food business has to file, per the
 * reference's per-restaurant Documents screen.
 *
 * Each row reads one record from the restaurant's `documentRecords`: the file
 * itself, its number, when it was filed, when it expires, its status and who
 * decided that. Uploading a file sets the row to pending; Approve and Reject
 * decide it; and the restaurant's own KYC status follows from the required
 * four, so approving the paperwork approves the vendor without a second step.
 */

const DOCUMENT_TYPES = [
  {
    key: "fssai",
    label: "FSSAI License",
    icon: FileCheck2,
    tint: "bg-emerald-50 text-emerald-600",
    /** Carries an expiry date once uploaded. */
    expires: true,
    required: true,
  },
  {
    key: "pan",
    label: "PAN Card",
    icon: ReceiptText,
    tint: "bg-sky-50 text-sky-600",
    expires: false,
    required: true,
  },
  {
    key: "gst",
    label: "GST Certificate",
    icon: ReceiptText,
    tint: "bg-violet-50 text-violet-600",
    expires: false,
    required: true,
  },
  {
    key: "bank",
    label: "Bank Passbook",
    icon: Landmark,
    tint: "bg-amber-50 text-amber-600",
    expires: false,
    required: true,
  },
  {
    key: "aadhaar",
    label: "Aadhaar Card",
    icon: ReceiptText,
    tint: "bg-indigo-50 text-indigo-600",
    expires: false,
    required: false,
  },
  {
    key: "shop",
    label: "Shop & Establishment Certificate",
    icon: Building2,
    tint: "bg-rose-50 text-rose-600",
    expires: true,
    required: false,
  },
  {
    key: "fire",
    label: "Fire NOC",
    icon: Flame,
    tint: "bg-orange-50 text-orange-600",
    expires: true,
    required: false,
  },
  {
    key: "health",
    label: "Health NOC",
    icon: ShieldPlus,
    tint: "bg-teal-50 text-teal-600",
    expires: true,
    required: false,
  },
];

const TYPE_OPTIONS = DOCUMENT_TYPES.map((type) => ({
  value: type.key,
  label: type.label,
}));

const STATUS_OPTIONS = [
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "not_uploaded", label: "Not Uploaded" },
];

/** Dates render as "12 Mar 2026", or an em-dash when the API has none. */
function shortDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function RestaurantDocumentsPage() {
  const params = useParams<{ id: string }>();
  return (
    <RestaurantBoundary id={params.id}>
      {(restaurant) => <Documents restaurant={restaurant} />}
    </RestaurantBoundary>
  );
}

type DocStatus = "pending" | "verified" | "rejected";

/** The document whose recorded details are being corrected, if any. */
interface EditingDoc {
  type: string;
  label: string;
  expires: boolean;
  /** False when nothing has been filed: status cannot then be verified. */
  hasFile: boolean;
  number: string;
  uploadedAt: string;
  expiryDate: string;
  status: DocStatus;
  verifiedBy: string;
}

function Documents({ restaurant }: { restaurant: Restaurant }) {
  const [type, setType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [editing, setEditing] = React.useState<EditingDoc | null>(null);

  const uploadDoc = useUploadRestaurantDocument(restaurant._id);
  const verifyDoc = useVerifyRestaurantDocument(restaurant._id);
  const updateDoc = useUpdateRestaurantDocument(restaurant._id);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pendingType = React.useRef<string | null>(null);

  /** Opens the picker for one document type; the change handler uploads it. */
  function chooseFile(type: string) {
    pendingType.current = type;
    fileRef.current?.click();
  }

  async function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const type = pendingType.current;
    // Cleared straight away so picking the same file twice still fires.
    event.target.value = "";
    pendingType.current = null;
    if (!file || !type) return;

    try {
      await uploadDoc.mutateAsync({ type, file });
      const label = DOCUMENT_TYPES.find((entry) => entry.key === type)?.label ?? type;
      toast.success(`${label} uploaded — now pending approval`);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not upload that document."
      );
    }
  }

  /**
   * Rejecting asks why first. The reason is the only thing that tells a vendor
   * what to fix, so it is required rather than offered.
   */
  async function decide(
    type: string,
    status: "verified" | "rejected",
    label: string
  ) {
    let note: string | undefined;
    if (status === "rejected") {
      const reason = window.prompt(`Why is the ${label} being rejected?`);
      // Cancel leaves the document alone; an empty reason is not a reason.
      if (reason === null) return;
      if (!reason.trim()) {
        toast.error("Give a reason — the vendor sees it and acts on it.");
        return;
      }
      note = reason.trim();
    }

    try {
      await verifyDoc.mutateAsync({ type, status, note });
      toast.success(status === "verified" ? `${label} approved` : `${label} rejected`);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not update the document."
      );
    }
  }

  const records = restaurant.documentRecords ?? {};

  const rows = DOCUMENT_TYPES.map((document) => {
    const record = records[document.key];
    return {
      ...document,
      record,
      // No file means the row is genuinely empty — not "pending a decision".
      status: record?.url ? record.status ?? "pending" : "not_uploaded",
    };
  });

  const visible = rows.filter(
    (row) =>
      (!type || row.key === type) &&
      (!status ||
        (status === "not_uploaded"
          ? row.status === "not_uploaded"
          : row.status === status))
  );

  const verified = rows.filter((row) => row.status === "verified").length;

  return (
    <RestaurantShell
      restaurant={restaurant}
      title="Documents"
      section="documents"
      breadcrumbTail={[{ label: "Documents" }]}
      actions={
        <>
          <Button asChild variant="outline" size="lg">
            <Link href={`/restaurants/${restaurant._id}`}>
              <ArrowLeft className="size-4" />
              Back to Restaurant
            </Link>
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={onFilePicked}
          />
          {/* Asks which document it is rather than assuming. It used to be
              wired to FSSAI whatever you meant by it. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="lg" disabled={uploadDoc.isPending}>
                <Plus className="size-4" />
                {uploadDoc.isPending ? "Uploading…" : "Upload Document"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DOCUMENT_TYPES.map((document) => (
                <DropdownMenuItem
                  key={document.key}
                  onClick={() => chooseFile(document.key)}
                >
                  {document.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <Panel
        title="Documents"
        description="Manage and verify all documents submitted by the restaurant."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              value={type}
              onChange={setType}
              options={TYPE_OPTIONS}
              placeholder="All Document Types"
              allLabel="All Document Types"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
              placeholder="All Status"
              allLabel="All Status"
            />
          </div>
        }
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr className="border-b border-border text-[0.6875rem] text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Document Type
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Document Number
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Upload Date
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Expiry Date
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Verified By
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(
                ({ key, label, icon: Icon, tint, expires, status: state, record }) => {
                  const uploaded = state !== "not_uploaded";
                  return (
                    <tr key={key} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg",
                              tint
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[0.8125rem] font-medium">{label}</p>
                            {state === "rejected" && record?.note && (
                              <p className="text-[0.75rem] text-destructive">
                                {record.note}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[0.8125rem] text-muted-foreground">
                        {record?.number || "—"}
                      </td>
                      <td className="px-3 py-3 text-[0.8125rem] text-muted-foreground">
                        {shortDate(record?.uploadedAt)}
                      </td>
                      <td className="px-3 py-3 text-[0.8125rem] text-muted-foreground">
                        {expires ? shortDate(record?.expiryDate) : "Permanently Valid"}
                      </td>
                      <td className="px-3 py-3">
                        {uploaded ? (
                          <StatusBadge status={state} />
                        ) : (
                          <StatusBadge tone="neutral" dot={false} label="Not Uploaded" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-[0.8125rem] text-muted-foreground">
                        {record?.verifiedBy ? (
                          <>
                            {record.verifiedBy}
                            <span className="block text-[0.75rem]">
                              {shortDate(record.verifiedAt)}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {record?.url ? (
                            <>
                              {/* The file lives on the API; these are plain
                                  links to it so both actually do something. */}
                              <Button asChild variant="outline" size="icon-sm">
                                <a
                                  href={record.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`View ${label}`}
                                >
                                  <Eye className="size-3.5" />
                                </a>
                              </Button>
                              <Button asChild variant="outline" size="icon-sm">
                                <a
                                  href={record.url}
                                  download
                                  aria-label={`Download ${label}`}
                                >
                                  <Download className="size-3.5" />
                                </a>
                              </Button>
                              {/*
                                Correct what was recorded off the document.
                                The number and the expiry date were shown but
                                could not be changed, so a digit typed wrong
                                when the file was filed stayed wrong.
                              */}
                              <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label={`Edit ${label} details`}
                                onClick={() =>
                                  setEditing({
                                    type: key,
                                    label,
                                    expires,
                                    hasFile: Boolean(record.url),
                                    number: record.number ?? "",
                                    uploadedAt: record.uploadedAt
                                      ? String(record.uploadedAt).slice(0, 10)
                                      : "",
                                    expiryDate: record.expiryDate
                                      ? String(record.expiryDate).slice(0, 10)
                                      : "",
                                    status: (record.status ??
                                      "pending") as DocStatus,
                                    verifiedBy: record.verifiedBy ?? "",
                                  })
                                }
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={uploadDoc.isPending}
                              onClick={() => chooseFile(key)}
                            >
                              <Upload className="size-3.5" />
                              Upload
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Document actions"
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={!uploaded || state === "verified"}
                                onClick={() => void decide(key, "verified", label)}
                              >
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!uploaded || state === "rejected"}
                                onClick={() => void decide(key, "rejected", label)}
                              >
                                Reject
                              </DropdownMenuItem>
                              {/* Replacing the file is the re-upload. */}
                              <DropdownMenuItem onClick={() => chooseFile(key)}>
                                {uploaded ? "Replace file" : "Upload file"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[0.8125rem] text-muted-foreground">
          <span>
            Showing {visible.length} of {rows.length} documents · {verified} verified
          </span>
          <span className="text-[0.75rem]">
            Approving all {rows.filter((row) => row.required).length} required documents
            sets this restaurant to approved. Rejecting one sets it to rejected.
          </span>
        </div>
      </Panel>

      {/*
        Correcting what was recorded off a document. The number and the expiry
        date have always been stored and shown, and the endpoint has always
        accepted changes to them - the console just never offered a way to
        make one, so a digit typed wrong when the file was filed stayed wrong.
      */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.label} details</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="doc-number">Document number</Label>
                <Input
                  id="doc-number"
                  value={editing.number}
                  onChange={(event) =>
                    setEditing({ ...editing, number: event.target.value })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="doc-uploaded">Upload date</Label>
                  <Input
                    id="doc-uploaded"
                    type="date"
                    value={editing.uploadedAt}
                    max={editing.expiryDate || undefined}
                    onChange={(event) =>
                      setEditing({ ...editing, uploadedAt: event.target.value })
                    }
                  />
                </div>
                {editing.expires && (
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-expiry">Expiry date</Label>
                    <Input
                      id="doc-expiry"
                      type="date"
                      value={editing.expiryDate}
                      min={editing.uploadedAt || undefined}
                      onChange={(event) =>
                        setEditing({ ...editing, expiryDate: event.target.value })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="doc-status">Status</Label>
                <select
                  id="doc-status"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-[0.8125rem]"
                  value={editing.status}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      status: event.target.value as DocStatus,
                    })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="verified" disabled={!editing.hasFile}>
                    Verified
                  </option>
                  <option value="rejected">Rejected</option>
                </select>
                {!editing.hasFile && (
                  <p className="text-xs text-muted-foreground">
                    Nothing has been filed for this document, so it cannot be
                    marked verified.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="doc-verifier">Verified by</Label>
                <Input
                  id="doc-verifier"
                  placeholder="Leave blank to record yourself"
                  value={editing.verifiedBy}
                  disabled={editing.status === "pending"}
                  onChange={(event) =>
                    setEditing({ ...editing, verifiedBy: event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {editing.status === "pending"
                    ? "A pending document has nobody against it."
                    : "Name whoever checked the paperwork, if it was not you."}
                </p>
              </div>

              {/*
                Changing the status here does decide the document, and the
                restaurant's KYC state follows from these rows - so say so
                rather than let it happen quietly.
              */}
              <p className="text-xs text-muted-foreground text-pretty">
                Approving every required document sets this restaurant to
                approved; rejecting one sets it to rejected.
              </p>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={updateDoc.isPending}
              onClick={async () => {
                if (!editing) return;
                try {
                  await updateDoc.mutateAsync({
                    type: editing.type,
                    number: editing.number.trim(),
                    uploadedAt: editing.uploadedAt || "",
                    expiryDate: editing.expires
                      ? editing.expiryDate || ""
                      : undefined,
                    status: editing.status,
                    verifiedBy:
                      editing.status === "pending"
                        ? ""
                        : editing.verifiedBy.trim(),
                  });
                  toast.success(`${editing.label} details updated`);
                  setEditing(null);
                } catch (caught) {
                  toast.error(
                    caught instanceof Error
                      ? caught.message
                      : "Could not update the document."
                  );
                }
              }}
            >
              {updateDoc.isPending ? "Saving…" : "Save details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RestaurantShell>
  );
}
