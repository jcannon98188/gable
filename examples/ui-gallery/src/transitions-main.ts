import { bootstrap } from '@gable/core';
import { provideRouter } from '@gable/core/router';
import { dom } from '@gable/renderer-dom';
import { TransitionsDemo, transitionRoutes } from './transitions-demo.js';

bootstrap(TransitionsDemo, { renderer: dom(), target: '#app', providers: provideRouter(transitionRoutes) });
