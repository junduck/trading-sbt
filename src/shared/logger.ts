import pino from "pino";

/**
 * Application logger instance.
 * Configured with sensible defaults for server logging.
 */
export const logger =
  process.env["NODE_ENV"] !== "production"
    ? pino({
        level: process.env["LOG_LEVEL"] || "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "SYS:HH:MM:ss.l",
          },
        },
      })
    : pino({
        level: process.env["LOG_LEVEL"] || "info",
      });

export const DEBUG = process.env["DEBUG"] === "true";
