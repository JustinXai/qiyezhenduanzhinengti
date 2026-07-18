READY_FOR_SSRF_STRICT_INTEGRATION

# Agent J — CHECKPOINT (Round-3, SSRF 严格行为 Gate)

分支 `cursor/ssrf-strict-behavior-gate`,基线 `b0e36dd`。全部注入 mock `fetchImpl`/`resolveHost`,
零真实网络 / 零真实 DNS,未调用博查/DeepSeek,未改 `.env`。

## 交付摘要

把 `pnpm security:check` 的 SSRF Gate 从**源码关键词匹配**改成**行为测试**:用一份对抗性语料
驱动**真实** guarded crawler,断言每条恶意目标被拒、合法公网流量仍成功。**默认 strict-on**——
Gate 在检测到任一 SSRF 缺陷时真实 `exit 1`。审计中发现并修复了 crawler 的一个真实缺陷(超时未覆盖
响应体读取),**未削弱** crawler。

## 文件清单

实现(所有权范围内):

- `scripts/security-check.ts` — 第 3 项检查从 `ssrfConfigRegressionHook`(grep 关键词)重写为
  `ssrfBehaviorGate`(行为断言),默认 strict;`main()` 改为 async。
- `src/security/crawler/guarded-crawler.ts` — **加强**:每跳 timeout 现在覆盖到流式响应体读取
  (`raceAbort` + signal-aware `readCappedText`),并捕获 body-read 异常;修复 slowloris-body 缺陷。
  未改动任何 SSRF 拦截逻辑(纯加强)。
- `src/security/crawler/ssrf-guard.ts` — **未改**(审计后确认分类逻辑完备;注入测试证明其行为正确)。

测试(所有权范围内):

- `tests/security/crawler/ssrf-behavior-cases.ts` — **新增**。对抗语料 + runner,**单一事实来源**,
  同时被 vitest gate 与 security-check gate 引用(不会 drift)。共 52 条 case。
- `tests/security/crawler/ssrf-behavior-gate.test.ts` — **新增**。vitest 镜像,`it.each` 逐条断言。
- `tests/security/crawler/guarded-crawler.test.ts` — **新增 1 条**:body-stall → TIMEOUT(锁定超时修复)。

## Commit 哈希(小步,已 push)

- `386d231` fix(crawler): bound streamed body read by per-hop timeout (slowloris-body)
- `b8dd8c4` feat(security-gate): replace grep SSRF hook with strict-by-default behavior gate

## Gate 结果

- `pnpm typecheck` → PASS(0 error)
- `pnpm lint` → PASS(0 error)
- `pnpm vitest run` → PASS(29 files / 354 tests;新增 +53)
- `pnpm security:check`(默认 strict-on) → PASS:`ssrf-gate: OK — all 52 adversarial SSRF case(s)`

### strict Gate 真实失败于注入缺陷的证明

临时注释掉 `ssrf-guard.ts` 里的 `[[10, 0, 0, 0], 8]`(10/8 私网块)后运行 `pnpm security:check`:

```
[security:check] ssrf-gate: FAILED — 6 SSRF behavior case(s) failed. The crawler stopped enforcing a real SSRF invariant:
  - ipv4: 10.0.0.0/8: expected REJECT but crawl() succeeded (finalUrl=http://10.1.2.3/)
  - dns: public name -> 10.0.0.5 (rebinding): expected REJECT but crawl() succeeded ...
  - dns: mixed public+private records — ALL must be public: expected REJECT ...
  - redirect -> DNS name resolving to private (rebinding at redirect): expected REJECT ...
  - redirect: multi-hop, last hop private: expected REJECT ...
  - rebinding across hops: DNS public first, private on re-resolution: expected REJECT ...
[security:check] FAILED — 6 violation(s) (secrets=0, banned-copy=0, ssrf=6)   → exit 1
```

一个缺陷同时触发 6 条(直连 / DNS 解析 / 混合记录 / 重定向 / 多跳 / 跨跳 rebinding),
这是 grep 关键词永远给不到的行为覆盖。随后 `git checkout` 还原,Gate 恢复绿。

