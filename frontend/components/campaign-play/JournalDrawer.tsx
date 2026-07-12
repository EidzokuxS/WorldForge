"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { CampaignPlayJournalEntry, CampaignPlayJournalPage } from "@worldforge/shared";

import { ConsequenceCard } from "./ConsequenceCard";

export interface JournalDrawerProps {
  open: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  loadPage: (cursor: number) => Promise<CampaignPlayJournalPage>;
  onClose: () => void;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
  ));
}

export function JournalDrawer({ open, returnFocusRef, loadPage, onClose }: JournalDrawerProps) {
  const [entries, setEntries] = useState<CampaignPlayJournalEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failedCursor, setFailedCursor] = useState<number | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (cursor: number) => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    setFailedCursor(null);
    try {
      const page = await loadPage(cursor);
      setEntries((current) => {
        if (cursor === 0) return page.entries;
        const loadedHandles = new Set(current.map((entry) => entry.observationHandle));
        return [...current, ...page.entries.filter((entry) => !loadedHandles.has(entry.observationHandle))];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setFailed(true);
      setFailedCursor(cursor);
    } finally {
      setLoading(false);
    }
  }, [loadPage, loading]);

  useEffect(() => {
    setEntries([]);
    setNextCursor(0);
    setFailed(false);
    setFailedCursor(null);
  }, [loadPage]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (entries.length === 0 && nextCursor === 0 && !loading && !failed) void load(0);
  }, [entries.length, failed, load, loading, nextCursor, open]);

  const close = () => {
    onClose();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  const loadFromControl = (cursor: number) => {
    void load(cursor).finally(() => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && drawerRef.current?.contains(active)) return;
        const nextControl = drawerRef.current?.querySelector<HTMLButtonElement>(
          ".campaign-play-journal-failure button, footer button",
        );
        (nextControl ?? closeRef.current)?.focus();
      }, 0);
    });
  };

  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || drawerRef.current === null) return;
    const focusable = focusableElements(drawerRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="campaign-play-journal-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) close();
    }}>
      <aside
        aria-labelledby="campaign-play-journal-heading"
        aria-modal="true"
        className="campaign-play-journal"
        id="campaign-play-journal"
        onKeyDown={keepFocusInside}
        ref={drawerRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="campaign-play-kicker">Earned observations</p>
            <h2 id="campaign-play-journal-heading">The journal</h2>
          </div>
          <button aria-label="Close journal" onClick={close} ref={closeRef} type="button">×</button>
        </header>
        <div className="campaign-play-journal-entries" aria-busy={loading}>
          {entries.map((entry) => (
            <article className="campaign-play-journal-entry" key={entry.observationHandle}>
              <header>
                <h3>{entry.title}</h3>
                <time>{entry.worldTimeLabel}</time>
              </header>
              <p>{entry.text}</p>
              {entry.whereOrRoute ? <small>{entry.whereOrRoute}</small> : null}
              {entry.consequence ? <ConsequenceCard consequence={entry.consequence} /> : null}
            </article>
          ))}
          {entries.length === 0 && !loading && !failed ? (
            <p className="campaign-play-journal-empty">Nothing has reached your journal yet.</p>
          ) : null}
          {failed ? (
            <div className="campaign-play-journal-failure" role="alert">
              <p>The journal could not be opened.</p>
              <button onClick={() => {
                closeRef.current?.focus();
                loadFromControl(failedCursor ?? 0);
              }} type="button">
                Try again
              </button>
            </div>
          ) : null}
          {loading ? <p aria-live="polite">Opening the journal</p> : null}
        </div>
        {nextCursor !== null && !failed ? (
          <footer>
            <button disabled={loading} onClick={() => loadFromControl(nextCursor)} type="button">
              {loading ? "Loading" : "Earlier observations"}
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

export default JournalDrawer;
