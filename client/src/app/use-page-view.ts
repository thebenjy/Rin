import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { canonicalPagePath } from "../utils/canonical-path";

// GTM fires the GA4 config tag once per document load. This app is a single-page
// shell, so opening a post from the index produced NO second pageview — measured at
// 1.23 pageviews per session over 60 days, making per-post readership invisible.
//
// This pushes an explicit pageview on route change. Deliberately NOT a GTM History
// Change trigger: container GTM-PCRD6FN9 is shared with food-signals.com, where such
// a trigger would also fire and double-count against that site's native pageviews
// (design.md D-5).

interface TrackingGlobals {
  dataLayer?: Record<string, unknown>[];
  __RIN_EXCLUDE_TRACKING__?: () => boolean;
}

/** True when this browser is staff and must not be tracked. Fails open to "track". */
function excluded(): boolean {
  const g = globalThis as unknown as TrackingGlobals;
  try {
    return g.__RIN_EXCLUDE_TRACKING__?.() === true;
  } catch {
    return false;
  }
}

export function pushPageView(pathname: string): void {
  if (excluded()) return;

  const g = globalThis as unknown as TrackingGlobals;
  if (!Array.isArray(g.dataLayer)) return;

  g.dataLayer.push({
    event: "rin_page_view",
    page_path: canonicalPagePath(pathname),
    page_location: `${window.location.origin}${canonicalPagePath(pathname)}`,
    page_title: document.title,
  });
}

export function usePageViewTracking(): void {
  const [location] = useLocation();
  // GTM's own config tag already reports the first pageview of the document; pushing
  // again here would double-count the landing page.
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    pushPageView(location);
  }, [location]);
}