## 覆盖对照(任务「必须拒绝 / 必须测试」)

必须拒绝(全部有 case): localhost / IPv4 私网(10、172.16、192.168、127、0.0.0.0、CGNAT)/
IPv6 私网(::1、::、fc00)/ link-local(169.254、fe80)/ metadata(literal、decimal、DNS、
IPv4-mapped、hex-mapped)/ 十进制 IP / 十六进制 IP / 八进制 IP / 短式 127.1 / IPv4-mapped IPv6 /
DNS rebinding / HTTP 重定向到私网 / username:password URL / 非 http(s) 协议(file/ftp/gopher/data)。

必须测试(全部有 case): 首次 DNS 安全→第二次变私网(flippingResolver 跨跳 rebinding);
301/302/307/308;多层重定向;响应体上限(流式 + content-length);超时(连接 abort + body-stall);
Content-Type;URL 规范化绕过。

正向对照 2 条(公网 html 允许、安全重定向到公网被跟随)确保 Gate 不能靠「一律拒绝」蒙混。

## 审计发现并修复的 crawler 缺陷

1. **超时不覆盖响应体读取(slowloris-body / DoS)**。原实现在 `fetchImpl` 返回后即 `clearTimeout`,
   body 流式读取阶段无超时也无 abort 保护 —— 服务端先秒回 header 再龟速滴 body,可绕过超时与体积上限。
   修复:AbortController/timer 覆盖整跳(含 body read),`readCappedText` 通过 `raceAbort` 监听 signal,
   超时即中断并归类 `TIMEOUT`;顺带用 try/catch 捕获 body-read 阶段的流错误(此前会让 `crawl()` reject
   而非返回 `CrawlRejection`)。纯加强,不放宽任何拦截。

## 设计要点

- 行为 Gate **不 grep 源码 token**;只观察 `crawl()` 的公开行为(`ok:false` + reason + fetch 调用次数)。
- pre-network 拦截用 `fetchCalls: 0` 断言:私网/协议/凭证目标必须在任何网络 I/O 前被拒。
- 语料是 vitest 与 CI Gate 的**单一事实来源**,二者不可能漂移。
- 每跳都 `guardTarget()` 重新解析 DNS + 重新校验 IP(手工重定向保留)。

## 遗留问题 / 需 Supervisor 决策

1. **DELIVERY_BOARD.md review 项 #3 已被本任务解决**。原文:「G 的 token 词表与 C 的数值 IP 实现未对齐;
   对齐后开 `SECURITY_CHECK_SSRF_STRICT=1`」。现已用行为 Gate 取代 token 词表,strict 默认开启,
   词表对齐问题不复存在。因该文件与 `agent-output/agent-g/CHECKPOINT.md` 不在本任务所有权内,**未自行改动**,
   请 Supervisor 在集成时更新 board(item #3 → RESOLVED)。
2. **深层 intra-hop DNS-rebinding(TOCTOU)未做 IP pinning**。guard 解析并校验后,把 hostname 交给
   `fetchImpl`,后者(真实 fetch)会**再次**独立解析 —— 理论上存在「guard 拿到公网、fetch 连接时变私网」
   的同跳竞态。彻底根治需把已校验 IP pin 进连接(改 `FetchImpl` 契约:按 IP 连 + 设 Host 头,或自定义
   dns lookup agent)。当前注入式接口下不可表达/不可测,且会改动 E 依赖的签名,故**未改**,列为已知限制。
   已覆盖的是「每跳重新解析」这一契约(含跨跳 rebinding)。是否升级到 IP pinning 请 Supervisor 定夺。
3. **未加 Playwright e2e 用例**。SSRF 属服务端 crawler 单元,vitest 行为 Gate + security:check 已充分;
   Playwright(需 dev server)承载 SSRF 反而引入无谓 flakiness。任务措辞为「如需」,判断为不需要。
