import json, re
from typing import Any

def parse_json_object(content: Any) -> dict:
    if not isinstance(content,str): content=json.dumps(content,ensure_ascii=False)
    text=content.strip()
    match=re.search(r"\{.*\}",text,re.S)
    if not match: return {}
    try:
        value=json.loads(match.group(0)); return value if isinstance(value,dict) else {}
    except (ValueError,TypeError): return {}

async def summarize_pair(llm,user_message:str,reply:str)->dict:
    prompt=("总结这一轮交流，只输出JSON，字段 summary(字符串)、topics(字符串数组)、mood(字符串)、"
            "familiarity_delta(-1到1数字)、relation_tag(字符串)。\n用户："+user_message+"\n回复："+reply)
    result=await llm.ainvoke(prompt); data=parse_json_object(result.content)
    return {"summary":str(data.get("summary") or f"交流：{user_message[:80]} / {reply[:80]}"),"topics":data.get("topics",[]),"mood":str(data.get("mood", "")),"familiarity_delta":max(-1,min(1,float(data.get("familiarity_delta",0) or 0))),"relation_tag":str(data.get("relation_tag", ""))}

async def summarize_private(llm,messages:list[dict])->dict:
    result=await llm.ainvoke("提取主人的长期信息，只输出JSON，字段 facts、prefs、todos（均为数组）：\n"+json.dumps(messages[-6:],ensure_ascii=False))
    data=parse_json_object(result.content)
    return {k:(v if isinstance(v,list) else []) for k,v in ((k,data.get(k,[])) for k in ("facts","prefs","todos"))}
