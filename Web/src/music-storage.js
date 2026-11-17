import { musicTracks } from '../public/music-library.js';

const paths = new Set(musicTracks.map(track => track.id === 'circles' ? '/music.mp3' : `/music-files/${track.id}.mp3`));

// Only service bindings can reach this Worker; its public and preview URLs are disabled.
export default {
  fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    if (!paths.has(new URL(request.url).pathname)) return new Response(null, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
