"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiError, api } from "@/lib/api";
import { startSharing, stopSharing } from "@/lib/location-share";
import { startDutyLocation, stopDutyLocation } from "@/lib/duty-location";
import {
  toDocuments,
  toEarningsBreakup,
  toEarningsSeries,
  toEarningsTotals,
  toPayoutTotals,
  toPayouts,
  toRecentScans,
  toTransactions,
  type Payout as LivePayout,
  type RiderDocument as LiveDocument,
} from "@/lib/adapt";
import { useSession } from "@/lib/session";
import type { PhotoKey } from "@/lib/images";
import type { TripStage } from "@/lib/theme";

/**
 * Rider state.
 *
 * The figures, names and order ids are the ones printed on the client's
 * reference screens, so the app reads as the reference does rather than as
 * placeholder data wearing its layout. Every screen reads through this
 * provider, so pointing the app at the live API is a change to this file
 * alone.
 */

/* ── Types ──────────────────────────────────────────────────────────────── */

export type { TripStage };

export interface Order {
  id: string;
  stage: TripStage;
  restaurant: { name: string; address: string; phone: string };
  customer: { name: string; address: string; phone: string };
  photo: PhotoKey;
  /** What the customer is paying for the food. */
  amount: number;
  /** What the rider earns for the trip. */
  payout: number;
  payment: "COD" | "Online Paid";
  /** The reference prints "COD — Not Allowed" on prepaid orders. */
  codAllowed: boolean;
  distanceKm: number;
  minutes: number;
  placedAt: string;
  deliveredAt?: string;
  /** Handed over against this code — the customer reads it out. */
  dropCode: string;
}

/**
 * Each stage maps to exactly one button, so there is never a question of what
 * to tap next.
 */
export const NEXT_STAGE: Partial<Record<TripStage, { to: TripStage; label: string }>> = {
  offered: { to: "accepted", label: "Accept Order" },
  accepted: { to: "at_restaurant", label: "Reached Restaurant" },
  at_restaurant: { to: "picked_up", label: "Picked Up Order" },
  // The order is already "on the way" the moment the pickup is verified, so
  // this button is the rider saying they have arrived, not that they have set off.
  picked_up: { to: "at_customer", label: "Reached Location" },
  at_customer: { to: "delivered", label: "Confirm Delivery" },
};

/** Which end of the trip the rider is working — drives the map/contact card. */
export function legFor(stage: TripStage): "pickup" | "drop" | "done" {
  if (stage === "offered" || stage === "accepted" || stage === "at_restaurant") return "pickup";
  if (stage === "delivered" || stage === "cancelled") return "done";
  return "drop";
}

/* ── Rider ──────────────────────────────────────────────────────────────── */

/**
 * The shape of a rider, and nothing more.
 *
 * This was a fully populated fictional partner — name, date of birth, home
 * address, emergency contact, vehicle registration and bank account. Every
 * field the API did not supply fell through to his, so a real rider opening
 * Personal Information or Payout Summary read a stranger's details as their
 * own, bank account included. That is the reported fault.
 *
 * It is empty now. A field with no answer stays empty and the screens say so.
 * Keeping the keys means the type still describes a rider; keeping the values
 * blank means nothing can be mistaken for one.
 */
const rider = {
  name: "",
  id: "",
  tier: "Delivery Partner",
  verified: false,
  rating: 0,
  totalOrders: 0,
  appVersion: "1.0.0",
  personal: {
    dob: "",
    gender: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    nationality: "",
    bloodGroup: "",
  },
  emergency: { name: "", phone: "", relation: "" },
  account: { joined: "", status: "Active" },
  vehicle: { type: "", model: "", number: "", insurance: "" },
  bank: { name: "", accountMasked: "", ifsc: "", holder: "", type: "" },
};

/** The four-figure performance strip the reference repeats on Home and Profile. */
export const performance = [
  { icon: "checkmark-circle" as const, tint: "green" as const, value: "92%", label: "Acceptance Rate", note: "Good" },
  { icon: "time" as const, tint: "blue" as const, value: "98%", label: "On-time Delivery", note: "Excellent" },
  { icon: "star" as const, tint: "amber" as const, value: "4.8", label: "Customer Rating", note: "Excellent" },
  { icon: "shield-checkmark" as const, tint: "violet" as const, value: "0", label: "Cancellation", note: "Excellent" },
];

