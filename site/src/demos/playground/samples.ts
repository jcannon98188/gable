/** Starting template and the edits the buttons make. Fields: name, loud, show, count, total, items; methods inc(), toggle(), add(), clear(). */
export const STARTER = `<label>Your name
  <input [value]="name()" (input)="name.set($event.currentTarget.value)">
</label>
<h3>Hello, {{ name() }}!</h3>

@if (show()) {
  <p>Shown while show() is true.</p>
}
<button (click)="toggle()">Toggle</button>

<ul>
  @for (item of items(); track item.id) {
    <li>{{ item.label }}</li>
  } @empty {
    <li>Nothing here yet.</li>
  }
</ul>
<button (click)="add()">Add an item</button>`;

export interface Suggestion {
  id: string;
  label: string;
  /** "works": a valid edit. "error": an edit that makes Gable raise its real error. */
  kind: "works" | "error";
  source: string;
}

export const SUGGESTIONS: Suggestion[] = [
  { id: "loud", label: "Use a computed", kind: "works", source: STARTER.replace("Hello, {{ name() }}!", "Hello, {{ loud() }}!") },
  { id: "counter", label: "Add a counter", kind: "works", source: `${STARTER}\n<p>Clicked {{ count() }} times.</p>\n<button (click)="inc()">Count</button>` },
  { id: "total", label: "Count the items", kind: "works", source: STARTER.replace("<ul>", "<p>{{ total() }} items</p>\n<ul>") },
  { id: "ternary", label: "Try a ternary", kind: "error", source: STARTER.replace("Hello, {{ name() }}!", "Hello, {{ show() ? name() : 'nobody' }}!") },
  { id: "unclosed", label: "Leave a tag open", kind: "error", source: STARTER.replace("</label>", "") },
  { id: "else", label: "Misplace an @else", kind: "error", source: STARTER.replace("@if (show()) {", "@else {") },
  { id: "track", label: "Forget track", kind: "error", source: STARTER.replace("; track item.id", "") },
  { id: "missing", label: "Read a missing field", kind: "error", source: STARTER.replace("{{ name() }}", "{{ nme() }}") },
];
