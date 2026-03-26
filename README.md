# 笛子与清子家宴定制

## 项目概述

笛子与清子家宴定制是一个家宴菜品管理和订单系统，用户可以浏览菜单、下单、查看订单历史，管理员可以管理菜品和订单状态。系统还集成了AI推荐功能，为用户提供健康菜品推荐。

## 技术栈

### 前端
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide React

### 后端
- Node.js
- Express
- TypeScript
- Supabase (数据库)
- Google Gemini API (AI推荐)
- JWT (认证)

## 系统架构

### 前端架构
- 单页面应用 (SPA)
- 组件化设计
- 状态管理: React useState
- API调用: 封装在 `src/services/api.ts` 中

### 后端架构
- RESTful API设计
- 模块化结构
- 中间件: 认证、CORS
- 数据库: Supabase PostgreSQL

## 安装和运行步骤

### 1. 前端设置

1. 安装依赖
```bash
npm install
```

2. 配置环境变量
创建 `.env` 文件，添加以下内容：
```
VITE_GEMINI_API_KEY=your-gemini-api-key
```

3. 运行开发服务器
```bash
npm run dev
```

### 2. 后端设置

1. 安装依赖
```bash
cd backend
npm install
```

2. 配置环境变量
创建 `.env` 文件，添加以下内容：
```
# Supabase配置
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# JWT配置
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h

# Google AI配置
GEMINI_API_KEY=your-gemini-api-key

# 服务器配置
PORT=3001
```

3. 运行开发服务器
```bash
npm run dev
```

### 3. Supabase数据库设置

1. 创建Supabase项目
2. 在Supabase控制台中，执行 `backend/config/init-db.sql` 中的SQL语句，创建所需的表结构
3. 配置Supabase的认证设置，启用邮箱/密码认证

## API接口说明

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/logout` - 用户退出登录

### 菜品相关
- `GET /api/dishes` - 获取所有菜品
- `GET /api/dishes/:id` - 获取单个菜品
- `POST /api/dishes` - 创建菜品
- `PUT /api/dishes/:id` - 更新菜品
- `DELETE /api/dishes/:id` - 删除菜品

### 订单相关
- `GET /api/orders` - 获取所有订单
- `GET /api/orders/:id` - 获取单个订单
- `POST /api/orders` - 创建订单
- `PUT /api/orders/:id/status` - 更新订单状态
- `DELETE /api/orders/:id` - 删除订单

### AI推荐相关
- `GET /api/ai/recommendations` - 获取健康菜品推荐

## 数据库设计

### users表
| 字段名 | 数据类型 | 约束 | 描述 |
|-------|---------|------|------|
| id | TEXT | PRIMARY KEY | 用户ID |
| email | TEXT | UNIQUE NOT NULL | 邮箱 |
| name | TEXT | NOT NULL | 用户名 |
| avatar_url | TEXT | | 头像URL |
| role | TEXT | CHECK (role IN ('admin', 'member')) DEFAULT 'member' | 角色 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

### dishes表
| 字段名 | 数据类型 | 约束 | 描述 |
|-------|---------|------|------|
| id | TEXT | PRIMARY KEY DEFAULT gen_random_uuid() | 菜品ID |
| name | TEXT | NOT NULL | 菜品名称 |
| description | TEXT | | 菜品描述 |
| category | TEXT | CHECK (category IN ('Lunch', 'Snack', 'Creative')) NOT NULL | 菜品分类 |
| imageUrl | TEXT | NOT NULL | 菜品图片URL |
| creatorId | TEXT | REFERENCES users(id) | 创建者ID |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

### orders表
| 字段名 | 数据类型 | 约束 | 描述 |
|-------|---------|------|------|
| id | TEXT | PRIMARY KEY DEFAULT gen_random_uuid() | 订单ID |
| userId | TEXT | REFERENCES users(id) | 用户ID |
| userName | TEXT | NOT NULL | 用户名 |
| items | JSONB | NOT NULL | 订单物品 |
| status | TEXT | CHECK (status IN ('pending', 'preparing', 'ready', 'completed')) DEFAULT 'pending' | 订单状态 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

## 前端功能说明

### 主要页面
1. **登录页面** - 用户登录
2. **菜单页面** - 浏览菜品、添加到购物车
3. **订单页面** - 查看订单历史、更新订单状态
4. **管理页面** - 管理菜品（添加、编辑、删除）
5. **AI灵感页面** - 获取健康菜品推荐

### 核心功能
- 用户认证（登录、注册、退出）
- 菜品管理（浏览、添加、编辑、删除）
- 订单管理（创建、查看、更新状态）
- AI菜品推荐

## 后端功能说明

### 核心功能
- 用户认证和授权
- 菜品CRUD操作
- 订单CRUD操作
- AI推荐服务

### 安全措施
- JWT token认证
- 角色权限控制
- 输入验证
- 错误处理

## 部署指南

### 前端部署
1. 构建生产版本
```bash
npm run build
```
2. 部署到静态网站托管服务（如Vercel、Netlify、GitHub Pages等）

### 后端部署
1. 构建生产版本
```bash
cd backend
npm run build
```
2. 部署到服务器（如Heroku、Vercel、AWS等）
3. 配置环境变量

## 常见问题和解决方案

### 1. 登录失败
- 检查邮箱和密码是否正确
- 检查Supabase认证设置是否正确
- 检查网络连接

### 2. 菜品添加失败
- 检查表单数据是否完整
- 检查用户权限
- 检查网络连接

### 3. 订单状态更新失败
- 检查用户权限（只有管理员可以更新订单状态）
- 检查网络连接

### 4. AI推荐加载失败
- 检查Google Gemini API密钥是否正确
- 检查网络连接

## 项目结构

### 前端结构
```
src/
  ├── components/    # 组件
  ├── services/      # API服务
  ├── lib/           # 工具函数
  ├── App.tsx        # 主应用
  ├── main.tsx       # 入口文件
  ├── types.ts       # 类型定义
  └── index.css      # 全局样式
```

### 后端结构
```
backend/
  ├── src/
  │   ├── controllers/    # 控制器
  │   ├── routes/         # 路由
  │   ├── middleware/     # 中间件
  │   ├── types/          # 类型定义
  │   ├── utils/          # 工具函数
  │   └── index.ts        # 主入口
  ├── config/             # 配置文件
  ├── package.json        # 依赖配置
  └── tsconfig.json       # TypeScript配置
```

## 许可证

Apache-2.0