// Signing in and out, in the browser: BetterAuth's endpoints, as the old UI
// uses them (js/storage.js).

const post = (path: string, body: object) =>
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Goes to Google, which sends the browser back to this page, signed in. */
export async function signInWithGoogle() {
  const here = location.href
  const res = await post('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: here,
    errorCallbackURL: here,
  })
  const data = (await res.json().catch(() => ({}))) as {
    url?: string
    message?: string
  }
  if (!res.ok || !data.url)
    throw new Error(data.message || 'Could not start sign-in')
  sessionStorage.setItem('signingIn', '1')
  location.href = data.url
}

export async function signOut() {
  await post('/api/auth/sign-out', {})
}
