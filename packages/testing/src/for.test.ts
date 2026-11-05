import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";

interface Todo {
  id: number;
  title: string;
}

class List {
  static meta = {
    selector: "app-list",
    template: html`<ul>
      @for (todo of todos(); track todo.id) {
        <li [class.first]="$first" [class.last]="$last" [class.odd]="$odd">{{ $index }}:{{ todo.title }}/{{ $count }}</li>
      } @empty {
        <li class="empty">nothing</li>
      }
    </ul>`,
  };
  todos = signal<Todo[]>([]);
}

const rows = (f: ReturnType<typeof mount<List>>) => f.queryAll("li").map((li) => li.children[0]!.text);

describe("@for", () => {
  it("renders @empty, then rows with loop variables", async () => {
    const f = mount(List);
    expect(f.queryAll("li.empty")).toHaveLength(1);
    f.instance.todos.set([
      { id: 1, title: "a" },
      { id: 2, title: "b" },
      { id: 3, title: "c" },
    ]);
    await f.flush();
    expect(f.queryAll("li.empty")).toHaveLength(0);
    expect(rows(f)).toEqual(["0:a/3", "1:b/3", "2:c/3"]);
    expect(f.query("li.first")!.children[0]!.text).toBe("0:a/3");
    expect(f.query("li.last")!.children[0]!.text).toBe("2:c/3");
    expect(f.queryAll("li.odd")).toHaveLength(1);
    f.instance.todos.set([]);
    await f.flush();
    expect(f.queryAll("li.empty")).toHaveLength(1);
    expect(rows(f)).toEqual(["nothing"]);
  });

  it("reuses row nodes by track key across insert, remove, move and update", async () => {
    const f = mount(List);
    const t = (id: number, title = String(id)) => ({ id, title });
    f.instance.todos.set([t(1), t(2), t(3)]);
    await f.flush();
    const [n1, n2, n3] = f.queryAll("li");

    f.instance.todos.set([t(3), t(1), t(4), t(2, "two")]);
    await f.flush();
    const after = f.queryAll("li");
    expect(rows(f)).toEqual(["0:3/4", "1:1/4", "2:4/4", "3:two/4"]);
    expect(after[0]).toBe(n3);
    expect(after[1]).toBe(n1);
    expect(after[3]).toBe(n2);

    f.instance.todos.set([t(2, "two")]);
    await f.flush();
    expect(f.queryAll("li")).toEqual([n2]);
    expect(rows(f)).toEqual(["0:two/1"]);
  });

  it("keeps sibling order around the loop", async () => {
    class Around {
      static meta = {
        selector: "app-around",
        template: html`<h1>x</h1>@for (n of ns(); track n) {<i>{{ n }}</i>}<footer>y</footer>`,
      };
      ns = signal([1, 2]);
    }
    const f = mount(Around);
    f.instance.ns.set([3, 2, 1, 0]);
    await f.flush();
    expect(f.root.children.filter((c) => c.kind !== "anchor").map((c) => c.tag)).toEqual(["h1", "i", "i", "i", "i", "footer"]);
    expect(f.text()).toBe("x3210y");
  });

  it("rejects duplicate track keys", () => {
    class Dup {
      static meta = { selector: "app-dup", template: html`@for (n of ns(); track n) {<i>{{ n }}</i>}` };
      ns = signal([1, 1]);
    }
    expect(() => mount(Dup)).toThrow(/duplicate key/);
  });

  it("rejects @for without track", () => {
    class NoTrack {
      static meta = { selector: "app-nt", template: html`@for (n of ns(); ) {<i>{{ n }}</i>}` };
      ns = signal([1]);
    }
    expect(() => mount(NoTrack)).toThrow(/needs a track expression/);
    class NoTrack2 {
      static meta = { selector: "app-nt2", template: html`@for (n of ns()) {<i>{{ n }}</i>}` };
      ns = signal([1]);
    }
    expect(() => mount(NoTrack2)).toThrow(/needs a track expression/);
  });

  it("nests @for and @if with outer loop variables in scope", async () => {
    class Nested {
      static meta = {
        selector: "app-nested",
        template: html`@for (g of groups(); track g.name) {<section>@for (m of g.members; track m) {@if (m) {<b>{{ g.name }}-{{ m }}</b>}}</section>}`,
      };
      groups = signal([
        { name: "g1", members: ["a", "b"] },
        { name: "g2", members: ["c"] },
      ]);
    }
    const f = mount(Nested);
    expect(f.queryAll("b").map((b) => b.children[0]!.text)).toEqual(["g1-a", "g1-b", "g2-c"]);
    f.instance.groups.update((g) => [g[1]!, g[0]!]);
    await f.flush();
    expect(f.queryAll("b").map((b) => b.children[0]!.text)).toEqual(["g2-c", "g1-a", "g1-b"]);
  });
});
