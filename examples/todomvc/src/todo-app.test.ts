import { describe, expect, it } from 'vitest';
import { mountApp } from '@gable/testing';
import { TodoApp } from './components/todo-app.js';
import { routes } from './routes.js';
import { TodoStorage } from './services/todo-storage.js';

class MemoryStorage extends TodoStorage {
  constructor(public raw: string | null = null) {
    super();
  }
  override load() {
    return this.raw;
  }
  override save(raw: string) {
    this.raw = raw;
  }
}

function start(options: { raw?: string; url?: string } = {}) {
  const storage = new MemoryStorage(options.raw ?? null);
  const app = mountApp(TodoApp, {
    routes,
    url: options.url,
    providers: [{ provide: TodoStorage, useValue: storage }],
  });
  return { app, storage };
}

async function add(app: ReturnType<typeof start>['app'], title: string) {
  const input = app.query('.new-todo')!;
  app.type(input, title);
  app.keydown(input, 'Enter');
  await app.settle();
}

const titles = (app: ReturnType<typeof start>['app']) => app.queryAll('.todo-list label').map((n) => app.textOf(n));
const seed = JSON.stringify([
  { id: 'a', title: 'one', completed: false },
  { id: 'b', title: 'two', completed: true },
]);

describe('TodoMVC', () => {
  it('hides main and footer when there are no todos', async () => {
    const { app } = start();
    await app.settle();
    expect(app.query('.main')).toBeNull();
    expect(app.query('.footer')).toBeNull();
  });

  it('adds trimmed todos and ignores blank ones', async () => {
    const { app, storage } = start();
    await add(app, '   ');
    expect(app.query('.main')).toBeNull();
    await add(app, '  buy milk  ');
    expect(titles(app)).toEqual(['buy milk']);
    expect(JSON.parse(storage.raw!)).toMatchObject([{ title: 'buy milk', completed: false }]);
  });

  it('counts active items with correct pluralisation', async () => {
    const { app } = start();
    await add(app, 'a');
    expect(app.textOf(app.query('.todo-count')!)).toBe('1 item left');
    await add(app, 'b');
    expect(app.textOf(app.query('.todo-count')!)).toBe('2 items left');
    expect(app.textOf(app.query('.todo-count strong')!)).toBe('2');
  });

  it('completes a todo, toggles all, and clears completed', async () => {
    const { app } = start({ raw: seed });
    await app.settle();
    expect(app.queryAll('.todo-list li.completed')).toHaveLength(1);

    app.change(app.query('.toggle-all')!, true);
    await app.settle();
    expect(app.queryAll('.todo-list li.completed')).toHaveLength(2);
    expect(app.textOf(app.query('.todo-count')!)).toBe('0 items left');

    app.dispatch(app.query('.clear-completed')!, 'click');
    await app.settle();
    expect(app.query('.main')).toBeNull();
  });

  it('edits on double click, saves on Enter, discards on Escape, removes when empty', async () => {
    const { app } = start({ raw: seed });
    await app.settle();
    const edit = async (key: string, value: string) => {
      app.dispatch(app.query('.todo-list li label')!, 'dblclick');
      await app.settle();
      expect(app.query('.todo-list li.editing')).not.toBeNull();
      const field = app.query('.edit')!;
      app.type(field, value);
      app.keydown(field, key);
      await app.settle();
    };

    await edit('Escape', 'discarded');
    expect(titles(app)).toEqual(['one', 'two']);
    expect(app.query('.edit')).toBeNull();

    await edit('Enter', '  renamed ');
    expect(titles(app)).toEqual(['renamed', 'two']);

    await edit('Enter', '   ');
    expect(titles(app)).toEqual(['two']);
  });

  it('filters by route and keeps the selected link in step', async () => {
    const { app } = start({ raw: seed, url: '/active' });
    await app.settle();
    expect(titles(app)).toEqual(['one']);
    expect(app.textOf(app.query('.filters a.selected')!)).toBe('Active');

    app.change(app.query('.todo-list .toggle')!, true);
    await app.settle();
    expect(titles(app)).toEqual([]);

    await app.navigate('/completed');
    expect(titles(app)).toEqual(['one', 'two']);
    expect(app.textOf(app.query('.filters a.selected')!)).toBe('Completed');

    await app.navigate('/');
    expect(app.textOf(app.query('.filters a.selected')!)).toBe('All');
  });
});
