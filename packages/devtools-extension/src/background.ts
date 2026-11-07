// The MV3 service worker: a relay between content scripts and devtools panels, and the detection badge.
import { Relay, type RelayPort } from "./relay.js";

const relay = new Relay({
  set(tabId, detected) {
    void chrome.action.setBadgeText({ tabId, text: detected ? "G" : "" });
    if (detected) {
      void chrome.action.setBadgeBackgroundColor({ tabId, color: "#e8590c" });
      void chrome.action.setTitle({ tabId, title: "Gable app detected (dev build). Open the Gable panel in DevTools." });
    } else void chrome.action.setTitle({ tabId, title: "Gable DevTools" });
  },
});

chrome.runtime.onConnect.addListener((port) => relay.connect(port as unknown as RelayPort));