/* ── Orders ─────────────────────────────────────────────────────────────── */

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const seedOrders: Order[] = [
  {
    id: "RDT789456",
    stage: "offered",
    restaurant: {
      name: "Punjabi Tadka",
      address: "Tirupati Railway Station, Tirupati",
      phone: "+91 87700 41122",
    },
    customer: {
      name: "Ramesh Kumar",
      address: "Leela Mahal Circle, Tirupati",
      phone: "+91 98765 43210",
    },
    photo: "burger",
    amount: 245,
    payout: 62,
    payment: "COD",
    codAllowed: false,
    distanceKm: 2.6,
    minutes: 18,
    placedAt: minutesAgo(2),
    dropCode: "4417",
  },
  {
    id: "RDT789123",
    stage: "picked_up",
    restaurant: {
      name: "Domino's Pizza",
      address: "Renigunta Road, Tirupati",
      phone: "+91 87700 22331",
    },
    customer: {
      name: "Anitha Reddy",
      address: "Leela Mahal Circle, Tirupati",
      phone: "+91 99887 66554",
    },
    photo: "noodles",
    amount: 356,
    payout: 74,
    payment: "Online Paid",
    codAllowed: false,
    distanceKm: 3.5,
    minutes: 22,
    placedAt: minutesAgo(20),
    dropCode: "8290",
  },
  {
    id: "RDT788987",
    stage: "at_customer",
    restaurant: {
      name: "Paradise Biryani",
      address: "Korramenugunta, Tirupati",
      phone: "+91 87700 55667",
    },
    customer: {
      name: "Karthik Pillai",
      address: "Kapila Theertham Road, Tirupati",
      phone: "+91 90000 12345",
    },
    photo: "biryani",
    amount: 475,
    payout: 88,
    payment: "Online Paid",
    codAllowed: false,
    distanceKm: 4.1,
    minutes: 28,
    placedAt: minutesAgo(10),
    dropCode: "5521",
  },
];

const seedHistory: Order[] = [
  {
    id: "RDT788501",
    stage: "delivered",
    restaurant: {
      name: "Hotel Saravana Bhavan",
      address: "Gandhi Road, Tirupati",
      phone: "",
    },
    customer: { name: "Divya Menon", address: "Air Bypass Road, Tirupati", phone: "" },
    photo: "idli",
    amount: 198,
    payout: 52,
    payment: "Online Paid",
    codAllowed: false,
    distanceKm: 2.2,
    minutes: 15,
    placedAt: minutesAgo(120),
    deliveredAt: minutesAgo(95),
    dropCode: "0000",
  },
  {
    id: "RDT788423",
    stage: "delivered",
    restaurant: { name: "Hotel Spicy Bites", address: "Kapila Theertham Road", phone: "" },
    customer: { name: "Suresh Babu", address: "Korramenugunta, Tirupati", phone: "" },
    photo: "curryBread",
    amount: 412,
    payout: 78,
    payment: "COD",
    codAllowed: true,
    distanceKm: 3.8,
    minutes: 24,
    placedAt: minutesAgo(180),
    deliveredAt: minutesAgo(152),
    dropCode: "0000",
  },
  {
    id: "RDT788310",
    stage: "delivered",
    restaurant: { name: "Hotel Biryani House", address: "Renigunta Road, Tirupati", phone: "" },
    customer: { name: "Lakshmi Devi", address: "Leela Mahal Circle, Tirupati", phone: "" },
    photo: "thali",
    amount: 289,
    payout: 58,
    payment: "Online Paid",
    codAllowed: false,
    distanceKm: 2.9,
    minutes: 19,
    placedAt: minutesAgo(240),
    deliveredAt: minutesAgo(214),
    dropCode: "0000",
  },
];

/* ── Money ──────────────────────────────────────────────────────────────── */

/** The figures the reference's green banner and Earnings screen print. */
export const wallet = {
  balance: 1250,
  today: { amount: 1250, orders: 4 },
  week: { amount: 4750, orders: 18 },
  month: { amount: 12450, orders: 52 },
  incentivesTotal: 850,
  onlineHours: "3h 15m",
  distanceKm: 18.2,
  totalTrips: 0,
  acceptanceRatio: null as number | null,
};

/**
 * The shape of the bonus strip on the dashboard.
 *
 * These figures used to be hard-coded - four of ten orders done, 200 to win -
 * so a rider who had never made a delivery was told on their first morning
 * that they were six orders from a bonus. It comes from the server now, and
 * the strip does not appear at all when there is no incentive running.
 */
export interface Incentive {
  done: number;
  target: number;
  bonus: number;
  title?: string;
}

export const earningsBreakup = [
  { label: "Order Earnings", amount: 10500, share: 84.3, color: "#0f8a3c" },
  { label: "Incentives", amount: 1250, share: 10.0, color: "#2563eb" },
  { label: "Tips", amount: 400, share: 3.2, color: "#f59e0b" },
  { label: "Other Earnings", amount: 300, share: 2.5, color: "#7c3aed" },
];

export const earningsTotals = {
  total: 12450,
  orders: 10500,
  incentives: 1250,
  other: 700,
  lastMonth: 9870,
};

/**
 * 1 May → 31 May, the series drawn on the Earnings overview chart.
 *
 * The reference prints a tick every five days. Seven "31 May"-width labels do
 * not fit the chart's share of a phone, so every second one is left blank —
 * the reading is still plotted and marked, it just goes unlabelled.
 */
