'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Ya, Hapus',
  cancelLabel = 'Batal',
  variant = 'destructive',
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' = dialog hapus (merah + segitiga); 'primary' = dialog workflow/aksi rutin (biru + tanda tanya) */
  variant?: 'destructive' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
}) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl data-[state=open]:animate-fade-in">
        <div className="flex items-start gap-4">
          <div
            className={
              variant === 'primary'
                ? 'p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-lg'
                : 'p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg'
            }
          >
            {variant === 'primary' ? (
              <HelpCircle className="w-6 h-6 text-sky-400" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-red-400" />
            )}
          </div>
          <div className="flex-1">
            <DialogPrimitive.Title className="text-lg font-semibold text-white">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-slate-400">
              {description}
            </DialogPrimitive.Description>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <DialogPrimitive.Close asChild>
            <Button variant="secondary" disabled={loading}>
              {cancelLabel}
            </Button>
          </DialogPrimitive.Close>
          <Button
            variant={variant === 'primary' ? 'default' : 'destructive'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </Button>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export { ConfirmDialog };
