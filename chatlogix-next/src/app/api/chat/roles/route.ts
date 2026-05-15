import { getAllRoles } from '@/lib/roles';
import { ok, withApi } from '@/lib/api';

export const GET = withApi(async (request) => {
  const roles = getAllRoles();
  return ok(request, { roles });
});
