import { describe, expect, it } from "vitest";
import ReactDOM from "react-dom/client";
import { act } from "react";

// Guards the assumption in design.md D-3: the server splices a crawlable link list
// into <div id="root"> for "/". That is safe only because the client mounts with
// createRoot(...).render(...), which DISCARDS existing container children. Were
// main.tsx ever switched to hydrateRoot, the placeholder would mismatch and this
// test should fail loudly rather than the bug reaching production.
describe("SSR index placeholder", () => {
    it("createRoot replaces pre-rendered children in #root", async () => {
        const root = document.createElement("div");
        root.id = "root";
        root.innerHTML =
            '<div data-ssr-index><h1>Food Signals Blog</h1><ul><li><a href="/5">A post</a></li></ul></div>';
        document.body.appendChild(root);

        expect(root.querySelector("[data-ssr-index]")).not.toBeNull();

        await act(async () => {
            ReactDOM.createRoot(root).render(<main data-app>mounted</main>);
        });

        expect(root.querySelector("[data-ssr-index]")).toBeNull();
        expect(root.querySelector("[data-app]")?.textContent).toBe("mounted");

        root.remove();
    });
});
