import { html, output, signal } from "@gable/core";
import { pixiElements } from "@gable/renderer-pixi/elements";
import type { FederatedPointerEvent, Texture } from "pixi.js";

// A renderer boundary: its own template gets the Pixi element map.
export class Scene {
  static meta = {
    selector: "x-scene",
    renderer: () => undefined as never,
    template: html`
      <container [x]="px()" y="4" alpha="0.5" visible [scale]="2" [scale.x]="px()" pivot="1, 2" [position]="pos()" #root>
        <sprite [texture]="tex()" anchor="0.5" [anchor.y]="0.5" tint="#ff0000" (pointerdown)="down($event)" (click)="down($event)" [a11y]="info()"></sprite>
        <text fontSize="24" fill="#fff" text="123">hello {{ px() }}</text>
        <graphics>
          <rect x="0" y="0" width="10" height="10" fill="#00ff00" strokeWidth="2"></rect>
          <ellipse halfWidth="4" halfHeight="2"></ellipse>
        </graphics>
        <x-ship (picked)="onPick($event)" [x]="px()"></x-ship>
        <bitmap-text text="x"></bitmap-text>
        <sprite width="10" height="10" (pointertap)="down($event)">
          <hit-circle x="5" y="5" [radius]="px()"></hit-circle>
          <hit-rect x="-4" width="20" height="20" [y]="px()"></hit-rect>
          <hit-polygon [points]="pts()"></hit-polygon>
        </sprite>
      </container>
    `,
  };
  info = signal({ role: "button", label: "Ship" });
  px = signal(1);
  pts = signal([0, 0, 10, 0, 10, 10]);
  pos = signal({ x: 1, y: 2 });
  tex = signal<Texture>(undefined as never);
  down(e: FederatedPointerEvent): void {
    void e;
  }
  onPick(n: number): void {
    void n;
  }
}

// A scene component inside a boundary carries the marker.
export class Ship {
  static meta = {
    selector: "x-ship",
    elements: pixiElements,
    template: html`
      <sprite [alpha]="a()" (wheel)="w($event.deltaY)"></sprite>
    `,
  };
  a = signal(1);
  picked = output<number>();
  w(dy: number): void {
    void dy;
  }
}

// Projected children of a boundary component are scene tags too.
export class Page {
  static meta = {
    selector: "x-page",
    template: html`
      <x-scene>
        <sprite [alpha]="1"></sprite>
      </x-scene>
      <div [hidden]="false"></div>
      <svg><rect x="1"></rect><text x="2">t</text></svg>
    `,
  };
}
