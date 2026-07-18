# SECURITY_INVARIANTS

> **Round-3**:SSRF 由 **strict-on 行为 Gate** 强制(`scripts/security-check.ts`
> 驱动真实 crawler 跑 52 条对抗用例,非源码关键词匹配),`pnpm security:check`
> 默认 strict;修复了 slowloris-body 超时 DoS。Provider Mode `REAL` 未授权抛错。

## Crawler SSRF 防护（Agent C，`src/security/crawler/`）

必须阻止请求以下目标：

- `localhost`
- `127.0.0.0/8`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- IPv6 本地和私网
- link-local
- 云 Metadata 地址
- DNS rebinding
- 重定向到私网
- 含用户名密码的 URL
- 非 HTTP/HTTPS 协议

## Crawler 必须

- 手工处理重定向；
- 每次重定向重新校验；
- DNS 解析后校验 IP；
- 限制响应体大小；
- 限制超时；
- 限制抓取页数；
- 限制 Content-Type。

## 日志脱敏

日志不得输出：API Key / Authorization Header / 数据库密码 / 完整 Prompt /
完整 Provider 响应 / 完整 publicToken / 手机号 / 联系人敏感信息。

## GitHub / 敏感数据

仓库当前为 **Public**。任何 API Key、数据库连接串、手机号、完整 publicToken、
Provider 响应、真实客户未脱敏数据或私有运行日志都不得提交。真实运行 Artifacts
必须进入 `E:\企业诊断智能体_private`（不在仓库内）或 `.gitignore` 覆盖的目录。

## 联系方式

用户提供的联系人和联系方式只用于咨询承接，**不得进入公开报告 Payload**，也不得进入
Deep View。
