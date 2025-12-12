import { OpenAPIHono } from '@hono/zod-openapi';
import health from './health';
import render from './render';
import parse from './parse';
import validate from './validate';

const v1 = new OpenAPIHono();

v1.route('/health', health);
v1.route('/render', render);
v1.route('/parse', parse);
v1.route('/validate', validate);

export default v1;
