$env:DATABASE_URL = ".\data\lejinji-canary.db"
cd "E:\企业诊断智能体_worktrees\round8-agent-bb-quick"
Write-Host "DATABASE_URL: $env:DATABASE_URL"
npx next start -p 36120
