'use client';

import { Toaster as Sonner } from 'sonner';

/** Toast global (C2) - menggantikan alert() bawaan browser */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      theme="dark"
      toastOptions={{
        classNames: {
          toast: '!bg-slate-900 !border-slate-800 !text-slate-100',
          description: '!text-slate-400',
          cancelButton: '!bg-slate-800 !text-slate-300',
        },
      }}
    />
  );
}
