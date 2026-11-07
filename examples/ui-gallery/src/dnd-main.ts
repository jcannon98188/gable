import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { DndExamples } from './dnd-examples.js';

bootstrap(DndExamples, { renderer: dom(), target: '#app' });
