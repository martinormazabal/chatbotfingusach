export const ADMIN_EMAIL = 'admin@usach.cl';

export const getStoredUser = () => {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem('authUser');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.email) return null;

    const normalizedEmail = parsed.email.toLowerCase();
    const normalizedRole = (parsed.role || '').toLowerCase();

    return {
      ...parsed,
      email: normalizedEmail,
      role: normalizedEmail === ADMIN_EMAIL ? 'admin' : normalizedRole,
    };
  } catch {
    return null;
  }
};

export const hasRole = (user, allowedRoles = []) => {
  if (!user?.role) return false;
  return allowedRoles.includes(user.role);
};

export const authHeaders = (user) => ({
  'x-user-email': user?.email || '',
  'x-user-role': user?.role || '',
});