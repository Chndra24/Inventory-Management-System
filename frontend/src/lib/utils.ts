import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Helper gaya shadcn UI: gabung class Tailwind dengan aman (C1) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Ekstrak pesan error dari respons API (array atau string) menjadi satu string. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const msg =
    (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message ?? fallback;
  return Array.isArray(msg) ? msg.join(', ') : String(msg);
}
