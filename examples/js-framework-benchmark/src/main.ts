import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import { App } from './components/app.js';

bootstrap(App, { renderer: dom(), target: '#main' });
