"use client";

import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BUY_ME_COFFEE_URL } from "@/lib/site-links";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

interface DonationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: UiLanguage;
}

export function DonationDialog({ open, onOpenChange, lang }: DonationDialogProps) {
  const strings = getUiStrings(lang);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HeartHandshake className="size-5" />
          </div>
          <DialogTitle>{strings.donationDialogTitle}</DialogTitle>
          <DialogDescription>{strings.donationDialogDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {strings.donationLater}
          </Button>
          <Button
            render={<a href={BUY_ME_COFFEE_URL} target="_blank" rel="noopener noreferrer" />}
            onClick={() => onOpenChange(false)}
          >
            {strings.donationDonateNow}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
