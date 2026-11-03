"use client";

// src/components/shared/QuickAddButton.tsx
// Ported from the Watcher Expo app — watchlist heart button, adapted for Next.js/web.

import React, { useCallback } from 'react';
import { Heart } from 'lucide-react';

interface QuickAddButtonProps {
  itemId?: number;
  item?: any;
  isAdded?: boolean;
  onPress?: () => void;
  /** Bare white heart with no chip — for hearts sitting directly on poster artwork. */
  plain?: boolean;
}

export default function QuickAddButton({
  itemId,
  item,
  isAdded: propIsAdded,
  onPress,
  plain = false,
}: QuickAddButtonProps) {
  const targetId = itemId ?? item?.id ?? item?.media_id;
  const numId = targetId !== undefined && targetId !== null ? Number(targetId) : undefined;

  // Read watchlist status from localStorage reactively-ish (re-read on render)
  const reactiveIsAdded = (() => {
    if (numId === undefined || isNaN(numId) || typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem('watchlist');
      if (!stored) return false;
      const list = JSON.parse(stored);
      return Array.isArray(list) && list.some((i: any) => i.id === numId);
    } catch {
      return false;
    }
  })();

  const isAdded = propIsAdded !== undefined ? propIsAdded : reactiveIsAdded;

  const handlePress = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onPress) {
        onPress();
      }
    },
    [onPress]
  );

  return (
    <button
      type="button"
      onClick={handlePress}
      className={`quick-add-btn ${plain ? 'plain' : 'chip'} ${isAdded ? 'added' : ''}`}
      aria-label={isAdded ? 'Remove from watchlist' : 'Add to watchlist'}
      aria-pressed={isAdded}
    >
      <Heart
        size={20}
        fill={isAdded ? 'var(--primary)' : 'none'}
        stroke={isAdded ? 'var(--primary)' : '#FFFFFF'}
        strokeWidth={2.4}
        className={`quick-add-icon ${isAdded ? 'filled' : 'outline'}`}
      />
    </button>
  );
}
