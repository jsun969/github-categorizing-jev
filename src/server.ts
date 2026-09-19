import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import api from "./server/api";

export default createServerEntry({
  fetch(request, options) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return api.fetch(request);
    }

    return handler.fetch(request, options);
  },
});
