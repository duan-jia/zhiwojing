#!/usr/bin/env bash
set -euo pipefail

config_home="${XDG_CONFIG_HOME:-${HOME}/.config}"
config_dir="${config_home}/zhiwojing"
secret_file="${config_dir}/llm-api-key"

if [[ ! -t 0 ]]; then
    echo "请在交互式终端中运行此脚本。" >&2
    exit 1
fi

read -r -s -p "请输入测试用 LLM API Key（输入内容不会显示）: " api_key
echo

if [[ -z "${api_key}" ]]; then
    echo "API Key 不能为空。" >&2
    exit 1
fi

mkdir -p "${config_dir}"
chmod 700 "${config_dir}"
umask 077
printf '%s\n' "${api_key}" > "${secret_file}"
chmod 600 "${secret_file}"
unset api_key

echo "已安全保存到 ${secret_file}。"
echo "以后运行 ./scripts/run-local.sh 即可启动后端。"
