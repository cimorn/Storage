'use strict';
const { parentPort } = require('node:worker_threads');
const { transformCardImage } = require('./card-image-transform');
parentPort.once('message', async input => {
  const result = await transformCardImage(input);
  parentPort.postMessage(result);
});
