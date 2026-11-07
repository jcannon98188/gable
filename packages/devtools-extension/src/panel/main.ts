// Entry of the panel page: connects to the service worker relay and renders.
import { PORT_PANEL, type RelayToPanel } from "../protocol.js";
import { createClient, type Transport } from "./client.js";
import { createPanel, type Host } from "./model.js";
import { render } from "./view.js";

/** A transport over a `chrome.runtime` port that reconnects when the service worker is stopped. */
function chromeTransport(): Transport {
  let port: chrome.runtime.Port | null = null;
  return {
    send(message) {
      port?.postMessage(message);
    },
    listen(onMessage, onOpen) {
      const open = () => {
        port = chrome.runtime.connect({ name: PORT_PANEL });
        port.onMessage.addListener((m) => onMessage(m as RelayToPanel));
        port.onDisconnect.addListener(() => {
          port = null;
          setTimeout(open, 300);
        });
        onOpen();
      };
      open();
    },
  };
}

const host: Host = {
  evalInPage: (expression) =>
    new Promise((resolve, reject) => {
      chrome.devtools.inspectedWindow.eval(expression, (result, exception) => {
        if (exception) reject(new Error(exception.value ?? exception.description ?? "Evaluation failed."));
        else resolve(result);
      });
    }),
};

const root = document.getElementById("app")!;
document.documentElement.dataset.theme = chrome.devtools.panels.themeName === "dark" ? "dark" : "light";

const client = createClient(chromeTransport(), { tabId: chrome.devtools.inspectedWindow.tabId });
const panel = createPanel(client, host);

let queued = false;
panel.subscribe(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render(root, panel);
  });
});
render(root, panel);

// Values change without an event (a signal written with no effect reading it): poll the visible tab.
setInterval(() => void panel.tick(), 1000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) void panel.hidden();
});
window.addEventListener("pagehide", () => void panel.hidden());
