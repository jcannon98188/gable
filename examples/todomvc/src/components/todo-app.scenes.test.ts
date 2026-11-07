import { describe, expect, it } from 'vitest';
import { mountApp } from '@gable/testing';
import { routes } from '../routes.js';
import scenes from './todo-app.scenes.js';
import { TodoApp } from './todo-app.js';

// The page-mode scenarios, run the way the Designer runs them: the app's router, the scenario's providers, its `url`.
const open = (name: keyof typeof scenes.scenes) => {
  const scene = scenes.scenes[name];
  return mountApp(TodoApp, { routes, url: 'url' in scene ? scene.url : '/', providers: scene.providers });
};

describe('todo-app scenarios', () => {
  it('Empty shows no list', () => {
    expect(open('Empty').query('.todo-list')).toBeNull();
  });

  it('Mixed list opens on the Active filter with the open todos', async () => {
    const app = open('Mixed list');
    await app.settle();
    expect(app.location.url).toBe('/active');
    expect(app.text()).toContain('Buy milk');
    expect(app.text()).toContain('Write the report');
    expect(app.text()).not.toContain('Walk the dog');
  });
});
