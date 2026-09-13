# 远程通讯协议

`REMOTE_AGENT_REPLY_LIMIT` 控制同一联系人方向的连续分身回复数，默认 `5`。达到上限返回 `delivered: "capped"`，直到接收方本人发送消息才清零。

## 接口

- `POST /api/presence`：`{user_id, online, human_controlled}`；RPGJS 在连接、断开和挂机切换时上报。
- `GET /api/contacts?user_id=`：返回名称、删除状态、在线状态、最近消息、未读数和回复计数。
- `DELETE /api/contacts/{contact_id}?user_id=`：同时硬删除双方联系人行；消息与 pair 记忆不会删除。
- `GET /api/messages/thread/{contact_id}?user_id=`：获取线程并标为已读；`GET /api/messages/inbox` 返回总未读。
- `POST /api/messages/send`：`{sender_id, recipient_id, content, sender_kind?}`；普通客户端使用 `human`。

在线且本人操控时仅持久化并投递真人。离线或挂机且未达上限时，服务端复用 `/api/agent/chat` 的 runtime，因此读取和写入规范 pair memory；分身回复以 `sender_kind: "agent"` 持久化。发送消息要求发送方已有联系人行，删除后双方列表都会消失且远程发送返回 409；再次在世界相遇并完成对话时，现有 `conclude_pair` 路径会按自动互加规则重新建立双方联系人，并继续保留此前的记忆与消息历史。
