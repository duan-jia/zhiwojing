#!/usr/bin/env bash
set -euo pipefail

# One-shot deployment for a Tencent Cloud Ubuntu host.
# Run from the repository root: sudo bash scripts/deploy-tencent.sh

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backend_dir="${repo_dir}/backend"
frontend_dir="${repo_dir}/frontend"
env_file="/etc/zhihu.env"

read -r -p "主域名 [duanzhiwojing.site]: " domain
domain="${domain:-duanzhiwojing.site}"
read -r -p "游戏子域名 [game.${domain}]: " game_domain
game_domain="${game_domain:-game.${domain}}"
read -r -p "服务器公网 IPv4 [116.30.139.215]: " server_ip
server_ip="${server_ip:-116.30.139.215}"

echo "将部署 ${domain}（前端/API）和 ${game_domain}（RPGJS/WebSocket）。"
echo "请确认 DNS 已将 ${domain} 和 ${game_domain} 的 A 记录指向 ${server_ip}。"
read -r -p "继续？[y/N] " confirm
[[ "${confirm}" =~ ^[Yy]$ ]] || { echo "已取消。"; exit 0; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git curl nginx python3 python3-venv python3-pip certbot python3-certbot-nginx

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "未检测到 Node.js，正在安装 Node.js 22……"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node_bin="$(command -v node)"
npm_bin="$(command -v npm)"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  echo "当前 Node.js 为 $(node --version)，正在升级到 Node.js 22……"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi
(( node_major >= 22 )) || { echo "Node.js 安装失败，需要 22+，当前为 $(node --version)。" >&2; exit 1; }

[[ -d "${backend_dir}" && -d "${frontend_dir}" ]] || { echo "脚本必须在项目仓库内运行。" >&2; exit 1; }

# @rpgjs/client is tracked as a Git submodule. A plain clone leaves it empty.
if [[ -f "${repo_dir}/.gitmodules" ]] && command -v git >/dev/null; then
  echo "初始化 RPGJS 客户端子模块……"
  git -C "${repo_dir}" submodule update --init --recursive
fi
[[ -f "${frontend_dir}/vendor/@rpgjs/client/package.json" ]] || {
  echo "缺少 frontend/vendor/@rpgjs/client；请确认 Git 子模块已初始化。" >&2
  exit 1
}

if [[ ! -x "${backend_dir}/.venv/bin/uvicorn" ]]; then
  python3 -m venv "${backend_dir}/.venv"
  "${backend_dir}/.venv/bin/pip" install -r "${backend_dir}/requirements.txt"
fi

cd "${frontend_dir}"
npm ci
VITE_API_URL="https://${domain}" \
VITE_RPGJS_SERVER_HOST="${game_domain}" \
npm run build

dist_root="${frontend_dir}/dist"
[[ -f "${dist_root}/client/index.html" ]] && web_root="${dist_root}/client" || web_root="${dist_root}"

echo "配置线上 OAuth（密钥不会写入仓库）。没有凭证可直接回车，之后再编辑 ${env_file}。"
read -r -p "知乎 App ID（数字）: " app_id
read -r -s -p "知乎 OAuth App Key（输入不会显示）: " app_key; echo
read -r -s -p "知乎 Access Secret（输入不会显示）: " access_secret; echo

cat > "${env_file}" <<EOF
ZHIHU_OAUTH_APP_ID=${app_id}
ZHIHU_OAUTH_REDIRECT_URI=https://${domain}/auth/callback
ZHIHU_OAUTH_APP_KEY=${app_key}
ZHIHU_ACCESS_SECRET=${access_secret}
AVATAR_API_URL=http://127.0.0.1:8000
RPGJS_HOST=127.0.0.1
RPGJS_PORT=8001
EOF
chmod 600 "${env_file}"

cat > /etc/systemd/system/zhiwojing-api.service <<EOF
[Unit]
Description=Zhiwojing FastAPI
After=network.target
[Service]
User=root
WorkingDirectory=${backend_dir}
EnvironmentFile=${env_file}
ExecStart=${backend_dir}/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/zhiwojing-world.service <<EOF
[Unit]
Description=Zhiwojing RPGJS world
After=network.target zhiwojing-api.service
[Service]
User=root
WorkingDirectory=${frontend_dir}
EnvironmentFile=${env_file}
ExecStart=${npm_bin} run server
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/nginx/sites-available/${domain}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    root ${web_root};
    index index.html;
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location = /auth/callback {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
server {
    listen 80;
    listen [::]:80;
    server_name ${game_domain};
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }
}
EOF

ln -sfn "/etc/nginx/sites-available/${domain}" "/etc/nginx/sites-enabled/${domain}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl daemon-reload
systemctl enable --now zhiwojing-api.service zhiwojing-world.service nginx

if certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email \
    -d "${domain}" -d "${game_domain}"; then
  echo "HTTPS 配置完成。"
else
  echo "Certbot 申请证书失败；请确认 DNS 已指向本机公网 IP 后重试：" >&2
  echo "sudo certbot --nginx -d ${domain} -d ${game_domain}" >&2
fi

echo
echo "部署完成： https://${domain}"
echo "API 检查： curl https://${domain}/api/health"
echo "世界检查： curl https://${game_domain}/health"
echo "OAuth 回调： https://${domain}/auth/callback"
echo "日志： journalctl -u zhiwojing-api -u zhiwojing-world -f"
echo "注意：当前仓库 OAuth 路由仍是安全占位实现，真实授权流程需另行完成。"
