import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

export interface User {
  userId: number;
  username: string;
}

export function verifyToken(token: string): User | null {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    return {
      userId: decoded.userId ?? decoded.id,
      username: decoded.username
    };
  } catch (err) {
    return null;
  }
}

export function getAuthUser(req: NextRequest): User | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  
  const token = authHeader.split(' ')[1];
  if (!token) return null;
  
  return verifyToken(token);
}