export const earningsSeries = [
  { label: "1 May", value: 2600 },
  { label: "", value: 3450 },
  { label: "", value: 3400 },
  { label: "", value: 3500 },
  { label: "11 May", value: 4400 },
  { label: "", value: 3450 },
  { label: "", value: 4200 },
  { label: "", value: 4200 },
  { label: "21 May", value: 6200 },
  { label: "", value: 4800 },
  { label: "", value: 5400 },
  { label: "", value: 5900 },
  { label: "31 May", value: 6800 },
];

export const transactions = [
  {
    id: "ORD788945",
    title: "Order #ORD788945",
    kind: "Order Earnings",
    at: "27 May 2024, 08:45 PM",
    amount: 148,
    status: "Credited",
    icon: "bag-handle" as const,
    tint: "green" as const,
  },
  {
    id: "INC-2210",
    title: "Incentive - Peak Bonus",
    kind: "Incentive",
    at: "26 May 2024, 09:30 PM",
    amount: 120,
    status: "Credited",
    icon: "gift" as const,
    tint: "amber" as const,
  },
  {
    id: "TIP-1180",
    title: "Customer Tip",
    kind: "Tip",
    at: "26 May 2024, 08:10 PM",
    amount: 35,
    status: "Credited",
    icon: "cash" as const,
    tint: "violet" as const,
  },
  {
    id: "PN1234561234",
    title: "Payout to Bank",
    kind: "Payout",
    at: "25 May 2024, 11:45 AM",
    amount: -3500,
    status: "Debited",
    icon: "card" as const,
    tint: "blue" as const,
  },
];

export interface Payout {
  id: string;
  amount: number;
  at: string;
  status: "Processing" | "Success" | "Failed";
  reference: string;
  method: string;
  batch: string;
  remarks: string;
  expected: string;
  expectedDay: string;
  initiatedAt: string;
  processingAt: string;
  breakdown: { label: string; amount: number; icon: string; tint: string }[];
  charges: number;
}

const payoutBreakdown = [
  { label: "Order Earnings", amount: 2850, icon: "bag-handle", tint: "green" },
  { label: "Incentives", amount: 300, icon: "gift", tint: "amber" },
  { label: "Tips", amount: 150, icon: "cash", tint: "violet" },
  { label: "Other Earnings", amount: 50, icon: "wallet", tint: "blue" },
];

export const payouts: Payout[] = [
  {
    id: "PN1234567890",
    amount: 3250,
    at: "01 Jun 2024, 09:15 AM",
    status: "Processing",
    reference: "REF87654321",
    method: "NEFT",
    batch: "BATCH01062024",
    remarks: "Weekly Payout",
    expected: "01 Jun 2024",
    expectedDay: "Sunday",
    initiatedAt: "01 Jun 2024, 09:15 AM",
    processingAt: "01 Jun 2024, 09:20 AM",
    breakdown: payoutBreakdown,
    charges: 100,
  },
  {
    id: "PN1234561234",
    amount: 5780,
    at: "25 May 2024, 11:45 AM",
    status: "Success",
    reference: "REF87654210",
    method: "NEFT",
    batch: "BATCH25052024",
    remarks: "Weekly Payout",
    expected: "25 May 2024",
    expectedDay: "Saturday",
    initiatedAt: "25 May 2024, 11:45 AM",
    processingAt: "25 May 2024, 11:52 AM",
    breakdown: payoutBreakdown,
    charges: 100,
  },
  {
    id: "PN1234556677",
    amount: 4960,
    at: "18 May 2024, 10:10 AM",
    status: "Success",
    reference: "REF87653980",
    method: "NEFT",
    batch: "BATCH18052024",
    remarks: "Weekly Payout",
    expected: "18 May 2024",
    expectedDay: "Saturday",
    initiatedAt: "18 May 2024, 10:10 AM",
    processingAt: "18 May 2024, 10:16 AM",
    breakdown: payoutBreakdown,
    charges: 100,
  },
  {
    id: "PN1234551122",
    amount: 4320,
    at: "11 May 2024, 09:05 AM",
    status: "Success",
    reference: "REF87653411",
    method: "NEFT",
    batch: "BATCH11052024",
    remarks: "Weekly Payout",
    expected: "11 May 2024",
    expectedDay: "Saturday",
    initiatedAt: "11 May 2024, 09:05 AM",
    processingAt: "11 May 2024, 09:12 AM",
    breakdown: payoutBreakdown,
    charges: 100,
  },
  {
    id: "PN1234547788",
    amount: 4250,
    at: "04 May 2024, 08:40 AM",
    status: "Failed",
    reference: "REF87652980",
    method: "NEFT",
    batch: "BATCH04052024",
    remarks: "Weekly Payout",
    expected: "04 May 2024",
    expectedDay: "Saturday",
    initiatedAt: "04 May 2024, 08:40 AM",
    processingAt: "04 May 2024, 08:47 AM",
    breakdown: payoutBreakdown,
    charges: 100,
  },
  {
    id: "PN1234541122",
    amount: 4750,
    at: "27 Apr 2024, 11:20 AM",
    status: "Success",
    reference: "REF87651122",
    method: "NEFT",
    batch: "BATCH27042024",
    remarks: "Weekly Payout",
    expected: "27 Apr 2024",
    expectedDay: "Saturday",
    initiatedAt: "27 Apr 2024, 11:20 AM",
    processingAt: "27 Apr 2024, 11:28 AM",
    breakdown: payoutBreakdown,
    charges: 100,
  },
];

