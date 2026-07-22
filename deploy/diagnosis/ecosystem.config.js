{
  "name": "xingmei-diagnosis",
  "script": "/opt/xingmei/diagnosis/current/deploy/diagnosis/start.sh",
  "interpreter": "bash",
  "cwd": "/opt/xingmei/diagnosis/current",
  "instances": 1,
  "exec_mode": "fork",
  "autorestart": true,
  "watch": false,
  "max_memory_restart": "2G",
  "env": {
    "NODE_ENV": "production",
    "PORT": 3710,
    "HOST": "127.0.0.1"
  },
  "env_production": {
    "NODE_ENV": "production",
    "PORT": 3710,
    "HOST": "127.0.0.1"
  },
  "listen_timeout": 30000,
  "kill_timeout": 5000,
  "wait_ready": true,
  "pmx": false,
  "autostart": true
}
