import { Helmet } from "react-helmet";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { stripImageUrlMetadata } from "../utils/image-upload";

interface SiteMetaProps {
    title?: string;
    description?: string;
    image?: string;
    type?: "website" | "article";
    noIndex?: boolean;
}

// Renders the full <head> tag set (title, description, OG, Twitter Card) for a page.
// Rendered client-side via react-helmet; the same tags are also injected server-side
// for the initial HTML response (see server/src/runtime/seo-meta.ts) so non-JS
// crawlers see them too — this component covers in-app SPA navigations.
export function SiteMeta({ title, description, image, type = "website", noIndex }: SiteMetaProps) {
    const siteConfig = useSiteConfig();

    const pageTitle = title
        ? `${title} - ${siteConfig.name}`
        : siteConfig.name;

    const pageDescription = description || siteConfig.description;
    const pageImage = stripImageUrlMetadata(image || siteConfig.avatar);
    const pageUrl = typeof document !== "undefined" ? document.URL : undefined;

    return (
        <Helmet>
            <title>{pageTitle}</title>
            <meta name="description" content={pageDescription} />
            <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow"} />
            <meta property="og:site_name" content={siteConfig.name} />
            <meta property="og:type" content={type} />
            <meta property="og:title" content={pageTitle} />
            <meta property="og:description" content={pageDescription} />
            {pageImage && <meta property="og:image" content={pageImage} />}
            {pageUrl && <meta property="og:url" content={pageUrl} />}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={pageTitle} />
            <meta name="twitter:description" content={pageDescription} />
            {pageImage && <meta name="twitter:image" content={pageImage} />}
        </Helmet>
    );
}
