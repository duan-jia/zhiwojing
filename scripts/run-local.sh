#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "${script_dir}/.." && pwd)"
backend_dir="${repo_dir}/backend"
frontend_dir="${repo_dir}/frontend"
config_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/zhiwojing"
secrets_file="${config_dir}/secrets.env"

if [[ ! -x "${backend_dir}/.venv/bin/uvicorn" ]]; then
    echo "缺少 backend/.venv，请先按 README 安装后端依赖。" >&2
    exit 1
fi
if [[ ! -d "${frontend_dir}/node_modules" ]]; then
    echo "缺少 frontend/node_modules，请先在 frontend 运行 npm ci。" >&2
    exit 1
fi

if [[ -r "${secrets_file}" ]]; then
    while IFS= read -r line || [[ -n "${line}" ]]; do
        [[ -z "${line}" || "${line}" == \#* ]] && continue
        [[ "${line}" == *=* ]] || { echo "密钥文件包含无效行。" >&2; exit 1; }
        key="${line%%=*}"
        secret_value="${line#*=}"
        case "${key}" in
            LLM_API_KEY|ZHIHU_ACCESS_SECRET) export "${key}=${secret_value}" ;;
            *) echo "密钥文件包含不支持的变量 ${key}。" >&2; exit 1 ;;
        esac
    done < "${secrets_file}"
else
    echo "未找到本地密钥；地图照常启动，分身使用本地巡游。"
fi

export LLM_BASE_URL="${LLM_BASE_URL:-https://api.openai-next.com/v1}"
export LLM_MODEL="${LLM_MODEL:-deepseek-v4-flash}"
export AVATAR_API_URL="${AVATAR_API_URL:-http://127.0.0.1:8000}"

echo "构建 RPGJS 客户端与世界服务……"
(cd "${frontend_dir}" && npm run build)

pids=()
names=()
cleanup() {
    trap - INT TERM EXIT
    for pid in "${pids[@]:-}"; do kill "${pid}" 2>/dev/null || true; done
    wait "${pids[@]:-}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait_http() {
    service_name="$1"
    url="$2"
    pid="$3"
    for _attempt in {1..75}; do
        kill -0 "${pid}" 2>/dev/null || { echo "${service_name} 启动失败。" >&2; return 1; }
        curl -fsS --max-time 1 "${url}" >/dev/null 2>&1 && return 0
        sleep 0.2
    done
    echo "${service_name} 健康检查超时：${url}" >&2
    return 1
}

(cd "${backend_dir}" && exec .venv/bin/uvicorn app.main:app --reload --port 8000) &
pids+=("$!"); names+=("FastAPI")
(cd "${frontend_dir}" && exec npm run server) &
pids+=("$!"); names+=("RPGJS world")
(cd "${frontend_dir}" && exec npm run dev) &
pids+=("$!"); names+=("Vite")

echo "本地服务启动中：Web 5173 · API 8000 · World 8001"
wait_http "FastAPI" "http://127.0.0.1:8000/api/health" "${pids[0]}"
wait_http "RPGJS world" "http://127.0.0.1:8001/health" "${pids[1]}"
wait_http "Vite" "http://127.0.0.1:5173" "${pids[2]}"
echo "全部服务已就绪：http://127.0.0.1:5173"
set +e
failed_pid=""
# `wait -n -p` is unavailable on older Bash versions. Poll the known
# children instead, then reap the first one that has exited.
while [[ -z "${failed_pid}" ]]; do
    for pid in "${pids[@]}"; do
        if ! kill -0 "${pid}" 2>/dev/null; then
            failed_pid="${pid}"
            break
        fi
    done
    [[ -n "${failed_pid}" ]] || sleep 0.2
done
wait "${failed_pid}"
status=$?
set -e
failed_name="未知进程"
for index in "${!pids[@]}"; do
    [[ "${pids[$index]}" == "${failed_pid}" ]] && failed_name="${names[$index]}"
done
echo "${failed_name} 已退出（状态 ${status}），正在停止其余本地服务。" >&2
[[ "${status}" -eq 0 ]] && status=1
exit "${status}"
