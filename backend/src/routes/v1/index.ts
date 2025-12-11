import { Hono } from 'hono';
import health from './health';
import render from './render';
import parse from './parse';
import validate from './validate';

const v0 = new Hono();

v0.route('/health', health);
v0.route('/render', render);
v0.route('/parse', parse);
v0.route('/validate', validate);

export default v0;
