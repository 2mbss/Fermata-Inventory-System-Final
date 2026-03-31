import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  if (isNaN(amount) || amount === null || amount === undefined) return '₱0.00';
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return '—';
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function safeDate(val: any): Date {
  if (!val) return new Date(0);
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date(0) : d;
}
