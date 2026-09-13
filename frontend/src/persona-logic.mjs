export function personaView(value) {
  const data = value && typeof value === 'object' ? value : {}
  return {
    domains: Array.isArray(data.domains) ? data.domains.filter(x => typeof x === 'string') : [],
    tags: Array.isArray(data.interest_tags) ? data.interest_tags.filter(x => typeof x === 'string') : [],
    summary: typeof data.summary === 'string' ? data.summary.slice(0, 200) : '',
  }
}

export function personaError(body, status) {
  const detail = body?.detail
  if (detail?.code === 'ZHIHU_NOT_CONFIGURED') return '知乎能力尚未配置，请联系管理员完成配置。'
  if (detail?.code === 'PERSONA_NOT_FOUND' || status === 404) return '还没有人设卡，点击“生成”用知乎数据完成冷启动。'
  return detail?.message || `人设服务暂时不可用（${status}）`
}
