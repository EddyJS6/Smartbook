import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
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
const chunkDirectory = join(process.cwd(), ".next", "static", "chunks");
const legacyTesseractChunkFileNames = [];
for (const fileName of await readdir(chunkDirectory)) {
  if (!fileName.endsWith(".js")) continue;
  const source = await readFile(join(chunkDirectory, fileName), "utf8");
  if (
    source.includes("recognizing text") ||
    source.includes("tesseract.js-core")
  ) {
    legacyTesseractChunkFileNames.push(fileName);
  }
}

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
  const networkRequests = [];
  let mockedAiRequestCount = 0;
  await cdp.send("Fetch.enable", {
    patterns: [
      {
        urlPattern: "*://127.0.0.1:3000/api/ocr",
        requestStage: "Request",
      },
    ],
  });
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
    if (
      message.method === "Fetch.requestPaused" &&
      message.params.request.url.endsWith("/api/ocr")
    ) {
      mockedAiRequestCount += 1;
      void cdp.send("Fetch.fulfillRequest", {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "content-type", value: "application/json" },
          { name: "cache-control", value: "no-store" },
        ],
        body: Buffer.from(
          JSON.stringify({
            text:
              "Les mythes organisent les sociétés.\\n\\nLa lecture nourrit la pensée.\\nChaque idée ouvre un chemin.",
            model: "gpt-5.4-mini-2026-03-17",
            processingDurationMs: 900,
            usage: {
              inputTokens: 1200,
              outputTokens: 40,
            },
          }),
        ).toString("base64"),
      });
    }
    if (message.method === "Network.requestWillBeSent") {
      const request = message.params.request;
      networkRequests.push({
        url: request.url,
        method: request.method,
        type: message.params.type,
        source: "page",
        hasPostData: Boolean(request.hasPostData),
        postDataLength: request.postData?.length ?? 0,
      });
    }
    if (
      message.method === "Target.attachedToTarget" &&
      message.params.targetInfo.type === "worker"
    ) {
      void cdp.send("Target.sendMessageToTarget", {
        sessionId: message.params.sessionId,
        message: JSON.stringify({ id: 1, method: "Network.enable" }),
      });
    }
    if (message.method === "Target.receivedMessageFromTarget") {
      const childMessage = JSON.parse(message.params.message);
      if (childMessage.method === "Network.requestWillBeSent") {
        const request = childMessage.params.request;
        networkRequests.push({
          url: request.url,
          method: request.method,
          type: childMessage.params.type,
          source: "worker",
          hasPostData: Boolean(request.hasPostData),
          postDataLength: request.postData?.length ?? 0,
        });
      }
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  await cdp.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: false,
  });
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

  const waitFor = async (expression, message, attempts = 40) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
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
          : elementType === "textarea"
            ? "HTMLTextAreaElement.prototype"
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
        const transaction = database.transaction(["books", "images", "bookNotes"], "readonly");
        const booksRequest = transaction.objectStore("books").count();
        const imagesRequest = transaction.objectStore("images").count();
        const notesRequest = transaction.objectStore("bookNotes").count();
        transaction.oncomplete = () => resolve({
          books: booksRequest.result,
          images: imagesRequest.result,
          notes: notesRequest.result
        });
        transaction.onerror = () => reject(transaction.error);
      };
    })`);

  const readLatestNote = () =>
    evaluate(`new Promise((resolve, reject) => {
      const request = indexedDB.open("brainbook");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(["bookNotes"], "readonly");
        const notesRequest = transaction.objectStore("bookNotes").getAll();
        transaction.oncomplete = () => {
          const notes = notesRequest.result.sort(
            (left, right) => right.updatedAt.localeCompare(left.updatedAt)
          );
          const note = notes[0];
          resolve(note ? {
            id: note.id,
            sourceType: note.sourceType,
            sourceImageId: note.sourceImageId,
            extractedText: note.extractedText,
            personalReflection: note.personalReflection,
            pageNumber: note.pageNumber,
            tags: note.tags
          } : null);
        };
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
  const notesBookId = await evaluate(
    `location.pathname.split("/").filter(Boolean)[1]`,
  );

  await waitFor(
    `document.body.innerText.includes("Aucune note pour le moment")`,
    "L’état vide des notes ne s’est pas affiché.",
  );
  await click(`a[href="/books/${notesBookId}/notes/new"]`);
  await waitFor(
    `location.pathname === "/books/${notesBookId}/notes/new"`,
    "Le formulaire de note ne s’est pas ouvert.",
  );
  const scannerEnabled = await evaluate(
    `Array.from(document.querySelectorAll("button")).some((button) => !button.disabled && button.textContent.includes("Scanner une page"))`,
  );
  console.log("[smoke] scan rapide disponible");
  const opencvRequestsBeforeActivation = networkRequests.filter((request) =>
    request.url.includes("/vendor/opencv/4.13.0/opencv.js"),
  );
  const cameraCaptureConfigured = await evaluate(
    `document.querySelector("#scan-camera-image")?.getAttribute("capture") === "environment" && document.querySelector("#scan-camera-image")?.getAttribute("accept") === "image/*"`,
  );
  const requestsBeforePhoto = networkRequests.length;
  await evaluate(`(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 1800;
    const context = canvas.getContext("2d");
    context.fillStyle = "#373731";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fffdf9";
    context.beginPath();
    context.moveTo(150, 100);
    context.lineTo(1290, 190);
    context.lineTo(1210, 1690);
    context.lineTo(210, 1740);
    context.closePath();
    context.fill();
    context.fillStyle = "#171712";
    context.font = "bold 72px Arial";
    context.fillText("LES MYTHES ORGANISENT", 250, 360);
    context.fillText("LES SOCIETES HUMAINES", 250, 470);
    context.font = "48px Arial";
    context.fillText("La lecture nourrit la pensee.", 250, 620);
    context.fillText("Chaque idee ouvre un chemin.", 250, 710);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    const file = new File([blob], "page-brainbook.png", {
      type: "image/png"
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector("#scan-camera-image");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { size: blob.size, type: blob.type };
  })()`);
  console.log("[smoke] photo de test transmise");
  await waitFor(
    `document.querySelector('img[alt="Page à envoyer à la reconnaissance IA"]') !== null && document.body.innerText.includes("Votre photo est prête")`,
    "L’aperçu du scan rapide n’a pas affiché la photo.",
    120,
  );
  const quickPreviewOnlySend = await evaluate(
    `JSON.stringify(Array.from(document.querySelectorAll('section[aria-label="Scanner une page"] button')).map((button) => button.textContent.trim())) === JSON.stringify(["Envoyer"]) && !document.body.innerText.includes("Redresser")`,
  );
  const quickScanScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const quickScanScreenshotPath = join(
    artifactDirectory,
    "quick-scan-preview.png",
  );
  await writeFile(
    quickScanScreenshotPath,
    Buffer.from(quickScanScreenshot.data, "base64"),
  );
  const photoPreparationRequests = networkRequests.slice(requestsBeforePhoto);
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.trim() === "Envoyer"
    );
    if (!button || button.disabled) throw new Error("Envoi du scan introuvable");
    button.click();
    return true;
  })()`);
  await waitFor(
    `document.querySelector("#ai-recognized-text") !== null`,
    "La reconnaissance IA simulée n’a pas produit de texte éditable.",
    200,
  );
  const aiRequestObserved = networkRequests.some(
    (request) =>
      request.url.endsWith("/api/ocr") &&
      request.method === "POST" &&
      request.hasPostData,
  );
  const ocrScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const ocrScreenshotPath = join(artifactDirectory, "ocr-selection.png");
  await writeFile(
    ocrScreenshotPath,
    Buffer.from(ocrScreenshot.data, "base64"),
  );

  const correctedOcrText =
    "Les mythes organisent les sociétés. La lecture nourrit la pensée.";
  await setControlValue("#ai-recognized-text", correctedOcrText, "textarea");
  await evaluate(`(() => {
    const area = document.querySelector("#ai-recognized-text");
    area.focus();
    area.setSelectionRange(0, "Les mythes organisent les sociétés.".length);
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.trim() === "Utiliser la sélection"
    );
    if (!button) throw new Error("Utilisation de la sélection introuvable");
    button.click();
    return true;
  })()`);
  await waitFor(
    `document.querySelector("#extracted-text")?.value === "Les mythes organisent les sociétés." && document.body.innerText.includes("Passage extrait depuis une photo")`,
    "La sélection du texte IA n’a pas rejoint directement le formulaire.",
  );
  const aiTextSelectionWorks = true;
  const aiCorrectionWorks = true;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const workerTargetsAfterTransfer = (
    await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()
  ).filter((target) => target.type === "worker");
  await setControlValue(
    "#personal-reflection",
    "Comparer cette idée avec nos habitudes.",
    "textarea",
  );
  await setControlValue("#page-number", "Chapitre 2");
  await setControlValue("#tag-input", "Anthropologie");
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.trim() === "Ajouter"
    );
    if (!button) throw new Error("Bouton Ajouter introuvable");
    button.click();
    return true;
  })()`);
  await setControlValue("#tag-input", "anthropologie");
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.trim() === "Ajouter"
    );
    if (!button) throw new Error("Bouton Ajouter introuvable");
    button.click();
    return true;
  })()`);
  await click('button[type="submit"]');
  await waitFor(
    `location.pathname === "/books/${notesBookId}" && document.body.innerText.includes("La note a bien été ajoutée") && document.body.innerText.includes("1 note")`,
    "La note n’a pas été créée ou comptée.",
  );
  const oneNoteCounts = await readDatabaseCounts();
  const scannedNote = await readLatestNote();
  const opencvRequestsAfterPhoto = networkRequests.filter((request) =>
    request.url.includes("/vendor/opencv/4.13.0/opencv.js"),
  );
  await navigate(
    `http://127.0.0.1:3000/books/${notesBookId}/notes/new`,
  );
  await cdp.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await evaluate(`(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1400;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "bold 68px Arial";
    context.fillText("RECONNAISSANCE HORS LIGNE", 70, 300);
    context.font = "48px Arial";
    context.fillText("Le texte reste reconnu.", 70, 420);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([blob], "offline-ocr.png", { type: "image/png" })
    );
    const input = document.querySelector("#scan-camera-image");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    `document.body.innerText.includes("Votre photo est prête")`,
    "La photo du contrôle hors ligne n’a pas atteint l’aperçu.",
    120,
  );
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.trim() === "Envoyer"
    );
    button?.click();
    return Boolean(button);
  })()`);
  await waitFor(
    `document.body.innerText.includes("reconnaissance IA nécessite une connexion Internet")`,
    "Le mode hors ligne n’a pas expliqué que la reconnaissance IA nécessite Internet.",
    100,
  );
  const offlineAiBlockedCleanly = true;
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await navigate(`http://127.0.0.1:3000/books/${notesBookId}`);
  await waitFor(
    `document.querySelector('a[aria-label^="Ouvrir la note"]') !== null`,
    "La note scannée n’est plus visible après le contrôle hors ligne.",
  );
  const apiOcrRequests = networkRequests
    .slice(requestsBeforePhoto)
    .filter(
      (request) =>
        request.url.endsWith("/api/ocr") &&
        request.method === "POST" &&
        request.hasPostData,
    );
  const directExternalImageRequests = networkRequests
    .slice(requestsBeforePhoto)
    .filter(
      (request) =>
        /^https?:/i.test(request.url) &&
        new URL(request.url).origin !== "http://127.0.0.1:3000" &&
        (request.hasPostData ||
          !["GET", "HEAD"].includes(request.method)),
    );
  const externalRequestsDuringPhotoPreparation =
    photoPreparationRequests.filter(
      (request) =>
        /^https?:/i.test(request.url) &&
        new URL(request.url).origin !== "http://127.0.0.1:3000",
    );
  const notePath = await evaluate(
    `document.querySelector('a[aria-label^="Ouvrir la note"]')?.getAttribute("href")`,
  );
  if (!notePath) throw new Error("Le lien vers la note créée est introuvable.");
  const noteId = notePath.split("/").filter(Boolean)[3];

  await navigate(`http://127.0.0.1:3000${notePath}`);
  await waitFor(
    `document.body.innerText.includes("Les mythes organisent les sociétés.") && document.body.innerText.includes("Comparer cette idée avec nos habitudes.") && document.body.innerText.includes("Anthropologie") && document.body.innerText.includes("Passage extrait depuis une photo")`,
    "Le détail complet de la note ne s’est pas affiché.",
  );
  const noteDetailScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const noteDetailScreenshotPath = join(
    artifactDirectory,
    "note-detail.png",
  );
  await writeFile(
    noteDetailScreenshotPath,
    Buffer.from(noteDetailScreenshot.data, "base64"),
  );
  await navigate(`http://127.0.0.1:3000${notePath}/edit`);
  await waitFor(
    `document.querySelector("#personal-reflection")?.value.includes("nos habitudes")`,
    "Le formulaire de modification de la note n’est pas prérempli.",
  );
  await setControlValue(
    "#personal-reflection",
    "Une action concrète à tester demain.",
    "textarea",
  );
  await click('button[type="submit"]');
  await waitFor(
    `location.pathname === "${notePath}" && document.body.innerText.includes("Les modifications de la note ont bien été enregistrées")`,
    "La modification de la note n’a pas été enregistrée.",
  );
  await cdp.send("Page.reload");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(
    `document.body.innerText.includes("Une action concrète à tester demain.")`,
    "La modification de la note n’a pas persisté.",
  );

  await navigate("http://127.0.0.1:3000/ideas");
  await waitFor(
    `document.body.innerText.includes("1 note conservée") && document.body.innerText.includes("Sapiens")`,
    "La vue globale Mes idées n’a pas joint la note à son livre.",
  );
  await setControlValue('input[type="search"]', "  SAPIENS ");
  const ideaBookSearchFound = await evaluate(
    `document.body.innerText.includes("Les mythes organisent les sociétés.")`,
  );
  await setControlValue('input[type="search"]', "mythes");
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.trim() === "Anthropologie"
    );
    if (!button) throw new Error("Filtre de tag introuvable");
    button.click();
    return true;
  })()`);
  const combinedIdeaFilterFound = await evaluate(
    `document.body.innerText.includes("Les mythes organisent les sociétés.")`,
  );
  await setControlValue('input[type="search"]', "introuvable");
  const ideaNoResultVisible = await evaluate(
    `document.body.innerText.includes("Aucune idée trouvée")`,
  );
  const ideasScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const ideasScreenshotPath = join(artifactDirectory, "ideas-filtered.png");
  await writeFile(
    ideasScreenshotPath,
    Buffer.from(ideasScreenshot.data, "base64"),
  );

  await navigate(`http://127.0.0.1:3000${notePath}`);
  await click('summary[aria-label="Actions de la note"]');
  await evaluate(`window.confirm = () => true`);
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.includes("Supprimer la note")
    );
    if (!button) throw new Error("Action de suppression de note introuvable");
    button.click();
    return true;
  })()`);
  await waitFor(
    `location.pathname === "/books/${notesBookId}" && document.body.innerText.includes("La note a été supprimée") && document.body.innerText.includes("0 note")`,
    "La suppression de la note n’a pas restauré son état vide.",
  );
  const deletedNoteCounts = await readDatabaseCounts();

  await navigate(`http://127.0.0.1:3000/books/${notesBookId}/notes/new`);
  await setControlValue(
    "#personal-reflection",
    "Une réflexion sans passage pour tester la saisie libre.",
    "textarea",
  );
  await click('button[type="submit"]');
  await waitFor(
    `location.pathname === "/books/${notesBookId}" && document.body.innerText.includes("1 note")`,
    "La note composée uniquement d’une réflexion n’a pas été créée.",
  );
  const beforeCascadeCounts = await readDatabaseCounts();
  await evaluate(`window.confirm = () => true`);
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent.includes("Supprimer le livre")
    );
    if (!button) throw new Error("Suppression du livre introuvable");
    button.click();
    return true;
  })()`);
  await waitFor(
    `location.pathname === "/" && document.body.innerText.includes("Votre bibliothèque commence ici")`,
    "La suppression du livre contenant une note n’a pas abouti.",
  );
  const cascadeCounts = await readDatabaseCounts();

  await navigate(
    `http://127.0.0.1:3000/books/${notesBookId}/notes/${noteId}`,
  );
  await waitFor(
    `document.body.innerText.includes("Note introuvable")`,
    "L’état note introuvable ne s’est pas affiché.",
  );

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
    scannerEnabled,
    cameraCaptureConfigured,
    quickPreviewOnlySend,
    openCvNeverLoaded:
      opencvRequestsBeforeActivation.length === 0 &&
      opencvRequestsAfterPhoto.length === 0,
    tesseractRemoved: legacyTesseractChunkFileNames.length === 0,
    localPhotoPreparation:
      externalRequestsDuringPhotoPreparation.length === 0,
    aiRouteCalledOnce:
      mockedAiRequestCount === 1 &&
      aiRequestObserved &&
      apiOcrRequests.length === 1,
    aiTextSelectionWorks,
    aiCorrectionWorks,
    noDirectBrowserUploadToThirdParty:
      directExternalImageRequests.length === 0,
    offlineAiBlockedCleanly,
    workerTerminatedAfterTransfer: workerTargetsAfterTransfer.length === 0,
    noteCreationAndCount:
      oneNoteCounts.books === 1 &&
      oneNoteCounts.notes === 1 &&
      oneNoteCounts.images === 0 &&
      scannedNote?.sourceType === "scan" &&
      scannedNote?.sourceImageId === null,
    noteEditPersists: true,
    ideaBookSearchFound,
    combinedIdeaFilterFound,
    ideaNoResultVisible,
    noteDeletion:
      deletedNoteCounts.books === 1 && deletedNoteCounts.notes === 0,
    reflectionOnlyNote:
      beforeCascadeCounts.books === 1 && beforeCascadeCounts.notes === 1,
    bookDeletionCascades:
      cascadeCounts.books === 0 &&
      cascadeCounts.notes === 0 &&
      cascadeCounts.images === 0,
    missingNoteState: true,
    missingBookState: true,
    detailScreenshot: detailScreenshotPath,
    noteDetailScreenshot: noteDetailScreenshotPath,
    aiSelectionScreenshot: ocrScreenshotPath,
    quickScanScreenshot: quickScanScreenshotPath,
    ideasScreenshot: ideasScreenshotPath,
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
        networkPrivacy: {
          legacyTesseractChunkFileNames,
          localAiUploadRequestCount: apiOcrRequests.length,
          directExternalImageRequestCount:
            directExternalImageRequests.length,
          externalPreparationRequestCount:
            externalRequestsDuringPhotoPreparation.length,
          externalPreparationUrls:
            externalRequestsDuringPhotoPreparation.map(
              (request) => request.url,
            ),
          openCvRequestCount: opencvRequestsAfterPhoto.length,
        },
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
