export function userRoles(user) {
  if (Array.isArray(user?.roles) && user.roles.length) return user.roles;
  return [user?.role || "User"].filter(Boolean);
}

export function hasRole(user, roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return userRoles(user).some((role) => allowed.includes(role));
}

export function roleLabel(user) {
  return userRoles(user).join(", ") || "User";
}
