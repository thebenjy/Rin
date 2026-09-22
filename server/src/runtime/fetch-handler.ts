import { getApp } from "./app-instance";
import { buildHeadInjection } from "./seo-meta";
import { buildIndexBodyInjection } from "./index-fragment";
import { shouldHideUnpublishedPost } from "./post-visibility";

const ROOT_FEED_PATTERN = /^\/(rss\.xml|atom\.xml|rss\.json|feed\.json|feed\.xml|sitemap\.xml)$/;
const APP_PUBLIC_ROUTE_PATTERN = /^\/(favicon|favicon\.ico)(?:\/|$)/;

function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/");
}

function rewriteApiRequest(request: Request) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  return new Request(url, request);
}

function isRootFeedRequest(pathname: string) {
  return ROOT_FEED_PATTERN.test(pathname);
}

function isAppPublicRoute(pathname: string) {
  return APP_PUBLIC_ROUTE_PATTERN.test(pathname);
}

function isStaticAssetRequest(pathname: string) {
  return /\.\w+$/.test(pathname);
}

async function tryServeAsset(request: Request, env: Env) {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 200 || (asset.status >= 300 && asset.status < 400)) {
      return asset;
    }
  } catch {}

  return null;
}

async function serveSpaEntry(request: Request, env: Env) {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const url = new URL(request.url);
    const indexRequest = new Request(new URL("/", url.origin), request);
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    if (indexResponse.status === 200 || (indexResponse.status >= 300 && indexResponse.status < 400)) {
      return injectSeoHead(indexResponse, request, env);
    }
  } catch {}

  return null;
}

async function injectSeoHead(response: Response, request: Request, env: Env) {
  if (response.status !== 200) {
    return response;
  }

  try {
    const [headMarkup, bodyMarkup] = await Promise.all([
      buildHeadInjection(request, env),
      buildIndexBodyInjection(request, env),
    ]);

    if (!headMarkup && !bodyMarkup) {
      return response;
    }

    const html = await response.text();
    let injected = headMarkup ? html.replace("</head>", `${headMarkup}</head>`) : html;

    // No-op if the shell ever stops emitting this exact string (a build change could
    // alter it) rather than corrupting the document.
    if (bodyMarkup) {
      injected = injected.replace(
        '<div id="root"></div>',
        `<div id="root">${bodyMarkup}</div>`,
      );
    }

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    return new Response(injected, { status: response.status, headers });
  } catch {
    return response;
  }
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (isRootFeedRequest(pathname)) {
    return getApp().fetch(request, env);
  }

  if (isApiRequest(pathname)) {
    return getApp().fetch(rewriteApiRequest(request), env);
  }

  if (isAppPublicRoute(pathname)) {
    return getApp().fetch(request, env);
  }

  if (isStaticAssetRequest(pathname)) {
    const asset = await tryServeAsset(request, env);
    if (asset) {
      return asset;
    }
  }

  // Unpublished posts still render the SPA shell (so the app shows its own not-found
  // page) but answer 404, and the shell carries none of the draft's text. Staff with a
  // valid session keep preview access.
  const hideUnpublished = await shouldHideUnpublishedPost(request, env);

  const indexResponse = await serveSpaEntry(request, env);
  if (indexResponse) {
    if (hideUnpublished) {
      return new Response(indexResponse.body, {
        status: 404,
        headers: indexResponse.headers,
      });
    }
    return indexResponse;
  }

  return new Response("Hi", { status: 200 });
}
