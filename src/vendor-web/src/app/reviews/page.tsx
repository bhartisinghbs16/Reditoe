"use client";

import * as React from "react";
import { MessageSquare, MessageSquareWarning, Star, ThumbsUp, Users } from "lucide-react";
import { toast } from "sonner";
import { PageActions } from "@/components/common/page-actions";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { UnderlineTabs } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/empty-state";
import { FixtureNote } from "@/components/common/fixture-note";
import { PromoBanner } from "@/components/common/promo-banner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { friendlyDateTime, initials, number as formatNumber } from "@/lib/format";
import {
  ratingDistribution,
  reviewTotals,
  reviews as seedReviews,
  type Review,
} from "@/lib/data";

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn("flex items-center gap-0.5", className)}
      aria-label={`${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-3.5",
            n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          )}
        />
      ))}
    </span>
  );
}

function ReviewCard({
  review,
  onReply,
}: {
  review: Review;
  onReply: (id: string, reply: string) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [replying, setReplying] = React.useState(false);

  const submit = () => {
    if (!draft.trim()) return;
    onReply(review.id, draft.trim());
    setDraft("");
    setReplying(false);
    toast.success("Reply saved locally — no endpoint to post it to yet");
  };

  return (
    <article className="surface p-4">
      <header className="flex items-start gap-3">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className="bg-muted text-[0.6875rem] font-semibold text-muted-foreground">
            {initials(review.customer)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-semibold">{review.customer}</p>
          <p
            suppressHydrationWarning
            className="truncate text-xs text-muted-foreground"
          >
            #{review.orderId} · {friendlyDateTime(review.at)}
          </p>
        </div>
        <Stars value={review.rating} className="shrink-0" />
      </header>

      <p className="mt-3 text-[0.875rem] text-pretty">{review.comment}</p>

      {review.reply ? (
        <div className="mt-3 rounded-lg border-l-2 border-primary bg-muted/60 px-3 py-2">
          <p className="text-[0.6875rem] font-semibold text-muted-foreground">
            Your reply
          </p>
          <p className="mt-0.5 text-[0.875rem]">{review.reply}</p>
        </div>
      ) : replying ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Reply to this customer…"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={!draft.trim()}>
              Post reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setReplying(true)}
        >
          <MessageSquare className="size-3.5" />
          Reply
        </Button>
      )}
    </article>
  );
}

export default function ReviewsPage() {
  // Local state, not a query: this backend exposes reviews to customers only.
  // Replies live for the session so the screen can be walked through, and the
  // page says so rather than implying they were sent.
  const [reviews, setReviews] = React.useState<Review[]>(seedReviews);
  const [tab, setTab] = React.useState<"all" | "unanswered" | "low">("all");

  const reply = React.useCallback((id: string, text: string) => {
    setReviews((current) =>
      current.map((review) =>
        review.id === id ? { ...review, reply: text } : review
      )
    );
  }, []);

  const visible = reviews.filter((review) => {
    if (tab === "unanswered") return !review.reply;
    if (tab === "low") return review.rating <= 3;
    return true;
  });

  const unanswered = reviews.filter((r) => !r.reply).length;
  const low = reviews.filter((r) => r.rating <= 3).length;
  const ratingTotal = ratingDistribution.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageActions>
        <span />
      </PageActions>

      <FixtureNote className="mb-4">
        Sample data. This backend serves reviews to customers only — there is no
        vendor endpoint to read them or post a reply through, so nothing on this
        screen reaches the platform.
      </FixtureNote>

      <StatGrid columns={4}>
        <StatCard
          label="Overall Rating"
          value={reviewTotals.average.toFixed(1)}
          icon={Star}
          tone="amber"
          delta={reviewTotals.weekDelta}
          deltaLabel="vs last week"
        />
        <StatCard
          label="Total Reviews"
          value={formatNumber(reviewTotals.count)}
          icon={Users}
          tone="blue"
          hint="Since you joined Reditoe"
        />
        <StatCard
          label="Awaiting Reply"
          value={formatNumber(unanswered)}
          icon={MessageSquare}
          tone={unanswered > 0 ? "amber" : "green"}
          hint={unanswered > 0 ? "Reply to keep customers happy" : "All caught up"}
        />
        <StatCard
          label="3 Stars or Below"
          value={formatNumber(low)}
          icon={MessageSquareWarning}
          tone={low > 0 ? "red" : "green"}
          hint={low > 0 ? "Worth reading today" : "Nothing to worry about"}
        />
      </StatGrid>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        {/* Distribution tells you whether a 4.7 is "consistently good" or
            "mostly fives with a few disasters" — a very different problem. */}
        <Panel title="Rating Breakdown" className="self-start">
          <div className="text-center">
            <p className="flex items-baseline justify-center gap-1">
              <span data-numeric className="text-4xl font-bold tracking-tight">
                {reviewTotals.average.toFixed(1)}
              </span>
              <Star className="size-6 fill-amber-400 text-amber-400" />
            </p>
            <Stars
              value={Math.round(reviewTotals.average)}
              className="mt-2 justify-center"
            />
            <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
              Based on {formatNumber(ratingTotal)} ratings
            </p>
          </div>

          <ul className="mt-4 space-y-2">
            {ratingDistribution.map((row) => {
              const share = (row.count / ratingTotal) * 100;
              return (
                <li key={row.star} className="flex items-center gap-2">
                  <span className="flex w-7 shrink-0 items-center gap-0.5 text-[0.75rem] tabular-nums">
                    {row.star}
                    <Star className="size-2.5 fill-amber-400 text-amber-400" />
                  </span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        row.star >= 4
                          ? "bg-emerald-500"
                          : row.star === 3
                            ? "bg-amber-500"
                            : "bg-red-500"
                      )}
                      style={{ width: `${Math.max(share, 2)}%` }}
                    />
                  </span>
                  <span
                    data-numeric
                    className="w-16 shrink-0 text-right text-[0.75rem] text-muted-foreground"
                  >
                    {row.count} ({Math.round(share)}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="min-w-0">
          <div className="surface">
            <UnderlineTabs
              className="px-4"
              value={tab}
              onChange={(value) => setTab(value as typeof tab)}
              options={[
                { label: "All Reviews", value: "all", count: reviews.length },
                { label: "Awaiting Reply", value: "unanswered", count: unanswered },
                { label: "Low Ratings", value: "low", count: low },
              ]}
            />
            <div className="space-y-3 p-4">
              {visible.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="Nothing here"
                  description="No reviews match this filter."
                />
              ) : (
                visible.map((review) => (
                  <ReviewCard key={review.id} review={review} onReply={reply} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <PromoBanner
        className="mt-4"
        icon={ThumbsUp}
        tone="green"
        title="Replies turn a bad review around"
        description="Restaurants that answer every review within a day hold a rating around 0.3 stars higher."
        actions={
          <Button
            variant="outline"
            onClick={() => setTab("unanswered")}
            disabled={unanswered === 0}
          >
            Reply to {unanswered} review{unanswered === 1 ? "" : "s"}
          </Button>
        }
      />
    </>
  );
}
