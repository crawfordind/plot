"use client";

import BottomSheet from "@/components/ui/BottomSheet";

type SheetProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function Sheet({ title, subtitle, onClose, children, footer }: SheetProps) {
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
    >
      {children}
    </BottomSheet>
  );
}
