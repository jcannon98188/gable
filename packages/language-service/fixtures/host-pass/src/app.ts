import { html, injectHost } from "@gablejs/core";

function useHost() {
  return injectHost<HTMLElement>();
}

export class Directive {
  static meta = { selector: "x-dir", template: html`<p></p>` };
  host = injectHost<HTMLElement>().host;
  again = useHost();
}
