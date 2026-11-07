import type { ComponentScenes } from '@gable/core/tooling';
import '../app.css';
import { TodoStore } from '../services/todo-store.js';
import { TodoItem } from './todo-item.js';

/** A store that does nothing, so a scene needs neither the router nor localStorage. */
const store = { setCompleted() {}, remove() {}, rename() {} } as unknown as TodoStore;
const providers = [{ provide: TodoStore, useValue: store }];

export default {
  component: TodoItem,
  scenes: {
    Active: { description: 'An open todo', inputs: { todo: { id: '1', title: 'Buy milk', completed: false } }, providers },
    Completed: { description: 'A finished todo', inputs: { todo: { id: '2', title: 'Walk the dog', completed: true } }, providers },
    'Long title': {
      description: 'Wrapping of a long title',
      inputs: { todo: { id: '3', title: 'Reply to the long email thread about the quarterly planning offsite and its many open questions', completed: false } },
      providers,
    },
  },
} satisfies ComponentScenes<TodoItem>;
