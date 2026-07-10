/**
 * Frontend Action Logger — records every user interaction, API call,
 * and state change on the review page.
 *
 * Outputs structured, timestamped JSON to the browser console.
 * Enable with LOG_LEVEL in localStorage or by calling enableLogging().
 *
 * Usage in browser console:
 *   localStorage.setItem("LOG_LEVEL", "debug")   // Enable debug logging
 *   localStorage.setItem("LOG_LEVEL", "info")    // Default level
 *   localStorage.removeItem("LOG_LEVEL")         // Disable
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

// ─── Init ─────────────────────────────────────────────────────────

export function initLogger(): void {
  const stored = typeof localStorage !== "undefined"
    ? localStorage.getItem("LOG_LEVEL")
    : null;
  if (stored && stored in LOG_LEVELS) {
    currentLevel = stored as LogLevel;
  }
  log("info", "logger", "Frontend logger initialized", { level: currentLevel });
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("LOG_LEVEL", level);
  }
}

// ─── Core log function ────────────────────────────────────────────

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function getCaller(): string {
  if (typeof window === "undefined") return "server";
  try {
    throw new Error();
  } catch (e: any) {
    const stack = e.stack?.split("\n") || [];
    // Skip the error constructor and this function, find the caller
    for (let i = 2; i < stack.length; i++) {
      const line = stack[i].trim();
      if (line && !line.includes("frontend-logger") && !line.includes("Error")) {
        const match = line.match(/at\s+(\S+)/);
        if (match) return match[1].substring(0, 60);
      }
    }
    return "unknown";
  }
}

function log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    ts: formatTimestamp(),
    level,
    module,
    msg: message,
  };
  if (data && Object.keys(data).length > 0) {
    entry.data = data;
  }

  const prefix = `[${entry.ts}] [${level.toUpperCase()}] [${module}]`;
  const style =
    level === "error" ? "color:red;font-weight:bold" :
    level === "warn" ? "color:orange;font-weight:bold" :
    level === "info" ? "color:#0891b2" :
    "color:#6b7280";

  if (data && Object.keys(data).length > 0) {
    console.log(`%c${prefix} ${message}`, style, data);
  } else {
    console.log(`%c${prefix} ${message}`, style);
  }
}

// ─── Public API ───────────────────────────────────────────────────

export const logger = {
  debug: (module: string, message: string, data?: Record<string, unknown>) =>
    log("debug", module, message, data),
  info: (module: string, message: string, data?: Record<string, unknown>) =>
    log("info", module, message, data),
  warn: (module: string, message: string, data?: Record<string, unknown>) =>
    log("warn", module, message, data),
  error: (module: string, message: string, data?: Record<string, unknown>) =>
    log("error", module, message, data),
};

// ─── Action logger (user interactions) ────────────────────────────

export function logAction(
  action: string,
  details: Record<string, unknown>
): void {
  log("info", "action", action, {
    ...details,
    url: window.location.href,
  });
}

/**
 * Wrap a click handler with action logging.
 * Usage: onClick={loggedClick("approve-image", { imageId })}
 */
export function loggedClick(
  actionName: string,
  extraDetails?: Record<string, unknown>
) {
  return (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement)?.textContent?.trim().substring(0, 40);
    logAction(actionName, {
      target,
      ...extraDetails,
    });
  };
}

// ─── Fetch interceptor ─────────────────────────────────────────────

let fetchPatched = false;

/**
 * Patch global fetch to log all API calls.
 * Call once at app startup.
 */
export function patchFetch(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;

  const originalFetch = window.fetch;
  window.fetch = async function loggedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || "GET";
    const body = init?.body;

    // Skip logging for non-API requests (static files, images, etc.)
    if (!url.includes("/api/")) {
      return originalFetch(input, init);
    }

    const startTime = performance.now();
    const logData: Record<string, unknown> = { method, url: url.substring(url.lastIndexOf("/api/")) };

    if (body && typeof body === "string") {
      try {
        logData.body = JSON.parse(body);
      } catch {
        logData.body = body.substring(0, 200);
      }
    }

    log("info", "api", `→ ${method} ${url.substring(url.lastIndexOf("/api/"))}`, logData);

    try {
      const response = await originalFetch(input, init);
      const elapsed = (performance.now() - startTime).toFixed(0);
      const status = response.status;

      // Clone to read body without consuming
      const clone = response.clone();
      let responseBody: unknown = undefined;
      try {
        responseBody = await clone.json();
      } catch {
        // non-JSON response
      }

      const level = status >= 400 ? "warn" : "info";
      log(level, "api", `← ${status} in ${elapsed}ms`, {
        status,
        elapsed: `${elapsed}ms`,
        url: url.substring(url.lastIndexOf("/api/")),
        response: responseBody ? (responseBody as Record<string, unknown>) : undefined,
      });

      return response;
    } catch (err) {
      const elapsed = (performance.now() - startTime).toFixed(0);
      log("error", "api", `✗ FAILED in ${elapsed}ms`, {
        url: url.substring(url.lastIndexOf("/api/")),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

// ─── Click tracker (global listener) ──────────────────────────────

let trackingActive = false;

/**
 * Add a global click listener that logs all clicks on interactive elements.
 * Call once at app startup.
 */
export function enableClickTracking(): void {
  if (trackingActive || typeof document === "undefined") return;
  trackingActive = true;

  document.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName?.toLowerCase();
    const text = target.textContent?.trim().substring(0, 50);
    const role = target.getAttribute("role");
    const type = target.getAttribute("type");
    const cls = target.className?.substring(0, 40);

    // Only log clicks on interactive elements
    if (
      tag === "button" ||
      tag === "a" ||
      tag === "select" ||
      tag === "input" ||
      role === "button" ||
      role === "option"
    ) {
      log("debug", "click", `${tag} "${text || ""}"`, {
        tag,
        text,
        type,
        role,
        class: cls,
      });
    }
  });
}

// ─── Auto-init ────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  initLogger();
}
