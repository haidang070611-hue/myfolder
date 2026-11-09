// Hook nạp module cho Node: 'three' -> bản giả, '/js/..' và '/games/..' -> thư mục public
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: pathToFileURL(path.join(root, 'test', 'three-stub.mjs')).href, shortCircuit: true };
  if (spec.startsWith('/js/') || spec.startsWith('/games/')) return { url: pathToFileURL(path.join(root, 'public', spec)).href, shortCircuit: true };
  return next(spec, ctx);
}
