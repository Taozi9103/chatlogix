import { NextRequest } from 'next/server';
import { forwardJson } from '@/lib/pythonProxy';

export async function GET(request: NextRequest) {
  return forwardJson(request, '/v1/conversations');
}

export async function POST(request: NextRequest) {
  return forwardJson(request, '/v1/conversations');
}