export const payoutTotals = {
  total: 48750,
  success: 46250,
  processing: 3250,
  failed: 1250,
};

/* ── Documents ──────────────────────────────────────────────────────────── */

export interface RiderDocument {
  id: string;
  title: string;
  purpose: string;
  status: "Verified" | "Pending" | "Expired";
  expiry: string;
  number: string;
  verifiedOn: string;
  icon: string;
  tint: string;
}

export const documents: RiderDocument[] = [
  {
    id: "aadhaar",
    title: "Aadhaar Card",
    purpose: "Government ID Proof",
    status: "Verified",
    expiry: "–",
    number: "XXXX XXXX 5678",
    verifiedOn: "12 Apr 2024, 10:32 AM",
    icon: "id-card",
    tint: "violet",
  },
  {
    id: "pan",
    title: "PAN Card",
    purpose: "Permanent Account Number",
    status: "Verified",
    expiry: "–",
    number: "ABCDE1234F",
    verifiedOn: "12 Apr 2024, 10:41 AM",
    icon: "person",
    tint: "blue",
  },
  {
    id: "licence",
    title: "Driving License",
    purpose: "Driving License (Two Wheeler)",
    status: "Verified",
    expiry: "16 May 2028",
    number: "TN02 20200012345",
    verifiedOn: "12 Apr 2024, 10:55 AM",
    icon: "car-sport",
    tint: "amber",
  },
  {
    id: "rc",
    title: "Vehicle Registration (RC)",
    purpose: "Registration Certificate",
    status: "Verified",
    expiry: "10 Aug 2028",
    number: "AP 03 BX 4417",
    verifiedOn: "12 Apr 2024, 11:04 AM",
    icon: "bicycle",
    tint: "red",
  },
  {
    id: "insurance",
    title: "Vehicle Insurance",
    purpose: "Insurance Certificate",
    status: "Verified",
    expiry: "09 Aug 2025",
    number: "INS-77120054",
    verifiedOn: "12 Apr 2024, 11:12 AM",
    icon: "shield-checkmark",
    tint: "orange",
  },
  {
    id: "puc",
    title: "Pollution Under Control (PUC)",
    purpose: "PUC Certificate",
    status: "Verified",
    expiry: "15 Jul 2025",
    number: "PUC-20240715",
    verifiedOn: "12 Apr 2024, 11:18 AM",
    icon: "document-text",
    tint: "teal",
  },
  {
    id: "passbook",
    title: "Bank Passbook / Cancelled Cheque",
    purpose: "Bank Account Proof",
    status: "Verified",
    expiry: "–",
    number: "••••• 5678",
    verifiedOn: "12 Apr 2024, 11:26 AM",
    icon: "business",
    tint: "slate",
  },
  {
    id: "photo",
    title: "Partner Profile Photo",
    purpose: "Profile Photo",
    status: "Verified",
    expiry: "Updated: 12 Apr 2024",
    number: "—",
    verifiedOn: "12 Apr 2024, 11:30 AM",
    icon: "camera",
    tint: "violet",
  },
];

/* ── Scan ───────────────────────────────────────────────────────────────── */

export const recentScans = [
  {
    id: "1",
    title: "Order Picked Up",
    who: "Hotel Spicy Bites",
    at: "28 May 2024, 08:45 PM",
    kind: "Pickup",
    tone: "ok" as const,
    order: "#ORD788945",
    icon: "bag-handle" as const,
    tint: "green" as const,
  },
  {
    id: "2",
    title: "Order Delivered",
    who: "Ramesh Kumar",
    at: "28 May 2024, 09:12 PM",
    kind: "Delivery",
    tone: "ok" as const,
    order: "#ORD788945",
    icon: "person" as const,
    tint: "blue" as const,
  },
  {
    id: "3",
    title: "Reached Restaurant",
    who: "Hotel Biryani House",
    at: "28 May 2024, 08:25 PM",
    kind: "Restaurant",
    tone: "warn" as const,
    order: "#ORD788123",
    icon: "storefront" as const,
    tint: "orange" as const,
  },
];

