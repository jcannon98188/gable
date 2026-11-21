import { bootstrap } from '@gablejs/core';
import { provideRouter } from '@gablejs/core/router';
import { dom } from '@gablejs/renderer-dom';
import 'todomvc-common/base.css';
import 'todomvc-app-css/index.css';
import './app.css';
import { TodoApp } from './components/todo-app.js';
import { routes } from './routes.js';

bootstrap(TodoApp, { renderer: dom({ mode: 'hash' }), providers: provideRouter(routes), target: '#app' });
