export default function userCan(req, ...permissions) {
  const { token_owner } = req

  const userHasAllPermissions = permissions.every((permission) => token_owner?.capabilities?.includes(permission))
  console.log("userHasAllPermissions", userHasAllPermissions)

  return userHasAllPermissions
}
