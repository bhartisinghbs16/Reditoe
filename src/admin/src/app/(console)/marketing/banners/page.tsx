"use client";

import * as React from "react";
import { Image as ImageIcon, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import {
  useBanners,
  useCreateBanner,
  useDeleteBanner,
  useUpdateBanner,
  useUploadBannerImage,
} from "@/lib/queries";
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
import { useListState } from "@/lib/use-list-state";
import { date as formatDate, number as formatNumber, titleCase } from "@/lib/format";
import type { Banner } from "@/lib/types";

/*
 * These are the placements the API actually accepts. They read "home_top"
 * and "home_middle" before, which are not in the model's list, so filtering
 * by one found nothing and saving one would have been rejected.
 */
const POSITION_OPTIONS = [
  { value: "homepage", label: "Home page" },
  { value: "category", label: "Category page" },
  { value: "restaurant", label: "Restaurant page" },
  { value: "checkout", label: "Checkout" },
];

/** A poster being written, whether new or an existing one being corrected. */
interface BannerDraft {
  id?: string;
  title: string;
  description: string;
  mediaUrl: string;
  position: string;
  actionUrl: string;
  displayOrder: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const EMPTY_DRAFT: BannerDraft = {
  title: "",
  description: "",
  mediaUrl: "",
  position: "homepage",
  actionUrl: "",
  displayOrder: "0",
  startDate: "",
  endDate: "",
  isActive: true,
};

export default function BannersPage() {
  const list = useListState({ position: "", status: "" });
  const banners = useBanners(list.params);
  const createBanner = useCreateBanner();
  const updateBanner = useUpdateBanner();
  const deleteBanner = useDeleteBanner();
  const uploadImage = useUploadBannerImage();

  const [draft, setDraft] = React.useState<BannerDraft | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const openFor = (banner?: Banner) =>
    setDraft(
      banner
        ? {
            id: banner._id,
            title: banner.title ?? "",
            description: banner.description ?? "",
            mediaUrl: banner.mediaUrl ?? banner.image ?? "",
            position: banner.position ?? "homepage",
            actionUrl: banner.actionUrl ?? banner.link ?? "",
            displayOrder: String(banner.displayOrder ?? 0),
            startDate: banner.startDate ? banner.startDate.slice(0, 10) : "",
            endDate: banner.endDate ? banner.endDate.slice(0, 10) : "",
            isActive: banner.isActive !== false,
          }
        : { ...EMPTY_DRAFT }
    );

  /** Saves the poster. The image is uploaded first, so this sends a URL. */
  const save = async () => {
    if (!draft) return;
    const body = {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      // The model demands both, and every poster we make is a still image.
      bannerType: "image" as const,
      mediaType: "image" as const,
      mediaUrl: draft.mediaUrl.trim(),
      position: draft.position,
      actionUrl: draft.actionUrl.trim() || undefined,
      displayOrder: Number(draft.displayOrder) || 0,
      startDate: draft.startDate || undefined,
      endDate: draft.endDate || undefined,
      isActive: draft.isActive,
    };

    try {
      if (draft.id) await updateBanner.mutateAsync({ id: draft.id, ...body });
      else await createBanner.mutateAsync(body);
      toast.success(draft.id ? "Poster updated" : "Poster added");
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  };

  const columns: Column<Banner>[] = [
    {
      id: "banner",
      header: "Banner",
      /*
       * The poster itself, from the field the API actually stores it in.
       *
       * This read `image` and `link`, which the banner endpoint has never
       * sent — so every row fell back to the title's initials and no poster
       * was ever visible in the list that exists to show them.
       */
      cell: (banner) => (
        <IdentityCell
          square
          name={banner.title ?? "Untitled"}
          secondary={banner.actionUrl ?? banner.link}
          image={banner.mediaUrl ?? banner.image}
        />
      ),
    },
    {
      id: "position",
      header: "Placement",
      hideBelow: "md",
      cell: (banner) => titleCase(banner.position),
    },
    {
      id: "window",
      header: "Runs",
      hideBelow: "lg",
      cell: (banner) =>
        banner.startDate || banner.endDate ? (
          <StackedCell
            primary={formatDate(banner.startDate)}
            secondary={`to ${formatDate(banner.endDate)}`}
          />
        ) : (
          <span className="text-muted-foreground">Always on</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (banner) => (
        <StatusBadge status={banner.isActive === false ? "inactive" : "active"} />
      ),
    },
    {
      id: "created",
      header: "Created",
      hideBelow: "xl",
      cell: (banner) => formatDate(banner.createdAt),
    },
  ];

  const rows = banners.data?.items ?? [];

  const actionColumn: Column<Banner> = {
    id: "actions",
    header: "",
    cell: (banner) => (
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Edit ${banner.title ?? "poster"}`}
          onClick={(event) => {
            event.stopPropagation();
            openFor(banner);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async (event) => {
            event.stopPropagation();
            // One switch, so a poster can be pulled without deleting it.
            try {
              await updateBanner.mutateAsync({
                id: banner._id,
                isActive: banner.isActive === false,
              });
              toast.success(banner.isActive === false ? "Poster is live" : "Poster hidden");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not update");
            }
          }}
        >
          {banner.isActive === false ? "Show" : "Hide"}
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Delete ${banner.title ?? "poster"}`}
          onClick={async (event) => {
            event.stopPropagation();
            if (!window.confirm(`Delete "${banner.title ?? "this poster"}"? This cannot be undone.`))
              return;
            try {
              await deleteBanner.mutateAsync({ id: banner._id });
              toast.success("Poster deleted");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not delete");
            }
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    ),
  };

  return (
    <>
    <ResourceListPage
      title="Banners"
      description="Promotional artwork shown inside the customer app."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Marketing" },
        { label: "Banners" },
      ]}
      actions={
        <Button size="lg" onClick={() => openFor()}>
          <Plus className="size-4" />
          Add banner
        </Button>
      }
      stats={
        <StatGrid columns={3}>
          <StatCard
            label="Banners"
            value={formatNumber(banners.data?.total)}
            icon={ImageIcon}
            tone="indigo"
            loading={banners.isPending}
          />
          <StatCard
            label="Live (page)"
            value={formatNumber(rows.filter((b) => b.isActive !== false).length)}
            icon={ImageIcon}
            tone="emerald"
            loading={banners.isPending}
          />
          <StatCard
            label="Placements in use (page)"
            value={formatNumber(new Set(rows.map((b) => b.position)).size)}
            icon={ImageIcon}
            tone="violet"
            loading={banners.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search banners…"
          />
          <FilterSelect
            value={list.filters.position ?? ""}
            onChange={(value) => list.setFilter("position", value)}
            options={POSITION_OPTIONS}
            placeholder="All placements"
            allLabel="All placements"
          />
        </>
      }
      columns={[...columns, actionColumn]}
      query={banners}
      list={list}
      rowKey={(banner) => banner._id}
      emptyTitle="No banners yet"
    />

    {/*
      Writing a poster. The image is uploaded first and the banner stores its
      address, so the same picture can be reused and the record stays small.
    */}
    <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Edit poster" : "Add poster"}</DialogTitle>
        </DialogHeader>
        {draft && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="banner-title">Title</Label>
              <Input
                id="banner-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Flat 20% off this weekend"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Image</Label>
              {draft.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.mediaUrl}
                  alt=""
                  className="h-28 w-full rounded-md border border-border object-cover"
                />
              ) : (
                <div className="flex h-28 w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                  No image chosen
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                /*
                 * What the server actually stores. `image/*` let the picker
                 * offer a HEIC straight off an iPhone, which was then refused
                 * on upload — the choice should not include files that cannot
                 * be used.
                 */
                accept=".jpg,.jpeg,.jfif,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    const result = await uploadImage.mutateAsync({ file });
                    const url = result?.url;
                    if (!url) throw new Error("The upload returned no address");
                    setDraft((current) => (current ? { ...current, mediaUrl: url } : current));
                    toast.success("Image uploaded");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not upload the image"
                    );
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadImage.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  {uploadImage.isPending ? "Uploading…" : "Upload image"}
                </Button>
                {draft.mediaUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDraft({ ...draft, mediaUrl: "" })}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="banner-position">Placement</Label>
                <select
                  id="banner-position"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-[0.8125rem]"
                  value={draft.position}
                  onChange={(event) => setDraft({ ...draft, position: event.target.value })}
                >
                  {POSITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="banner-order">Order</Label>
                <Input
                  id="banner-order"
                  type="number"
                  value={draft.displayOrder}
                  onChange={(event) =>
                    setDraft({ ...draft, displayOrder: event.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="banner-from">Runs from</Label>
                <Input
                  id="banner-from"
                  type="date"
                  value={draft.startDate}
                  max={draft.endDate || undefined}
                  onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="banner-to">Until</Label>
                <Input
                  id="banner-to"
                  type="date"
                  value={draft.endDate}
                  min={draft.startDate || undefined}
                  onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                />
              </div>
            </div>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.isActive}
                onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              />
              <span className="text-[0.8125rem]">
                Live in the app
                <span className="block text-xs text-muted-foreground">
                  Off keeps the poster without showing it.
                </span>
              </span>
            </label>

            <p className="text-xs text-muted-foreground text-pretty">
              Leaving the dates empty runs the poster until you hide it. The app
              shows every live poster for this placement, newest order first.
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
            disabled={
              !draft?.title.trim() ||
              !draft?.mediaUrl.trim() ||
              createBanner.isPending ||
              updateBanner.isPending
            }
            onClick={save}
          >
            {createBanner.isPending || updateBanner.isPending ? "Saving…" : "Save poster"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
