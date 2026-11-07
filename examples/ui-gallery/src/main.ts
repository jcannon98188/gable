import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { Gallery } from './gallery.js';

bootstrap(Gallery, { renderer: dom(), target: '#app' });
