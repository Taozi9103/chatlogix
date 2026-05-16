import { z } from 'zod';

// ==================== 用户认证 ====================

export const registerSchema = z.object({
  username: z
    .string({ message: '用户名不能为空' })
    .min(2, '用户名至少 2 个字符')
    .max(50, '用户名不能超过 50 个字符')
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, '用户名只能包含字母、数字、下划线和中文'),
  password: z
    .string({ message: '密码不能为空' })
    .min(6, '密码至少 6 个字符')
    .max(100, '密码不能超过 100 个字符'),
});

export const loginSchema = z.object({
  username: z.string({ message: '用户名不能为空' }).min(1, '请输入用户名'),
  password: z.string({ message: '密码不能为空' }).min(1, '请输入密码'),
});

// ==================== 聊天消息 ====================

export const sendMessageSchema = z.object({
  message: z
    .string({ message: '消息不能为空' })
    .min(1, '消息不能为空')
    .max(10000, '消息不能超过 10000 个字符')
    .trim(),
  conversationId: z.number().int().positive().optional().nullable(),
  roleId: z
    .string()
    .min(1, '角色 ID 不能为空')
    .max(50, '角色 ID 不能超过 50 个字符')
    .optional()
    .default('assistant'),
});

// ==================== 会话管理 ====================

export const createConversationSchema = z.object({
  title: z
    .string()
    .max(100, '标题不能超过 100 个字符')
    .optional()
    .default('新对话'),
  roleId: z
    .string()
    .max(50, '角色 ID 不能超过 50 个字符')
    .optional()
    .default('assistant'),
});

export const updateConversationSchema = z.object({
  title: z
    .string({ message: '标题不能为空' })
    .min(1, '标题不能为空')
    .max(100, '标题不能超过 100 个字符')
    .trim(),
});

export const conversationIdSchema = z
  .number({ message: '会话 ID 不能为空' })
  .int('会话 ID 必须是整数')
  .positive('会话 ID 必须是正整数');

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ==================== 标签管理 ====================

export const createTagSchema = z.object({
  name: z
    .string({ message: '标签名不能为空' })
    .min(1, '标签名不能为空')
    .max(50, '标签名不能超过 50 个字符')
    .trim(),
});

export const setTagsSchema = z.object({
  tagIds: z
    .array(z.number().int().positive('标签 ID 必须是正整数'))
    .min(1, '标签列表不能为空')
    .max(20, '标签数量不能超过 20 个'),
});

// ==================== 工具函数 ====================

/**
 * 格式化 Zod 校验错误为字符串数组
 * Zod 4.x 使用 `issues` 而非 `errors`
 */
export function formatZodErrors(error: any): string[] {
  const issues = error.issues ?? error.errors ?? [];
  return issues.map((e: any) => {
    const path = e.path.length > 0 ? `[${e.path.join('.')}] ` : '';
    return `${path}${e.message}`;
  });
}

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = formatZodErrors(result.error);
    throw new ValidationError(messages);
  }
  return result.data;
}

export class ValidationError extends Error {
  messages: string[];

  constructor(messages: string[]) {
    super(messages.join('; '));
    this.name = 'ValidationError';
    this.messages = messages;
  }
}
