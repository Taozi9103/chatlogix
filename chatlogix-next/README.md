# ChatLogix - Next.js 版本

这是 ChatLogix 项目的 Next.js 全栈版本，将原来的 Express + React 架构完全迁移到了 Next.js。

## 项目结构

```
chatlogix-next/
├── src/
│   ├── app/
│   │   ├── api/              # API 路由
│   │   │   ├── auth/         # 认证相关 API
│   │   │   ├── chat/         # 聊天相关 API
│   │   │   ├── conversations/ # 会话管理 API
│   │   │   └── init-db/      # 数据库初始化 API
│   │   ├── login/             # 登录页面
│   │   ├── register/          # 注册页面
│   │   ├── page.tsx           # 主聊天页面
│   │   ├── layout.tsx         # 根布局
│   │   └── globals.css        # 全局样式
│   ├── components/            # React 组件
│   │   ├── MessageList.tsx
│   │   ├── ConversationList.tsx
│   │   └── RoleSelector.tsx
│   └── lib/                   # 工具库
│       ├── db.ts              # 数据库连接
│       ├── auth.ts            # 认证工具
│       └── roles.ts           # 角色配置
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.example
```

## 开始使用

### 1. 安装依赖

```bash
cd chatlogix-next
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写相关配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=chatlogix

# JWT 密钥
JWT_SECRET=your_jwt_secret_key

# DeepSeek API
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### 3. 初始化数据库

首先确保 MySQL 服务已启动，然后访问以下 URL 来初始化数据库：

```
http://localhost:3000/api/init-db
```

或者在第一次运行时，数据库也会自动初始化。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 功能特性

- ✅ 用户注册和登录
- ✅ JWT 认证
- ✅ 多会话管理
- ✅ 多种 AI 角色选择
- ✅ 流式对话（SSE）
- ✅ 消息历史记录
- ✅ 响应式设计

## API 路由

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 聊天
- `GET /api/chat/roles` - 获取角色列表
- `POST /api/chat/send` - 发送消息（非流式）
- `POST /api/chat/stream` - 发送消息（流式 SSE）

### 会话
- `GET /api/conversations` - 获取会话列表
- `POST /api/conversations` - 创建新会话
- `GET /api/conversations/:id` - 获取会话详情
- `PUT /api/conversations/:id` - 更新会话
- `DELETE /api/conversations/:id` - 删除会话

### 工具
- `GET /api/init-db` - 初始化数据库

## 构建和部署

### 构建生产版本

```bash
npm run build
```

### 启动生产服务器

```bash
npm start
```

## 技术栈

- **Next.js 15** - React 框架
- **React 19** - UI 库
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式框架
- **MySQL 2** - 数据库驱动
- **JWT** - 认证
- **bcryptjs** - 密码加密
