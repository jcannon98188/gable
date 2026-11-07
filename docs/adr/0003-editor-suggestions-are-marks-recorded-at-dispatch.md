# Editor suggestions are marks recorded at dispatch

In suggestion mode, `@gable/editor` records edits as ProseMirror marks inside the document (`suggestionInsert`, `suggestionDelete`, `suggestionFormat`, each carrying a suggestion id, author and time) instead of as a separate Yjs structure. Because marks are text attributes in the Yjs binding, suggestions sync, merge and undo through the machinery the document already has. The edit is rewritten in a wrapped `dispatchTransaction`, before it is applied: a deletion becomes a `suggestionDelete` mark over the still-present text, an insertion is applied and given a `suggestionInsert` mark, and a format change is replaced by a `suggestionFormat` mark that remembers the change. Rewriting before apply, not after with `appendTransaction`, keeps the original characters in Yjs, so concurrent edits and comment anchors inside a suggested deletion survive.

## Alternatives rejected

A separate Y.Map of suggestion records anchored with relative positions (as comments are). It keeps the document clean, but a deletion that is "pending" must still show as struck-through text, so the document and the map would have to agree about every character. Two sources of truth that merge independently drift under concurrent edits.

Delete-then-reinsert from `appendTransaction`. It is simpler to write but replaces the original characters with new ones, orphaning comment anchors and losing concurrent edits made inside the range.

## Consequences

Accept and reject are ordinary transactions (remove a mark, or delete the marked text) and are undoable like any edit. Exported HTML contains `ins` and `del` elements for pending suggestions.

A Yjs text attribute holds one value per mark name, so two authors' overlapping suggestions of the same kind cannot coexist on the same characters: the later one wins on the overlap. Typing inside your own pending insertion edits it directly instead of creating a deletion. Deleting text that another author suggested inserting records a deletion on top of their insertion, and both are kept until resolved.

Structural edits are not tracked. Splitting a block (Enter) and other node changes apply normally. A deletion that spans a block boundary (joining paragraphs) is refused in suggestion mode, because a faithful record would need block-level suggestion marks. Format suggestions cover inline marks only, and a second format suggestion over the same range replaces the first.
