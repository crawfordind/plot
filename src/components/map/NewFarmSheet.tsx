"use client";

import { useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

type NewFarmSheetProps = {
  // Proceed to drawing the boundary on the map with this farm name.
  onStartDraw: (name: string) => void;
  onClose: () => void;
};

export default function NewFarmSheet({ onStartDraw, onClose }: NewFarmSheetProps) {
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onStartDraw(name.trim());
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="New farm"
      subtitle="Name it, then trace its boundary on the map."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Farm name">
          <Input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home farm, North parcel…"
          />
        </Field>
        <p className="text-xs text-stone-500">
          Next you&apos;ll tap the map to outline the farm. Everything you place
          while viewing this farm will belong to it.
        </p>
        <div className="flex gap-2 pb-safe">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-[1.6]"
            leftIcon="penDraw"
            disabled={!name.trim()}
          >
            Draw boundary
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