export const scanSummary = {
  date: "28 May 2024",
  cells: [
    { icon: "qr-code" as const, tint: "green" as const, value: "12", label: "Scans" },
    { icon: "bag-handle" as const, tint: "blue" as const, value: "5", label: "Pickups" },
    { icon: "checkmark-circle" as const, tint: "green" as const, value: "5", label: "Deliveries" },
    { icon: "storefront" as const, tint: "orange" as const, value: "2", label: "Restaurant Reached" },
  ],
};

/* ── Context ────────────────────────────────────────────────────────────── */

/**
 * Everything above is display data for the parts of the app the backend has no
 * records for yet. Everything below is live: identity, duty state, orders and
 * money come from `/api/rider/*`, and the fixtures act only as the shape those
 * responses are mapped onto.
 */

/**
 * Addresses come back either as a string or as a document with street/city/
 * state/zip and coordinates. The cards render a single line, and handing React
 * the object form crashes the screen, so flatten it here.
 */
function toAddress(value: any): string {
  if (!value) return "—";
  if (typeof value === "string") return value;

  const parts = [value.street, value.area, value.landmark, value.city, value.state]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part: string) => part.trim());

  if (parts.length === 0) return typeof value.formatted === "string" ? value.formatted : "—";
  return parts.join(", ");
}

/** Backend order → the shape the cards render. Defensive: field names vary. */
function toOrder(raw: any): Order {
  const pick = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null);

  const backendStage = String(
    pick(raw?.riderStatus, raw?.deliveryStatus, raw?.status, "offered")
  ).toLowerCase();

  const stage: TripStage = backendStage.includes("cancel")
    ? "cancelled"
    : backendStage.includes("deliver") && !backendStage.includes("out")
      ? "delivered"
      : backendStage.includes("out") || backendStage.includes("way")
        ? "at_customer"
        : backendStage.includes("pick")
          ? "picked_up"
          : backendStage.includes("arriv") || backendStage.includes("restaurant")
            ? "at_restaurant"
            : backendStage.includes("accept")
              ? "accepted"
              : "offered";

  const restaurant = pick(raw?.restaurant, raw?.vendor, {}) ?? {};
  const customer = pick(raw?.customer, raw?.user, {}) ?? {};
  const paymentMethod = String(pick(raw?.paymentMethod, "")).toUpperCase();
  const isCod = paymentMethod.includes("COD") || paymentMethod.includes("CASH");

  return {
    id: String(pick(raw?.orderNumber, raw?.orderId, raw?._id, raw?.id, "—")),
    stage,
    restaurant: {
      name: pick(restaurant?.name, restaurant?.restaurantName, "Restaurant"),
      address: toAddress(pick(restaurant?.address, raw?.pickupAddress)),
      phone: pick(restaurant?.phone, restaurant?.contactNumber, "") ?? "",
    },
    customer: {
      name: pick(customer?.name, raw?.customerName, "Customer"),
      address: toAddress(pick(raw?.deliveryAddress, customer?.address)),
      phone: pick(customer?.phone, raw?.customerPhone, "") ?? "",
    },
    photo: "biryani",
    amount: Number(pick(raw?.totalAmount, raw?.orderValue, raw?.total, 0)) || 0,
    payout: Number(pick(raw?.riderEarning, raw?.deliveryFee, raw?.riderPayout, 0)) || 0,
    payment: isCod ? "COD" : "Online Paid",
    codAllowed: isCod,
    distanceKm: Number(pick(raw?.distanceKm, raw?.distance, 0)) || 0,
    minutes: Number(pick(raw?.etaMinutes, raw?.estimatedTime, 0)) || 0,
    placedAt: pick(raw?.createdAt, raw?.placedAt, new Date().toISOString()),
    deliveredAt: pick(raw?.deliveredAt, undefined),
    dropCode: String(pick(raw?.otp, raw?.deliveryCode, "----")),
  };
}

const hoursLabel = (hours: number) => {
  const whole = Math.floor(hours);
  return `${whole}h ${Math.round((hours - whole) * 60)}m`;
};

export type Rider = typeof rider;
export type Wallet = typeof wallet;
export type Performance = typeof performance;

interface StoreValue {
  /** False until the first load settles, so screens can hold their shape. */
  ready: boolean;
  /** Set when the API could not be reached. */
  error: string | null;
  refresh: () => Promise<void>;

