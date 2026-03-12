const ROOT_ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ROOT_ADMIN_EMAIL || 'admin@usach.cl').toLowerCase();

export const ROLES = {
  STUDENT: "estudiante",
  STAFF: "funcionario",
  DOC_ADMIN: "administrador de documentos",
  ADMIN: "admin",
};

export const isRootAdminEmail = (email = '') => email.toLowerCase() === ROOT_ADMIN_EMAIL;

export function can(role, perm) {
  if (role === ROLES.ADMIN) return true;

  switch (perm) {
    case "chat":
      return [ROLES.STUDENT, ROLES.STAFF, ROLES.DOC_ADMIN].includes(role);
    case "manage_users":
      return [ROLES.STAFF].includes(role);
    case "manage_docs":
      return [ROLES.DOC_ADMIN].includes(role);
    default:
      return false;
  }
}