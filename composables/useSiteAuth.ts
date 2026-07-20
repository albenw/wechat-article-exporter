export interface SiteUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  enabled: boolean;
}

export default () => {
  const user = useState<SiteUser | null>('site-auth-user', () => null);
  const loaded = useState<boolean>('site-auth-loaded', () => false);

  async function refresh() {
    const response = await $fetch<{ authenticated: boolean; user: SiteUser | null }>('/api/auth/session');
    user.value = response.user;
    loaded.value = true;
    return response;
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'DELETE' });
    user.value = null;
  }

  return { user, loaded, refresh, logout };
};
