import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";
import { env } from "./config/env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, "../../client/dist");

export function createApp() {
  const app = express();

  // credentials: the session lives in an httpOnly cookie, not in a header.
  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api", routes);

  // Single-origin mode: once the client is built, serve it from this same server
  // so the whole app lives on http://localhost:<PORT> with no CORS in play.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));

    // SPA fallback — any non-API GET hands back index.html for React Router.
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
  app.use((error, _req, res, _next) => {
    const status = error.status ?? 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: error.message ?? "Internal server error" });
  });

  return app;
}
