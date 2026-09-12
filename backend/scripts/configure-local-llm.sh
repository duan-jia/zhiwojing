#!/usr/bin/env bash
set -euo pipefail

config_home="${XDG_CONFIG_HOME:-${HOME}/.config}"
config_dir="${config_home}/zhiwojing"
secrets_file="${config_dir}/secrets.env"

if [[ ! -t 0 ]]; then
    echo "请在交互式终端中运行此脚本。" >&2
    exit 1
fi

read -r -s -p "请输入测试用 LLM API Key（输入内容不会显示）: " llm_api_key
echo
read -r -s -p "请输入知乎 Access Secret（输入内容不会显示）: " zhihu_access_secret
echo

if [[ -z "${llm_api_key}" || -z "${zhihu_access_secret}" ]]; then
    echo "LLM API Key 和知乎 Access Secret 都不能为空。" >&2
    exit 1
fi

mkdir -p "${config_dir}"
chmod 700 "${config_dir}"
umask 077
printf 'LLM_API_KEY=%s\nZHIHU_ACCESS_SECRET=%s\n' \
    "${llm_api_key}" \
    "${zhihu_access_secret}" > "${secrets_file}"
chmod 600 "${secrets_file}"
unset llm_api_key zhihu_access_secret

echo "已安全保存到 ${secrets_file}。"
echo "以后可以直接编辑这个文件修改密钥。"
echo "以后运行 ./scripts/run-local.sh 即可启动后端。"
