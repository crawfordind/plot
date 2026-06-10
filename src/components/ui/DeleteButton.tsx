"use client";

import { useState } from "react";

type DeleteButtonProps = {
  label?: string;
  confirmLabel?: string;
  onDelete: () => Promise<void>;
  disabled?: boolean;
};

export default function DeleteButton({
  label = "Delete",
  confirmLabel = "Confirm delete",
  onDelete,
  disabled,
}: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={disabled || deleting}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        confirming
          ? "bg-red-600 text-white hover:bg-red-700"
          : "border border-red-200 text-red-600 hover:bg-red-50"
      } disabled:opacity-50`}
    >
      {deleting ? "Deleting…" : confirming ? confirmLabel : label}
    </button>
  );
}
