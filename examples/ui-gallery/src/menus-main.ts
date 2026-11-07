import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { MenusDemo } from './menus-demo.js';

// A separate page (`/menus.html`) so the main gallery stays untouched.
bootstrap(MenusDemo, { renderer: dom(), target: '#app' });
