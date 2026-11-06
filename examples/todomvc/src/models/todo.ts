export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export type Filter = 'all' | 'active' | 'completed';

export const matchesFilter = (todo: Todo, filter: Filter): boolean =>
  filter === 'all' || (filter === 'active' ? !todo.completed : todo.completed);

/** Reads persisted todos, ignoring anything that is not in the expected shape. */
export function parseTodos(raw: string | null): Todo[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (t): t is Todo =>
        !!t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.completed === 'boolean',
    );
  } catch {
    return [];
  }
}
