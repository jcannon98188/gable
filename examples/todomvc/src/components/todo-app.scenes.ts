import type { ComponentScenes } from '@gable/core/tooling';
import { TodoStorage } from '../services/todo-storage.js';
import { TodoApp } from './todo-app.js';

/** Storage that starts from `todos` and saves nowhere, so a scenario never touches the browser's localStorage. */
const storage = (todos: unknown[]) => ({
  provide: TodoStorage,
  useValue: { load: () => JSON.stringify(todos), save() {} } satisfies TodoStorage,
});

// Page-mode scenarios: the Designer runs the real app, router included, with these providers on top of its own. They need
// the router, so the Designer's component mode (which mounts the component alone) is not meant for this file;
// `todo-app.scenes.test.ts` mounts them with `mountApp` instead.
export default {
  component: TodoApp,
  scenes: {
    Empty: { description: 'No todos yet', providers: [storage([])] },
    'Mixed list': {
      description: 'Some done, some open, opened on the Active filter',
      url: '/active',
      providers: [
        storage([
          { id: '1', title: 'Buy milk', completed: false },
          { id: '2', title: 'Walk the dog', completed: true },
          { id: '3', title: 'Write the report', completed: false },
        ]),
      ],
    },
  },
} satisfies ComponentScenes<TodoApp>;
