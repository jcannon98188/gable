import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { DrawerDemo } from './drawer-demo.js';

bootstrap(DrawerDemo, { renderer: dom(), target: '#app' });
