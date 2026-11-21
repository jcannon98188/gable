import { bootstrap } from '@gablejs/core';
import { provideRouter } from '@gablejs/core/router';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { TransitionsDemo, transitionRoutes } from './transitions-demo.js';

bootstrap(TransitionsDemo, { renderer: dom(), target: '#app', providers: provideRouter(transitionRoutes) });
