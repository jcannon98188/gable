import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { OtpDemo } from './otp-demo.js';

// A separate page (`/otp.html`) so the main gallery stays untouched.
bootstrap(OtpDemo, { renderer: dom(), target: '#app' });
