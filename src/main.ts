import './ui/styles.css';
import { announceBuild } from './buildInfo';
import { mountApp } from './ui/app';

// First thing in the log, before anything can fail: which build is this?
announceBuild();

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root element');

mountApp(root);
