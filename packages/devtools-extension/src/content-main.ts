// Entry of the isolated content script (`content.js`).
import { startContent } from "./content.js";
import { PORT_CONTENT } from "./protocol.js";

startContent({ win: window, connect: () => chrome.runtime.connect({ name: PORT_CONTENT }) });
