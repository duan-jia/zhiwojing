#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$(cd -- "${script_dir}/.." && pwd)"
config_home="${XDG_CONFIG_HOME:-${HOME}/.config}"
secrets_file="${config_home}/zhiwojing/secrets.env"

if [[ ! -r "${secrets_file}" ]]; then
    echo "尚未配置本地密钥文件 ${secrets_file}。" >&2
    echo "请先运行 ${script_dir}/configure-local-llm.sh。" >&2
    exit 1
fi

while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    if [[ "${line}" != *=* ]]; then
        echo "密钥文件包含无效行，请使用 KEY=value 格式。" >&2
        exit 1
    fi

    key="${line%%=*}"
    value="${line#*=}"
    case "${key}" in
        LLM_API_KEY|ZHIHU_ACCESS_SECRET)
            export "${key}=${value}"
            ;;
        *)
            echo "密钥文件包含不支持的变量 ${key}。" >&2
            exit 1
            ;;
    esac
done < "${secrets_file}"

if [[ -z "${LLM_API_KEY:-}" || -z "${ZHIHU_ACCESS_SECRET:-}" ]]; then
    echo "密钥文件必须同时包含 LLM_API_KEY 和 ZHIHU_ACCESS_SECRET。" >&2
    exit 1
fi

export LLM_BASE_URL="${LLM_BASE_URL:-https://api.openai-next.com/v1}"
export LLM_MODEL="${LLM_MODEL:-deepseek-v4-flash}"

cd "${backend_dir}"
exec .venv/bin/uvicorn app.main:app --reload --port 8000
