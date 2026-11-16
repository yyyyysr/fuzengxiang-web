# 书魂永不散藏园 · 傅增湘藏书家智能体网站

以 `../藏书家智能体/knowledge_base` 的 LLM Wiki 为数据层和知识存储层，按《傅增湘藏书家智能体网站设计方案》实现的网站。界面参考 CGTN《The Song, Painted》的长卷叙事：开场百分比加载、可跳过的水墨引入、滚动驱动的横向长卷与画中热点、章节式栏目。导览角色“小傅”提供基于 RAG 的资料问答。

## 运行

```powershell
.\start.ps1            # 构建前端并启动，浏览器打开 http://127.0.0.1:8000
.\start.ps1 -Dev       # 开发模式：后端 :8000，前端热更新 http://127.0.0.1:5173
```

需要 Node 18+、Python 3.10+。后端默认使用 `knowledge_base\.venv` 的 Python（已含 FastAPI、jieba、OpenCC 与向量检索依赖）；其他环境可 `pip install -r server/requirements.txt`。

## 接入大模型

复制 `.env.example` 为 `.env`，填写 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（任意 OpenAI 兼容接口），重启即可。也可以在小傅面板右上角“⚙”里临时设置（只保存在服务端内存）。未配置 key 时，小傅以“资料检索摘编”模式回答：同样检索、同样带出处，只是不做生成式组织。

## 结构

```text
fuzengxiang-web/
├── server/                 FastAPI
│   ├── app.py              路由：数据 API、/api/chat（SSE 流式问答）、/api/llm/config、静态资源
│   ├── kb.py               读取 knowledge_base 导出数据与 kb.sqlite；解析故事情节卡、疑案证据卡
│   ├── rag.py              检索与回答：实体识别 → IDF 关键词检索（wiki 页 + 原文块）→ 向量召回 → 沿 wiki 出处链接补入原文段落 → RRF 融合 → LLM / 摘编
│   └── llm.py              OpenAI 兼容流式客户端
├── web/                    Vite + React + TypeScript + framer-motion + d3-force
│   └── src/pages/          首页、认识傅增湘、藏园故事、史料侦探、双鉴书架、书林往来、图像长廊、知识页、原文阅读、检索
├── scripts/
│   ├── prepare_assets.py   把卡通形象压缩为 web/public/xiaofu/*.webp
│   ├── smoke_test.py       接口冒烟测试（数据接口 + 一次流式问答）
│   ├── mock_llm.py         模拟 OpenAI 兼容接口，用于无 key 时测试大模型路径
│   └── shots.py            Playwright 截图（视觉检查）
└── start.ps1
```

## 页面与数据来源

顶部导航：首页｜认识傅增湘｜藏园故事｜史料侦探｜双鉴书架｜书林往来｜藏园图像，右侧为全站检索。

| 页面 | 路由 | 数据 |
| --- | --- | --- |
| 首页 | `/` | 长卷场景引用图像目录与故事页；栏目统计来自 `/api/overview` |
| 认识傅增湘 | `/life` | `wiki/people/傅增湘.md`（三十秒介绍、贡献五项、待核）+ `timeline.json`（事件与带日期的故事） |
| 藏园故事 | `/stories`、`/stories/:id` | `wiki/stories/*.md` 的情节卡表格 → 翻卡 + 排序小游戏 + 揭晓；《通典》一则读“校勘方法”表 → 符号卡 + 认批校小测 |
| 史料侦探 | `/cases`、`/cases/:id` | `wiki/cases/*.md` 的假说、证据卡/数字卡、结论；`supported_hypothesis` 标明研究者结论支持哪一说 |
| 双鉴书架 | `/shelf` | `wiki/books`、`wiki/works` 的 frontmatter（版本、现藏、relations） |
| 书林往来 | `/network` | `graph.json` 关系边 + 人物页 relations |
| 图像长廊 | `/gallery` | `images.json` |
| 知识页 / 原文 | `/wiki/:id`、`/doc/:id#b0045` | wiki Markdown；`docs/<id>.json` 段落块 |

wiki 正文中的 `[[cnki-0130#^b0045|过往繫年 p.6]]` 渲染为“§ 出处”按钮，点开即在抽屉中显示该段原文与上下文，可跳转全文并高亮。

## 小傅

- 六张立绘按页面事件切换：发呆（待机）、思考（检索、翻证据）、鼓励（提示下一步）、开心雀跃（找到证据、完成任务）、难过伤心（失火、失窃、水灾等情节）、睡觉（75 秒无操作）。
- 每页给出情境提示与推荐问题，并把当前页面作为检索上下文。
- 回答中的 `[n]` 可点击：知识页跳转，原文段落打开出处抽屉；“查看依据”列出全部来源。
- 读者可以收起小傅；它不以第一人称冒充傅增湘。

## 更新知识库后

在 `knowledge_base/pipeline` 重跑 `python build.py --from 2`（或只改 wiki 时 `python s05_index.py`），然后 `POST /api/admin/reload` 或重启后端即可，前端无需改动。

## 验证

```powershell
python scripts\smoke_test.py --q "1917年水灾时傅增湘怎么保护藏书的？"
python scripts\mock_llm.py   # 另开终端，然后在小傅设置中填 http://127.0.0.1:9100/v1、key 填 test-key
```
