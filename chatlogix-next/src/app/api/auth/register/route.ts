import { NextRequest } from 'next/server';
import { forwardJson } from '@/lib/pythonProxy';

export async function POST(request: NextRequest) {
  return forwardJson(request, '/v1/auth/register');
}
