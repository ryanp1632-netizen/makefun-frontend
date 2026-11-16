const ROUTES = [
  [/^#\/?$/, 'board', () => [import('./board.js')], () => ['/competitions?status=open&activity=times']],
  [/^#\/bounty\/([\w-]+)\/?$/, 'bounty', () => [import('./board.js'), import('./bounty.js')], (s) => ['/competitions?status=open&activity=times', `/competitions/${s}?submissions=summary`]],
  [/^#\/bounty\/([\w-]+)\/leaderboard$/, 'leaderboard', () => [import('./leaderboard.js')], (s) => [`/competitions/${s}/leaderboard?rows=first`, `/competitions/${s}?submissions=summary`]],
  [/^#\/u\/([\w.-]+)$/, 'profile', () => [import('./profile.js')], (h) => [`/profiles/${h}`]],
];

async function route() {
  const my = (route.seq = (route.seq || 0) + 1), hash = location.hash || '#/';
  window.__shotReady = false;
  const [re, name, load, paths] = ROUTES.find(([re]) => re.test(hash)) ?? ROUTES[0];
  const arg = decodeURIComponent(hash.match(re)?.[1] ?? '');
  document.body.dataset.route = name;
  try {
    const views = Promise.all(load()), api = await import('./api.js');
    api.resetViewStats();
    api.prefetchRoute(paths(arg));
    for (const view of await views) if (my == route.seq) await view.default(arg, name);
    (await import('./ui.js')).tickCountdowns();
  } catch (e) {
    document.querySelector('main').lastChild.textContent = 'Could not load this view: ' + e.message;
  }
  if (my == route.seq) window.__shotReady = true;
}
addEventListener('hashchange', route);
route();
