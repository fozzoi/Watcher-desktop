"use client";

import { useEffect, useRef, useState } from "react";
import { Blocks } from "loading-dev";
import { useAuth } from "@/context/AuthContext";

const MINIMUM_DISPLAY_MS = 700;
const EXIT_ANIMATION_MS = 320;

type LoaderPhase = "loading" | "leaving" | "done";

export default function StartupLoader() {
  const { isLoading } = useAuth();
  const [phase, setPhase] = useState<LoaderPhase>("loading");
  const mountedAt = useRef<number | null>(null);

  useEffect(() => {
    mountedAt.current ??= Date.now();
    if (isLoading || phase !== "loading") return;

    const remaining = Math.max(0, MINIMUM_DISPLAY_MS - (Date.now() - mountedAt.current));
    const timer = window.setTimeout(() => setPhase("leaving"), remaining);
    return () => window.clearTimeout(timer);
  }, [isLoading, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;

    const timer = window.setTimeout(() => setPhase("done"), EXIT_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      className={`startup-loader${phase === "leaving" ? " startup-loader-leaving" : ""}`}
      role="status"
      aria-label="Loading Watcher"
      aria-live="polite"
    >
      <Blocks color="#4b5563" size={36} />
      <style jsx>{`
        .startup-loader {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: grid;
          place-items: center;
          background: #d1d5db;
          opacity: 1;
          transition: opacity ${EXIT_ANIMATION_MS}ms ease, visibility ${EXIT_ANIMATION_MS}ms ease;
          visibility: visible;
        }

        .startup-loader-leaving {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .startup-loader {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
