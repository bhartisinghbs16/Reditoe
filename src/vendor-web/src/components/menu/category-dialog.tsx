"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TextInput } from "@/components/common/form-field";
import { EmptyState } from "@/components/common/empty-state";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  toggleCategory,
  type MenuCategory,
} from "@/lib/vendor-api";

/**
 * Manage the sections a menu is grouped into.
 *
 * Kept as a dialog off the menu screen rather than its own page: categories
 * are a handful of names a vendor edits rarely, and sending them somewhere
 * else to do it would lose the list they are naming.
 */
export function CategoryDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MenuCategory[];
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["menu"] });
  };

  const fail = (error: Error, fallback: string) =>
    toast.error(error.message || fallback);

  const add = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => {
      toast.success("Category added");
      setAdding("");
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not add the category"),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameCategory(id, name),
    onSuccess: () => {
      toast.success("Category renamed");
      setEditingId(null);
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not rename the category"),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => toggleCategory(id),
    onSuccess: () => refresh(),
    onError: (error: Error) => fail(error, "Could not change the category"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      toast.success("Category deleted");
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not delete the category"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Menu Categories</DialogTitle>
          <DialogDescription>
            The sections your dishes are grouped into on the customer menu.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (adding.trim()) add.mutate(adding.trim());
          }}
        >
          <TextInput
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            placeholder="New category, e.g. Desserts"
            maxLength={40}
          />
          <Button type="submit" disabled={!adding.trim() || add.isPending}>
            {add.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add
          </Button>
        </form>

        {categories.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Add one above and it becomes selectable on every dish."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {categories.map((category) => {
              const editing = editingId === category.id;
              return (
                <li
                  key={category.id}
                  className="flex items-center gap-2 px-3 py-2.5"
                >
                  {editing ? (
                    <>
                      <TextInput
                        autoFocus
                        value={editingName}
                        maxLength={40}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="h-9"
                      />
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label="Save name"
                        disabled={!editingName.trim() || rename.isPending}
                        onClick={() =>
                          rename.mutate({
                            id: category.id,
                            name: editingName.trim(),
                          })
                        }
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Cancel"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.875rem] font-medium">
                          {category.name}
                        </p>
                        <p className="text-[0.75rem] text-muted-foreground">
                          {category.itemCount} item
                          {category.itemCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Switch
                        checked={category.active}
                        onCheckedChange={() => toggle.mutate(category.id)}
                        aria-label={`${category.name} visible`}
                      />
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={`Rename ${category.name}`}
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${category.name}`}
                        className="text-red-600 hover:bg-red-50 hover:text-red-600"
                        onClick={() => {
                          if (window.confirm(`Delete "${category.name}"?`)) {
                            remove.mutate(category.id);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
