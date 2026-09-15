import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, userForToken, type SessionUser } from './auth';

/* Session cookie handling, in one place so no route invents its own flags.
   httpOnly means a script cannot read it — including any script that ends up
   on the page by accident, which matters more on a product used by minors. */

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return userForToken(store.get(SESSION_COOKIE)?.value);
}

export async function currentToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
