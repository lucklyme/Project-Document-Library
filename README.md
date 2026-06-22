# Project Document Library

Project Document Library 是一个适合部署在 NAS / Docker 环境中的工程文档管理系统，用于 PDF 文档版本管理、在线预览、变更单管理、权限控制、审计日志和水印追踪。

系统按“一个 Docker 实例对应一个项目”设计。如果需要管理多个项目，建议部署多个容器，并为每个容器挂载独立的数据目录。

## 功能特性

- 上传 PDF 文档，并自动解析 `文件编号 Rev.版本 文件标题.pdf`。
- 上传变更单，并按 `文件编号-XG-流水号 变更标题.pdf` 自动关联主文档。
- 自动维护同一文件编号下的当前在用版本。
- 保留历史版本和关联变更单。
- 支持文档作废和恢复在用。
- 支持按文件编号、标题、版本、变更单、原始文件名搜索。
- 支持 PDF 在线预览。
- 支持导出当前在用文档清单 CSV。
- 支持应用内账号体系：一般员工、资料员、管理员。
- 支持强密码策略、登录失败锁定、邮件重置密码。
- 支持管理员配置 SMTP 邮箱服务。
- 支持登录、预览、下载、上传、维护、后台配置、异常访问等审计日志。
- 支持可配置 PDF 预览水印。

## 角色权限

| 角色 | 权限 |
| --- | --- |
| 一般员工 | 登录、搜索、查看详情、在线预览。 |
| 资料员 | 一般员工权限 + 上传、下载、导出、替换文件、作废/恢复文档。 |
| 管理员 | 资料员权限 + 用户管理、邮箱配置、水印配置、审计日志查看和导出。 |

## 本地开发

安装依赖：

```bash
npm install
```

生成初始管理员密码哈希：

```bash
npm run hash-password -- "Your-Strong-Password"
```

创建 `.env.local`：

```env
APP_PROJECT_NAME=本地文档资料库
DATA_DIR=./data
AUTH_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=replace-with-generated-password-hash
NEXT_TELEMETRY_DISABLED=1
```

启动开发服务：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

## Docker 部署

```bash
docker compose up -d --build
```

访问：

```text
http://NAS-IP:3000
```

关键环境变量：

- `APP_PROJECT_NAME`：页面显示的项目名称。
- `DATA_DIR`：容器内数据根目录，默认 `/data`。
- `AUTH_SECRET`：用于签名登录会话和加密敏感配置的长随机密钥。
- `ADMIN_EMAIL`：首次启动时创建的管理员邮箱。
- `ADMIN_PASSWORD_HASH`：首次启动时创建的管理员密码哈希。

持久化目录：

- `/data/files`：上传的 PDF 文件。
- `/data/db`：SQLite 数据库。

部署第二个项目时，复制 compose 服务，修改端口和宿主机数据目录，例如：

```yaml
ports:
  - "3001:3000"
volumes:
  - ./data/project-b/files:/data/files
  - ./data/project-b/db:/data/db
```

## 初始管理员

首次启动时，如果数据库中没有管理员账号，系统会使用 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD_HASH` 创建初始管理员。

密码要求：

- 至少 12 位。
- 包含小写字母。
- 包含大写字母。
- 包含数字。
- 包含特殊字符。
- 不能包含邮箱用户名。

## 邮箱服务

管理员可在 `/admin/mail` 配置 SMTP 邮箱服务，用于发送密码重置邮件。

阿里云邮箱通常需要配置：

- SMTP 主机。
- SMTP 端口。
- SSL/TLS 开关。
- 邮箱账号。
- 授权码或 SMTP 密码。
- 发件人名称和发件邮箱。

SMTP 授权码会使用 `AUTH_SECRET` 派生密钥加密后保存。修改 `AUTH_SECRET` 会导致已保存的 SMTP 授权码和现有登录会话失效。

## 审计日志

系统会记录以下关键行为：

- 登录成功、登录失败、账号锁定、退出登录。
- PDF 在线预览、下载、导出。
- 上传、替换、作废、恢复文档。
- 用户管理、邮箱配置、水印配置。
- 密码重置请求和重置结果。
- 权限拒绝、文件不存在、异常访问。

普通首页访问、详情页打开等低价值浏览行为不会重复写入审计日志，避免日志过度膨胀。

审计日志仅管理员可查看和导出。系统界面不提供日志修改和删除入口。日志包含哈希链字段，用于辅助发现数据库层面的篡改风险。

## 水印

管理员可在 `/admin/watermark` 配置 PDF 在线预览水印。

支持模式：

- 边缘 + 极淡正文水印。
- 仅边缘水印。
- 关闭水印。

支持调整水印透明度。水印用于追责和降低外传风险，但无法绝对阻止截图或拍照。

## 文件命名规则

版本文件推荐格式：

```text
PRJ-AX42-MECH-9081 Rev.A 示例设备基础布置图.pdf
```

系统会解析：

- 文件编号：`PRJ-AX42-MECH-9081`
- 版本：`Rev.A`
- 标题：`示例设备基础布置图`

变更单推荐格式：

```text
PRJ-QZ77-ELEC-4820-XG-773 示例电缆路径调整通知.pdf
```

系统会解析：

- 文件编号：`PRJ-QZ77-ELEC-4820`
- 变更流水号：`XG-773`
- 标题：`示例电缆路径调整通知`

上传变更单前，必须先存在对应文件编号的主文档版本。

## 安全建议

- 不要提交 `.env.local`、SQLite 数据库、上传的 PDF、日志和构建产物。
- NAS 反向代理访问时建议启用 HTTPS。
- `AUTH_SECRET` 应使用足够长的随机字符串。
- 定期备份 `DATA_DIR`。
- NAS 部署建议优先通过内网或 VPN 访问。

## Synology SSO 登录

系统支持使用群晖 SSO/OIDC 作为主登录方式。启用后，用户通过 NAS 账号登录，文档系统只维护角色和启用状态。

环境变量：

```env
AUTH_MODE=sso
APP_BASE_URL=https://your-domain-or-nas:13000
SSO_ISSUER_URL=https://your-synology-sso-issuer
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret
SSO_SCOPE="openid profile email"
SSO_LOCAL_ADMIN_FALLBACK=1
```

在群晖 SSO 客户端中配置回调地址：

```text
https://your-domain-or-nas:13000/api/auth/sso/callback
```

首次 SSO 登录的用户会自动创建为“一般员工”。管理员可在后台用户管理中调整为“资料员”或“管理员”。`/login/local-admin` 是本地管理员应急入口，用于 SSO 配置异常时进入后台。
