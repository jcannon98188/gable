import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import { PlainApp, VirtualApp } from './app.js';

const mode = new URLSearchParams(location.search).get('mode');
bootstrap(mode === 'plain' ? PlainApp : VirtualApp, { renderer: dom(), target: '#app' });
