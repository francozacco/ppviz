const SESSION_KEY = 'ppviz_tab_session';

// sessionStorage (unlike cookies) is scoped per browser tab, so this gives
// each tab its own id even though tabs in the same browser share cookies.
function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-Session-Id', getSessionId());
  return fetch(url, { ...options, headers });
}