  online: boolean;
  setOnline: (on: boolean) => void;
  orders: Order[];
  history: Order[];
  advance: (id: string, stage: TripStage) => void;
  reject: (id: string) => void;
  rider: Rider;
  wallet: Wallet;
  /** The running bonus, or null when there is none. */
  incentive: Incentive | null;
  performance: Performance;
  /** Everything the money, document and scan screens render. */
  earningsTotals: ReturnType<typeof toEarningsTotals>;
  earningsBreakup: ReturnType<typeof toEarningsBreakup>;
  earningsSeries: ReturnType<typeof toEarningsSeries>;
  transactions: ReturnType<typeof toTransactions>;
  payouts: LivePayout[];
  payoutTotals: ReturnType<typeof toPayoutTotals>;
  documents: LiveDocument[];
  recentScans: ReturnType<typeof toRecentScans>;
  /** Unread notifications — the badge on every bell. */
  unread: number;
  /** Counts behind the Orders screen's filter chips. */
  counts: { all: number; New: number; progress: number; completed: number; cancelled: number };
  /** The run in hand: which delivery is first, second, and so on. */
  run: {
    totalStops: number;
    stops: { position: number; orderId: string; orderNumber: string; status: string }[];
  } | null;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnlineState] = useState(Boolean(user?.isOnline));
  const [run, setRun] = useState<{
    totalStops: number;
    stops: { position: number; orderId: string; orderNumber: string; status: string }[];
  } | null>(null);
  const [live, setLive] = useState<{ orders: Order[]; history: Order[] }>({
    orders: [],
    history: [],
  });
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [purse, setPurse] = useState<any>(null);
  const [money, setMoney] = useState<any>(null);
  const [chart, setChart] = useState<any>(null);
  const [payoutRows, setPayoutRows] = useState<any[]>([]);
  const [docs, setDocs] = useState<any>(null);
  const [bank, setBank] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  /** Null when no incentive is running, which is when the strip stays hidden. */
  const [incentive, setIncentive] = useState<Incentive | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;

    // One failure should not blank the whole screen, so each part is settled on
    // its own and whatever did arrive is used.
    const [
      profileRes,
      statsRes,
      walletRes,
      ordersRes,
      earningsRes,
      analyticsRes,
      withdrawalsRes,
      documentsRes,
      bankRes,
      unreadRes,
      runRes,
      incentivesRes,
    ] = await Promise.allSettled([
      api.profile(),
      api.stats(),
      api.wallet(),
      api.orders(),
      api.earnings(),
      api.analytics(),
      api.withdrawals(),
      api.documents(),
      api.bankDetails(),
      api.unreadCount(),
      api.run(),
      api.incentives(),
    ]);

    /*
     * The running incentive, if there is one. The dashboard's bonus strip
     * used hard-coded figures - four of ten orders, 200 to win - so a rider
     * who had never delivered was told they were six orders from a bonus.
     * With nothing running the strip does not appear at all.
     */
    if (incentivesRes.status === "fulfilled") {
      const rows = (incentivesRes.value as any)?.data ?? incentivesRes.value;
      const first = Array.isArray(rows) ? rows[0] : null;
      setIncentive(
        first
          ? {
              done: Number(first.progress ?? first.completed ?? 0),
              target: Number(first.target ?? first.targetOrders ?? 0),
              bonus: Number(first.reward ?? first.bonusAmount ?? 0),
              title: first.title ?? first.name,
            }
          : null
      );
    }

    if (earningsRes.status === "fulfilled") setMoney(earningsRes.value ?? null);
    if (analyticsRes.status === "fulfilled") setChart(analyticsRes.value ?? null);
    if (withdrawalsRes.status === "fulfilled")
      setPayoutRows((withdrawalsRes.value as any)?.withdrawals ?? []);
    if (documentsRes.status === "fulfilled") setDocs(documentsRes.value ?? null);
    if (bankRes.status === "fulfilled") setBank(bankRes.value ?? null);
    if (unreadRes.status === "fulfilled")
      setUnread(Number((unreadRes.value as any)?.unreadCount) || 0);

    // `/rider/profile` does not report duty state, so it must not be read from
    // here — doing so would snap the pill back to Offline on every refresh.
    // Login supplies the starting value; the toggle owns it after that.
    if (profileRes.status === "fulfilled") setProfile(profileRes.value?.profile ?? null);
    if (statsRes.status === "fulfilled") setStats(statsRes.value ?? null);
    if (walletRes.status === "fulfilled") setPurse(walletRes.value ?? null);

    /**
     * The sequence the deliveries are to be made in.
     *
     * The server owns it, because the customer on each order has already been
     * told where they sit in this run - the rider working them in a different
     * order would make that a lie.
     */
    if (runRes.status === "fulfilled") setRun(runRes.value ?? null);

    if (ordersRes.status === "fulfilled") {
      const all = (ordersRes.value?.orders ?? []).map(toOrder);
      setLive({
        orders: all.filter((o) => o.stage !== "delivered" && o.stage !== "cancelled"),
        history: all.filter((o) => o.stage === "delivered"),
      });
    }

    const offline = [profileRes, statsRes, walletRes, ordersRes].find(
      (r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.isOffline
    ) as PromiseRejectedResult | undefined;

    setError(offline ? (offline.reason as ApiError).message : null);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setReady(false);
      setOnlineState(false);
      setLive({ orders: [], history: [] });
      setProfile(null);
      setStats(null);
      setPurse(null);
      setMoney(null);
      setChart(null);
      setPayoutRows([]);
      setDocs(null);
      setBank(null);
      setUnread(0);
      return;
    }
    void refresh();
  }, [user, refresh]);

  /**
   * Keep looking for offered orders while the rider is on duty.
   *
   * Nothing polled, so an order dispatched while the app was open never
   * arrived - the rider had to close and reopen it to find out they had been
   * offered work, which is not something anyone does while riding.
   *
   * Only while online: a rider who has finished for the day should not have
   * their battery spent asking for jobs they cannot take.
   */
  useEffect(() => {
    if (!user || !online) return;
    const timer = setInterval(() => {
      void refresh();
    }, 12_000);
    return () => clearInterval(timer);
  }, [user, online, refresh]);

  /*
   * Be findable while on duty.
   *
   * Dispatch offers each order to the riders nearest the restaurant, and
   * nothing reported a position for it to measure — so every rider sat at the
   * [0,0] default and the dispatcher fell back to offering every order to
   * everyone online.
   */
  useEffect(() => {
    if (!user || !online) {
      stopDutyLocation();
      return;
    }
    void startDutyLocation();
    return () => stopDutyLocation();
  }, [user, online]);

  const setOnline = useCallback((on: boolean) => {
    setOnlineState(on); // optimistic: the pill must answer the tap immediately
    api.setDutyStatus(on).catch(() => setOnlineState(!on));
  }, []);

  const advance = useCallback(
    (id: string, stage: TripStage) => {
      setLive((current) => {
        const order = current.orders.find((o) => o.id === id);
        if (order && stage === "delivered") {
          return {
            orders: current.orders.filter((o) => o.id !== id),
            history: [
              { ...order, stage, deliveredAt: new Date().toISOString() },
              ...current.history,
            ],
          };
        }
        return {
          ...current,
          orders: current.orders.map((o) => (o.id === id ? { ...o, stage } : o)),
        };
      });

      /**
       * Share position only while the order is actually being carried.
       *
       * From accepting it to handing it over, which is exactly the window the
       * customer's map is open for. Off-shift, and between orders, nothing is
       * sent - following a rider who is not carrying anything would be a
       * tracking device rather than a delivery app.
       */
      if (stage === "delivered" || stage === "cancelled") {
        void stopSharing();
      } else {
        void startSharing(id);
      }

      /*
       * Only accepting is asserted. Delivery is proved by the customer's
       * code, and /deliver refuses an order that has not been verified — so
       * calling it here failed, the refresh put the order back in the list,
       * and "Confirm Delivered" looked like it had done nothing. Verifying
       * sets Delivered on the server already; there is nothing left to send.
       */
      const call = stage === "accepted" ? api.acceptOrder(id) : null;
      void call?.then(() => refresh()).catch(() => refresh());
    },
    [refresh]
  );

  const reject = useCallback(
    (id: string) => {
      void stopSharing();
      setLive((current) => ({
        ...current,
        orders: current.orders.filter((o) => o.id !== id),
      }));
      api
        .rejectOrder(id)
        .catch(() => {})
        .finally(() => void refresh());
    },
    [refresh]
  );

  /**
   * Who the signed-in rider actually is.
   *
   * This used to spread the display fixture and override a handful of fields,
   * so everything it did not override stayed as the fixture's: a real rider saw
   * Mohan Kumar's date of birth, home address, emergency contact, vehicle
   * number and — worst of it — his bank account, presented as their own. That
   * is the reported fault, and a rider checking where their earnings are paid
   * has to be reading their own details or none at all.
   *
   * Nothing personal falls back to the fixture now. A field the API has not
   * supplied is empty, and the screens show their own "not provided" rather
   * than somebody else's truth. Only presentation-level defaults that belong to
   * nobody — the tier label, the app version — are kept.
   */
  const mergedRider = useMemo<Rider>(() => {
    const blank = "";
    return {
      ...rider,
      name: profile?.name || user?.name || blank,
      id: profile?.riderId || user?.riderId || blank,
      rating: Number(stats?.avgRating) || 0,
      totalOrders: Number(stats?.completedTrips ?? stats?.totalTrips) || 0,
      verified: (profile?.kycStatus ?? "") === "approved",
      personal: {
        dob: profile?.dateOfBirth || blank,
        gender: profile?.gender || blank,
        phone: profile?.phone || user?.phone || blank,
        email: profile?.email || user?.email || blank,
        address: profile?.fullAddress || profile?.address || blank,
        city: profile?.city || blank,
        state: profile?.state || blank,
        nationality: blank,
        bloodGroup: profile?.bloodGroup || blank,
      },
      emergency: {
        name: profile?.emergencyContactName || blank,
        phone: profile?.emergencyContactPhone || profile?.emergencyContact || blank,
        relation: profile?.emergencyRelationship || blank,
      },
      vehicle: {
        type: profile?.vehicleType || blank,
        model: profile?.vehicleName || blank,
        number: profile?.vehicleNumber || blank,
        insurance: profile?.insuranceValidTill || blank,
      },
      account: {
        joined: profile?.createdAt
          ? new Date(profile.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : blank,
        status: profile?.isBlocked ? "Blocked" : "Active",
      },
      bank: {
        name: bank?.bankName || blank,
        accountMasked: bank?.accountNumber
          ? `••••• ${String(bank.accountNumber).slice(-4)}`
          : blank,
        ifsc: bank?.ifscCode || bank?.ifsc || blank,
        holder: bank?.accountHolderName || blank,
        type: bank?.accountType || blank,
      },
    };
  }, [profile, stats, user, bank]);

  const mergedWallet = useMemo<Wallet>(() => {
    const today = Number(purse?.todayEarnings ?? stats?.todayEarnings) || 0;
    const total = Number(purse?.totalEarnings ?? stats?.totalEarnings) || 0;
    return {
      ...wallet,
      balance: Number(purse?.currentBalance) || 0,
      today: { amount: today, orders: Number(stats?.completedTrips) || 0 },
      week: { amount: total, orders: Number(stats?.totalTrips) || 0 },
      month: { amount: total, orders: Number(stats?.totalTrips) || 0 },
      incentivesTotal: Number(stats?.referralEarnings) || 0,
      onlineHours: hoursLabel(Number(stats?.onlineHours) || 0),
      distanceKm: Number(stats?.totalDistanceKm ?? stats?.distanceKm) || 0,
      /*
       * Trips done, and how many offers were taken.
       *
       * The ratio is null rather than 0 until an offer has actually been
       * made: a rider who has been shown nothing has not turned anything
       * down, and printing "0%" beside their name on their first morning
       * reads as a mark against them.
       */
      totalTrips: Number(stats?.totalTrips) || 0,
      acceptanceRatio:
        Number(stats?.offeredTrips) > 0
          ? Math.round(
              (Number(stats?.acceptedTrips ?? stats?.totalTrips) /
                Number(stats?.offeredTrips)) *
                100
            )
          : (stats?.acceptanceRate ?? null),
    };
  }, [purse, stats]);

  const mergedPerformance = useMemo<Performance>(() => {
    const pct = (n: unknown) => `${Math.round(Number(n) || 0)}%`;
    /*
     * A rider the server knows nothing about yet has no performance, rather
     * than the sample's 92% acceptance and 4.8 rating - figures a new rider
     * had not earned and could not have.
     */
    if (!stats) {
      return [
        { ...performance[0], value: "—", note: "No deliveries yet" },
        { ...performance[1], value: "—", note: "No deliveries yet" },
        { ...performance[2], value: "—", note: "Not rated yet" },
        { ...performance[3], value: "0", note: "None" },
      ];
    }
    return [
      { ...performance[0], value: pct(stats.successRate), note: "Acceptance" },
      { ...performance[1], value: pct(stats.successRate), note: "On time" },
      { ...performance[2], value: Number(stats.avgRating || 0).toFixed(1), note: "Rating" },
      { ...performance[3], value: String(Number(stats.cancelledTrips) || 0), note: "Cancelled" },
    ];
  }, [stats]);

  const derived = useMemo(
    () => ({
      earningsTotals: toEarningsTotals(money?.summary),
      earningsBreakup: toEarningsBreakup(money?.summary),
      earningsSeries: toEarningsSeries(chart?.dailyChartData ?? []),
      transactions: toTransactions(money?.earnings ?? [], payoutRows),
      payouts: toPayouts(payoutRows),
      payoutTotals: toPayoutTotals(payoutRows, purse),
      documents: toDocuments(docs?.documents, String(docs?.kycStatus ?? "")),
      recentScans: toRecentScans(live.history),
      unread,
    }),
    [money, chart, payoutRows, docs, purse, live.history, unread]
  );

  const counts = useMemo(() => {
    const New = live.orders.filter((o) => o.stage === "offered").length;
    const progress = live.orders.length - New;
    const completed = live.history.length;
    return { all: New + progress + completed, New, progress, completed, cancelled: 0 };
  }, [live]);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      error,
      refresh,
      online,
      setOnline,
      orders: live.orders,
      history: live.history,
      advance,
      reject,
      rider: mergedRider,
      wallet: mergedWallet,
      incentive,
      performance: mergedPerformance,
      counts,
      run,
      ...derived,
    }),
    [
      ready,
      error,
      refresh,
      online,
      setOnline,
      live,
      advance,
      reject,
      mergedRider,
      mergedWallet,
      mergedPerformance,
      counts,
      run,
      derived,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
