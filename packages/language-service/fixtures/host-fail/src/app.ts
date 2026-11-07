import { html, injectHost } from "@gable/core";

const atModuleLevel = injectHost();

export class Directive {
  static meta = { selector: "x-dir", template: html`<p></p>` };
  static shared = injectHost();
  handler = () => injectHost();
  inField = injectHost().host;

  open() {
    return injectHost();
  }
}
