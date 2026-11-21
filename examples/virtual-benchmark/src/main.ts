import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import { PlainApp, VirtualApp } from './app.js';

const mode = new URLSearchParams(location.search).get('mode');
bootstrap(mode === 'plain' ? PlainApp : VirtualApp, { renderer: dom(), target: '#app' });
