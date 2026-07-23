import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browserCandidates =
  process.platform === "win32"
    ? [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ];

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue vers le prochain navigateur local connu.
    }
  }

  throw new Error("Aucun navigateur Chromium local n’a été trouvé.");
}

async function waitForDebugger(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      // Le navigateur démarre encore.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error("Le navigateur de test n’a pas démarré à temps.");
}

function createCdpClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Set();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));

    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }

    for (const listener of listeners) listener(message);
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;

      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    onMessage(listener) {
      listeners.add(listener);
    },
    close() {
      socket.close();
    },
  };
}

const browserPath = await findBrowser();
const port = 9333;
const profileDirectory = join(
  tmpdir(),
  `brainbook-smoke-${crypto.randomUUID()}`,
);
const artifactDirectory = join(process.cwd(), ".next", "smoke");
await mkdir(profileDirectory, { recursive: true });
await mkdir(artifactDirectory, { recursive: true });

const browserProcess = spawn(
  browserPath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  const debuggerUrl = await waitForDebugger(port);
  const cdp = createCdpClient(debuggerUrl);
  await cdp.ready;

  const browserErrors = [];
  cdp.onMessage((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(message.params.exceptionDetails.text);
    }
    if (
      message.method === "Log.entryAdded" &&
      message.params.entry.level === "error"
    ) {
      browserErrors.push(message.params.entry.text);
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });

  const routes = [
    { name: "library", url: "http://127.0.0.1:3000/" },
    { name: "ideas", url: "http://127.0.0.1:3000/ideas" },
    { name: "settings", url: "http://127.0.0.1:3000/settings" },
  ];
  const results = [];

  for (const route of routes) {
    await cdp.send("Page.navigate", { url: route.url });
    await new Promise((resolve) => setTimeout(resolve, 800));

    const evaluation = await cdp.send("Runtime.evaluate", {
      expression: `(async () => ({
        title: document.title,
        heading: document.querySelector("h1")?.textContent?.trim(),
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        manifest: document.querySelector('link[rel="manifest"]')?.href,
        activeNavigation: document.querySelector('[aria-current="page"]')?.textContent?.trim(),
        serviceWorker: Boolean(await navigator.serviceWorker?.getRegistration())
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    const screenshotPath = join(artifactDirectory, `${route.name}.png`);
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    results.push({
      route: route.url,
      screenshot: screenshotPath,
      ...evaluation.result.value,
    });
  }

  const offlineEvaluation = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cachedResponse = await caches.match("/offline");
      const cachedHtml = cachedResponse ? await cachedResponse.text() : "";
      return {
        registered: Boolean(registration),
        controlled: Boolean(navigator.serviceWorker.controller),
        cached: Boolean(cachedResponse),
        fallbackContentPresent: cachedHtml.includes("Vous êtes hors ligne")
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  const manifestResponse = await fetch(
    "http://127.0.0.1:3000/manifest.webmanifest",
  );
  const manifest = await manifestResponse.json();
  const iconChecks = await Promise.all(
    ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"].map(
      async (path) => {
        const response = await fetch(`http://127.0.0.1:3000${path}`);
        return {
          path,
          status: response.status,
          type: response.headers.get("content-type"),
        };
      },
    ),
  );

  console.log(
    JSON.stringify(
      {
        viewport: "390x844",
        pages: results,
        browserErrors,
        offlineShell: offlineEvaluation.result.value,
        manifest: {
          status: manifestResponse.status,
          name: manifest.name,
          display: manifest.display,
          orientation: manifest.orientation,
          icons: manifest.icons?.length ?? 0,
        },
        iconChecks,
      },
      null,
      2,
    ),
  );

  cdp.close();
} finally {
  browserProcess.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 200,
  }).catch(() => {
    // Chromium peut conserver brièvement son lockfile sous Windows.
  });
}
