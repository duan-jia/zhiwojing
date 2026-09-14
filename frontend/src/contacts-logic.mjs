export const totalUnread = contacts => contacts.reduce((sum, item) => sum + item.unread, 0)

export const deliveryNotice = result => result.capped || result.delivered === 'capped'
  ? '分身连续回复已达上限，请等待对方本人回复。'
  : result.delivered === 'offline'
    ? '对方当前离线，将在下次上线后看到消息。'
  : ''
