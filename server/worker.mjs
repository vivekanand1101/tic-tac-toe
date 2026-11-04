import { handleApi } from './api.mjs';

const sitePath = '/slops/tic-tac-toe';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === sitePath) {
      url.pathname += '/';
      return Response.redirect(url.href, 308);
    }
    // Keep relative asset/API URLs working on both workers.dev and the personal site.
    if (url.pathname.startsWith(sitePath + '/')) {
      url.pathname = url.pathname.slice(sitePath.length);
      request = new Request(url, request);
    }
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
