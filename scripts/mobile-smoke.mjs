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

  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }

    return result.result.value;
  };

  const waitFor = async (expression, message) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error(message);
  };

  const navigate = async (url) => {
    await cdp.send("Page.navigate", { url });
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  const setControlValue = async (selector, value, elementType = "input") => {
    await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Champ introuvable");
      const prototype = ${
        elementType === "select"
          ? "HTMLSelectElement.prototype"
          : "HTMLInputElement.prototype"
      };
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      setter.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
  };

  const click = async (selector) => {
    await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Élément introuvable");
      element.click();
      return true;
    })()`);
  };

  const setFile = async (selector, filePath) => {
    const documentNode = await cdp.send("DOM.getDocument");
    const inputNode = await cdp.send("DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector,
    });
    if (!inputNode.nodeId) throw new Error("Champ fichier introuvable");
    await cdp.send("DOM.setFileInputFiles", {
      nodeId: inputNode.nodeId,
      files: [filePath],
    });
  };

  const readDatabaseCounts = () =>
    evaluate(`new Promise((resolve, reject) => {
      const request = indexedDB.open("brainbook");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(["books", "images"], "readonly");
        const booksRequest = transaction.objectStore("books").count();
        const imagesRequest = transaction.objectStore("images").count();
        transaction.oncomplete = () => resolve({
          books: booksRequest.result,
          images: imagesRequest.result
        });
        transaction.onerror = () => reject(transaction.error);
      };
    })`);

  const routes = [
    { name: "library", url: "http://127.0.0.1:3000/" },
    { name: "ideas", url: "http://127.0.0.1:3000/ideas" },
    { name: "settings", url: "http://127.0.0.1:3000/settings" },
  ];
  const results = [];

  for (const route of routes) {
    await navigate(route.url);

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

  await navigate("http://127.0.0.1:3000/");
  await waitFor(
    `document.body.innerText.includes("Votre bibliothèque commence ici")`,
    "L’état vide ne s’est pas affiché.",
  );
  const emptyCounts = await readDatabaseCounts();

  await click('a[href="/books/new"]');
  await waitFor(
    `location.pathname === "/books/new"`,
    "La page d’ajout ne s’est pas ouverte.",
  );
  await click('button[type="submit"]');
  await waitFor(
    `document.body.innerText.includes("Indiquez le titre du livre") && document.body.innerText.includes("Indiquez le nom de l’auteur")`,
    "La validation obligatoire ne s’est pas affichée.",
  );

  await setControlValue("#title", "  Le Petit Prince  ");
  await setControlValue("#author", " Antoine de Saint-Exupéry ");
  await setFile(
    "#cover-image",
    join(process.cwd(), "public", "icons", "icon-512.png"),
  );
  await waitFor(
    `document.querySelector('img[alt="Prévisualisation de la couverture"]') !== null`,
    "La couverture n’a pas été prévisualisée.",
  );
  await click('button[type="submit"]');
  await waitFor(
    `location.pathname.startsWith("/books/") && document.body.innerText.includes("Le livre a bien été ajouté")`,
    "Le livre avec couverture n’a pas été créé.",
  );
  const createdBookId = await evaluate(
    `location.pathname.split("/").filter(Boolean)[1]`,
  );
  const createdCounts = await readDatabaseCounts();

  const detailScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const detailScreenshotPath = join(artifactDirectory, "book-detail.png");
  await writeFile(
    detailScreenshotPath,
    Buffer.from(detailScreenshot.data, "base64"),
  );

  await navigate("http://127.0.0.1:3000/");
  await cdp.send("Page.reload");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(
    `document.body.innerText.includes("Le Petit Prince")`,
    "Le livre n’a pas persisté après actualisation.",
  );
  await navigate("about:blank");
  await navigate("http://127.0.0.1:3000/");
  await waitFor(
    `document.body.innerText.includes("Le Petit Prince")`,
    "Le livre n’a pas persisté après réouverture.",
  );

  await setControlValue('input[type="search"]', "  PETIT PRINCE ");
  const titleSearchFound = await evaluate(
    `document.body.innerText.includes("Le Petit Prince")`,
  );
  await setControlValue('input[type="search"]', "saint-exupéry");
  const authorSearchFound = await evaluate(
    `document.body.innerText.includes("Le Petit Prince")`,
  );
  await setControlValue('input[type="search"]', "introuvable");
  const noResultVisible = await evaluate(
    `document.body.innerText.includes("Aucun livre trouvé")`,
  );

  await navigate(
    `http://127.0.0.1:3000/books/${createdBookId}/edit`,
  );
  await waitFor(
    `document.querySelector("#title")?.value === "Le Petit Prince"`,
    "Le formulaire d’édition n’a pas été prérempli.",
  );
  await setControlValue("#title", "Le Petit Prince — édition");
  await setControlValue("#status", "finished", "select");
  await setFile(
    "#cover-image",
    join(process.cwd(), "public", "icons", "icon-192.png"),
  );
  await waitFor(
    `document.querySelector('img[alt="Prévisualisation de la couverture"]') !== null`,
    "La couverture de remplacement n’a pas été prévisualisée.",
  );
  await click('button[type="submit"]');
  await waitFor(
    `location.pathname === "/books/${createdBookId}" && document.body.innerText.includes("Les modifications ont bien été enregistrées")`,
    "Les modifications n’ont pas été enregistrées.",
  );
  await cdp.send("Page.reload");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(
    `document.body.innerText.includes("Le Petit Prince — édition") && document.body.innerText.includes("TERMINÉ")`,
    "Les modifications n’ont pas persisté.",
  );
  const replacedCoverCounts = await readDatabaseCounts();

  await evaluate(`window.confirm = () => true`);
  const deleteSelector = `Array.from(document.querySelectorAll("button")).find((button) => button.textContent.includes("Supprimer le livre"))`;
  await evaluate(`(() => {
    const button = ${deleteSelector};
    if (!button) throw new Error("Action de suppression introuvable");
    button.click();
    return true;
  })()`);
  await waitFor(
    `location.pathname === "/" && document.body.innerText.includes("Votre bibliothèque commence ici")`,
    "La suppression n’a pas restauré l’état vide.",
  );
  const deletedCounts = await readDatabaseCounts();

  await navigate("http://127.0.0.1:3000/books/new");
  await setControlValue("#title", "Sapiens");
  await setControlValue("#author", "Yuval Noah Harari");
  await click('button[type="submit"]');
  await waitFor(
    `location.pathname.startsWith("/books/") && document.body.innerText.includes("Sapiens")`,
    "Le livre sans couverture n’a pas été créé.",
  );
  const placeholderCounts = await readDatabaseCounts();

  const missingId = "00000000-0000-4000-8000-000000000000";
  await navigate(`http://127.0.0.1:3000/books/${missingId}`);
  await waitFor(
    `document.body.innerText.includes("Livre introuvable")`,
    "L’état livre introuvable ne s’est pas affiché.",
  );

  const interactionChecks = {
    emptyLibrary: emptyCounts.books === 0 && emptyCounts.images === 0,
    requiredValidation: true,
    coverPreview: true,
    creationWithCover:
      createdCounts.books === 1 && createdCounts.images === 1,
    persistenceAfterReload: true,
    persistenceAfterReopen: true,
    titleSearchFound,
    authorSearchFound,
    noResultVisible,
    editAndCoverReplacement:
      replacedCoverCounts.books === 1 && replacedCoverCounts.images === 1,
    deletionCleansImage:
      deletedCounts.books === 0 && deletedCounts.images === 0,
    creationWithoutCover:
      placeholderCounts.books === 1 && placeholderCounts.images === 0,
    missingBookState: true,
    detailScreenshot: detailScreenshotPath,
  };

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
        interactions: interactionChecks,
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
