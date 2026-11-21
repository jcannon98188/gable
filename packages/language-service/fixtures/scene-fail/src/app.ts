import { html, signal } from "@gablejs/core";
import { pixiElements } from "@gablejs/renderer-pixi/elements";

export class Scene {
  static meta = {
    selector: "x-scene",
    renderer: () => undefined as never,
    template: html`
      <sprte></sprte>
      <div></div>
      <container [alhpa]="1"></container>
      <container [alpha]="label()"></container>
      <container [scale.z]="1"></container>
      <container [alpha.x]="1"></container>
      <container [scale.x.y]="1"></container>
      <container [style.color]="'red'"></container>
      <container (pointerdwn)="go()" (pointerdown)="go($event.nope)" [a11y]="info()"></container>
      <sprite anchor="abc"></sprite>
      <container x="abc" visible="maybe"></container>
      <container tnt="#fff"></container>
      <bitmap-txt></bitmap-txt>
      <container><hit-rect fill="#fff"></hit-rect><hit-cirle></hit-cirle></container>
      <x-ship (cliick)="go()"></x-ship>
      <container [x]="count()" [y]="count()"></container>
    `,
  };
  label = signal("a");
  count = signal(1);
  info = signal({ role: "button", label: "Go" });
  go(e?: unknown): void {
    void e;
  }
}

export class Ship {
  static meta = { selector: "x-ship", elements: pixiElements, template: html`<sprite [nope]="1"></sprite><span></span>` };
}

// A Pixi tag in an unmarked template is an edit-time error.
export class Plain {
  static meta = { selector: "x-plain", template: html`<sprite></sprite><div></div>` };
}
