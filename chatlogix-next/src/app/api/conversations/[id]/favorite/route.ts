import { NextRequest } from 'next/server';
import { forwardJson } from '@/lib/pythonProxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardJson(request, `/v1/conversations/${id}/favorite`);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardJson(request, `/v1/conversations/${id}/favorite`);
}
