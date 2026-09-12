#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$(cd -- "${script_dir}/.." && pwd)"
config_home="${XDG_CONFIG_HOME:-${HOME}/.config}"
secret_file="${config_home}/zhiwojing/llm-api-key"

if [[ ! -r "${secret_file}" ]]; then
    echo "尚未配置本地 LLM API Key。" >&2
    echo "请先运行 ${script_dir}/configure-local-llm.sh。" >&2
    exit 1
fi

LLM_API_KEY="$(<"${secret_file}")"
if [[ -z "${LLM_API_KEY}" ]]; then
    echo "本地 LLM API Key 文件为空，请重新运行配置脚本。" >&2
    exit 1
fi

export LLM_API_KEY
export LLM_BASE_URL="${LLM_BASE_URL:-https://api.openai-next.com/v1}"
export LLM_MODEL="${LLM_MODEL:-deepseek-v4-flash}"

cd "${backend_dir}"
exec .venv/bin/uvicorn app.main:app --reload --port 8000
