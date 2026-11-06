import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import { App } from './components/app.js';

bootstrap(App, { renderer: dom(), target: '#main' });
