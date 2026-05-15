import { NextRequest } from 'next/server';
import { forwardJson } from '@/lib/pythonProxy';

export async function GET(request: NextRequest) {
  return forwardJson(request, '/v1/init-db');
}
