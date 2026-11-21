import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { Gallery } from './gallery.js';

bootstrap(Gallery, { renderer: dom(), target: '#app' });
