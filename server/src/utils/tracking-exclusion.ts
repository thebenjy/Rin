import { setCookie } from "hono/cookie";
import type { AppContext } from "../core/hono-types";

// Shared with glp1mealplannerwebsiteandservice's `exclude-staff-from-site-tracking`
// change: name/domain/attributes must match byte-for-byte across both repos.
export function setTrackingExclusionCookie(c: AppContext) {
    setCookie(c, "fs_internal_notrack", "1", {
        domain: ".food-signals.com",
        path: "/",
        secure: true,
        sameSite: "Lax",
        maxAge: 15552000,
    });
}
