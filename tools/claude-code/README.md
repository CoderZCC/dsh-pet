# Claude Code 任务联动

使用 Claude Code 的 command hooks，把本轮状态发送到桌宠现有 HTTP 接口。
需要 Node.js 22.12+、运行中的桌宠（DSH 或独立模式），无需额外依赖。

## 配置

在仓库根目录执行（端口替换为桌宠服务实际端口）：

```sh
node tools/claude-code/hook.cjs --config http://127.0.0.1:3080
```

将输出的 `hooks` 合并到目标项目的 `.claude/settings.local.json`，或用户级
`~/.claude/settings.json`。已有配置请保留；同名事件的数组追加，不要覆盖原有 hooks。
生成结果包含当前 Node 和脚本的绝对路径，移动仓库或 Node 后需要重新生成。
在 Claude Code 的 `/hooks` 中检查加载结果；必要时重新打开会话。
此命令只输出配置，不修改本机 Claude 设置。

## 行为

| 事件 | 桌宠状态 |
| --- | --- |
| 提交提示词 | 思考 |
| 执行工具 | 工作 |
| 工具返回 | 继续思考 |
| 工具失败 / 本轮 API 错误 | 出错 |
| 权限请求 / 提问 / 等待确认通知 | 等待 |
| 压缩上下文 | 整理 |
| Stop | 本轮回复完成（不代表项目通过验收） |
| SessionEnd | 清除外部状态 |

只传固定简短文案，不传提示词、命令、文件内容、工具参数或会话记录。
请求 1.5 秒超时；服务不可用时写 stderr 并正常退出，不阻止 Claude 执行。
独立模式自动从 `$DSH_HOME/dsh-pet/standalone-runtime.json`（默认 `~/.dsh`）
读取匹配端口的运行令牌，不将令牌写入 Claude 配置或日志。
不启用异步 hooks，以减少同一会话状态乱序。

目前适用于单个 Claude Code 会话。桌宠的外部状态是全局共享槽，多会话、
其他外部集成会互相覆盖；会话结束也会清空该槽。强制终止进程可能不触发
SessionEnd，此时状态可能残留，下一次事件会覆盖它。
不监听 Claude 网页聊天，也不接入 Codex。

## 验证

```sh
node --test tools/claude-code/hook.test.cjs
```

测试覆盖事件映射、真实本地 HTTP 请求、状态清理、敏感输入不转发、配置生成与失败退出。
实际使用时先启动桌宠，再在已配置的 Claude Code 中提交任务、执行工具、触发授权并结束会话，
检查动画和气泡。卸载时只删除新增的 hook 条目即可。
