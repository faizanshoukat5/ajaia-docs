/**
 * Next compiles this file for every runtime it supports, including Edge — even
 * when nothing in the app targets Edge. So this file must stay free of Node
 * built-ins and Node APIs, or the bundler reports (harmless but alarming)
 * "a Node.js module is loaded which is not supported in the Edge Runtime"
 * errors against `node:crypto` and `process.exit`.
 *
 * All the real work therefore lives in `./instrumentation-node`, behind a
 * runtime check. This is the pattern Next documents for exactly this reason.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNode } = await import("./instrumentation-node");
  await registerNode();
}
