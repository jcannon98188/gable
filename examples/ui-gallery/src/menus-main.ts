import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { MenusDemo } from './menus-demo.js';

// A separate page (`/menus.html`) so the main gallery stays untouched.
bootstrap(MenusDemo, { renderer: dom(), target: '#app' });
