import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { DrawerDemo } from './drawer-demo.js';

bootstrap(DrawerDemo, { renderer: dom(), target: '#app' });
