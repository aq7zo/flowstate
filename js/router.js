import { patchState } from "./state.js";

const VALID_ROUTES = new Set(["today", "focus", "calendar", "settings"]);

function getRouteFromHash() {
  const route = window.location.hash.replace("#", "").trim();
  if (!route || !VALID_ROUTES.has(route)) {
    return "today";
  }
  return route;
}

function renderRoute(route) {
  const views = document.querySelectorAll("[data-view]");
  const links = document.querySelectorAll("[data-route-link]");

  views.forEach((view) => {
    view.hidden = view.dataset.view !== route;
  });

  links.forEach((link) => {
    const current = link.getAttribute("href") === `#${route}`;
    link.dataset.active = current ? "true" : "false";
    link.setAttribute("aria-current", current ? "page" : "false");
  });
}

export function initRouter() {
  const sync = () => {
    const route = getRouteFromHash();
    renderRoute(route);
    patchState({ route });
  };

  window.addEventListener("hashchange", sync);

  if (!window.location.hash) {
    window.location.hash = "#today";
  }

  sync();
}
