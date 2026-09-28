import express, { type Express } from "express";
import cors from "cors";
import multer from "multer";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api", router);

// Keep API failures machine-readable. Express otherwise returns an HTML error page
// for unmatched routes / Multer errors, which made Excel import surface as
// "Unexpected token '<' ... is not valid JSON" in the browser.
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Excel file is too large. Maximum allowed size is 15 MB."
      : `Excel upload failed: ${err.message}`;
    res.status(400).json({ error: message });
    return;
  }
  logger.error({ err }, "Unhandled API error");
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
});

export default app;
