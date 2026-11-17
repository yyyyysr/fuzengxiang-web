# 书魂永不散藏园 · 傅增湘藏书家智能体网站

以 LLM Wiki 为数据层和知识存储层的傅增湘藏书家智能体网站。界面以长卷叙事：开场百分比加载、可跳过的水墨引入、滚动驱动的横向长卷与画中热点、章节式栏目。导览角色“小傅”提供基于 RAG 的资料问答。

## 运行

需要 **Node.js 18+** 与 **Python 3.10+**，以及与本项目同级的知识库目录 `../藏书家智能体/knowledge_base`（位置不同时在 `.env` 中设置 `KB_ROOT`）。启动脚本会自动安装前端依赖、在需要时构建前端，并选择后端 Python：环境变量 `KB_PYTHON` → 知识库的 `.venv` → 本项目 `.venv`（首次运行自动创建，并安装 `deploy/requirements-server.txt`）。

| 系统 | 生产模式（整站 http://127.0.0.1:8000） | 开发模式（后端 :8000 + 前端热更新 :5173） | 强制重新构建前端 |
| --- | --- | --- | --- |
| Windows | 双击 `start.bat`，或 PowerShell 执行 `.\start.ps1` | `.\start.ps1 -Dev`（或 `start.bat -Dev`） | `.\start.ps1 -Build` |
| macOS | 双击 `start.command`，或终端执行 `./start.sh` | `./start.sh --dev` | `./start.sh --build` |
| Linux | `./start.sh` | `./start.sh --dev` | `./start.sh --build` |

macOS / Linux 首次使用前先赋予执行权限：`chmod +x start.sh start.command`。macOS 首次双击 `start.command` 若被拦截，在“系统设置 → 隐私与安全性”中选择“仍要打开”。端口被占用时，在 `.env` 中修改 `PORT`。

## 配置（.env）

复制 `.env.example` 为 `.env` 后按需填写，重启生效：

- **大模型**：`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（任意 OpenAI 兼容接口，如 DeepSeek）；也读取 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。未配置 key 时，小傅以“资料检索摘编”模式回答：同样检索、同样带出处，只是不做生成式组织。
- **知识库后台**：`ADMIN_TOKEN` 设定管理口令后，`/admin/wiki`（页脚“知识库后台”）可用：填写词条、勾选原文段落或上传资料（txt/md/docx/pdf），由大模型整理成带出处的 wiki 页面，确认后写入知识库并自动重建索引与向量；支持撤回。`ADMIN_DATA` 指定后台写入记录的保存目录。
- **向量检索**：`ENABLE_DENSE=1` 时用 ONNX 编码器做语义召回（需要知识库 `data/index/embeddings.npy` 与 `data/index/onnx/`）。

## 结构

```text
fuzengxiang-web/
├── server/                 FastAPI
│   ├── app.py              路由：数据 API、/api/chat（SSE 流式问答）、/api/llm/config、静态资源
│   ├── kb.py               读取 knowledge_base 导出数据与 kb.sqlite；解析故事情节卡、疑案证据卡
│   ├── rag.py              检索与回答：实体识别 → IDF 关键词检索（wiki 页 + 原文块）→ 向量召回 → 沿 wiki 出处链接补入原文段落 → RRF 融合 → LLM / 摘编
│   ├── wiki_admin.py       知识库后台：检索资料、大模型起草与校验、写入 wiki、增量重建索引与向量、撤回
│   └── llm.py              OpenAI 兼容客户端（流式问答 + JSON 起草）
├── web/                    Vite + React + TypeScript + framer-motion + d3-force
│   └── src/pages/          首页、认识傅增湘、藏园故事、史料侦探、双鉴书架、书林往来、图像长廊、知识页、原文阅读、检索、知识库后台
├── scripts/
│   ├── prepare_assets.py   把卡通形象压缩为 web/public/xiaofu/*.webp
│   ├── smoke_test.py       接口冒烟测试（数据接口 + 一次流式问答）
│   ├── mock_llm.py         模拟 OpenAI 兼容接口，用于无 key 时测试大模型路径
│   └── shots.py            Playwright 截图（视觉检查）
├── deploy/                 package.ps1 打包、install.sh 服务器安装（systemd）、remote.py SSH 助手
├── start.bat / start.ps1   Windows 启动
└── start.sh / start.command  macOS、Linux 启动
```

## 页面与数据来源

顶部导航：首页｜认识傅增湘｜藏园故事｜史料侦探｜双鉴书架｜书林往来｜藏园图像，右侧为全站检索。

| 页面 | 路由 | 数据 |
| --- | --- | --- |
| 首页 | `/` | 长卷场景引用图像目录与故事页；栏目统计来自 `/api/overview` |
| 认识傅增湘 | `/life` | `wiki/people/傅增湘.md`（生平概览、五大主要贡献、说法不一之处）+ `timeline.json`（事件与带日期的故事） |
| 藏园故事 | `/stories`、`/stories/:id` | `wiki/stories/*.md` 的情节表 → 逐幕放映 + 故事全文、故事里的人、史料小注；《通典》一则读“校勘方法”表 → 符号放映 + 认批校小测；`/api/tales` 把事件页的“故事”一节列为白话小故事 |
| 史料侦探 | `/cases`、`/cases/:id` | `wiki/cases/*.md` 的案情、史料卡/数字卡、结论；先读史料再判断，`supported_hypothesis` 与“指向”列给出研究者的解读 |
| 双鉴书架 | `/shelf` | `wiki/books`、`wiki/works` 的 frontmatter（版本、现藏、`category` 四部、relations） |
| 书林往来 | `/network` | 人物、书籍、项目、机构、地点；关系边 + 同见一事 + 页面互相提及；气泡大小为资料中的提及次数 |
| 图像长廊 | `/gallery` | `images.json` |
| 知识页 / 原文 | `/wiki/:id`、`/doc/:id#b0045` | wiki Markdown；`docs/<id>.json` 段落块 |
| 知识库后台 | `/admin/wiki` | 需 `ADMIN_TOKEN`；写入 `wiki/` 并重建 `kb.sqlite` 的 wiki 表、`data/export/wiki/*.json` 与向量 |

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
