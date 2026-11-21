import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { ToastDemo } from './toast-demo.js';

// A separate page (`/toast.html`) so the main gallery stays untouched.
bootstrap(ToastDemo, { renderer: dom(), target: '#app' });
