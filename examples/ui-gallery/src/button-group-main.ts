import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { ButtonGroupDemo } from './button-group-demo.js';

// A separate page (`/button-group.html`) so the main gallery stays untouched.
bootstrap(ButtonGroupDemo, { renderer: dom(), target: '#app' });
