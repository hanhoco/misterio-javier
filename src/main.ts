import './ui/styles.css';
import { announceBuild } from './buildInfo';
import { installGlobalErrorLogging } from './diagnosticsLog';
import { mountApp } from './ui/app';

// First thing in the log, before anything can fail: which build is this?
announceBuild();
installGlobalErrorLogging();

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root element');

mountApp(root);
