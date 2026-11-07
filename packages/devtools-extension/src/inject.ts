// Entry of the main-world content script (`inject.js`).
import { startBridge } from "./bridge.js";

startBridge(window as unknown as Parameters<typeof startBridge>[0]);
