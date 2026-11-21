import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { HttpDemo } from './http-demo.js';

// A separate page (`/http.html`). There is no backend behind `/api/users`, so it shows its error state until a Designer
// scenario (`http-demo.scenes.ts`) mocks the HTTP backend.
bootstrap(HttpDemo, { renderer: dom(), target: '#app' });
