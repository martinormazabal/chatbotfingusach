export const ROLES = {
    STUDENT: "estudiante",
    STAFF: "funcionario",
    DOC_ADMIN: "administrador de documentos",
    ADMIN: "admin",
  };
  
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