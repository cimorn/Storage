'use strict';
const { createWebpImage } = require('./image-transform');
const MAX_PIXELS = 8 * 1000 * 1000;

async function transformCardImage(input) {
  const bytes = Buffer.from(input.bytes), mime = input.mime;
  const fallback = { bytes, mime };
  try {
    const result = await createWebpImage({ bytes, mime }, { longEdge: 384, quality: 65, maxPixels: MAX_PIXELS });
    return result.bytes.length < bytes.length ? result : fallback;
  } catch {
    // Reads of legacy originals remain available even if a thumbnail cannot be
    // decoded safely or its native worker times out.
    return fallback;
  }
}
module.exports = { transformCardImage, MAX_PIXELS };
