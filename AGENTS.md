# AGENTS.md · 给后续 AI 的项目说明

本文件写给接手修改本项目（网站代码）或其知识库（LLM Wiki）的 AI agent。动手前先读完本文件；改知识库前再读 `../藏书家智能体/knowledge_base/wiki/AGENTS.md`（wiki 维护规范，权威）。

## 一、项目是什么

“书魂永不散藏园”——以 LLM Wiki 为数据层的傅增湘藏书家智能体网站。网站代码在本仓库；知识库在仓库**之外**的同级目录 `../藏书家智能体/knowledge_base`（不在 git 中，体积大，含原文、索引与向量）。

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 原始资料 | `../藏书家智能体/原始数据/` | 只读，唯一事实来源 |
| 整理全文 | `knowledge_base/corpus/<doc_id>.md` | 流水线生成，段落锚点 `^b0012`，不要手改 |
| Wiki | `knowledge_base/wiki/**/*.md` | 人物、书籍、事件、故事、疑案、网站玩法等页面；网站的全部文字内容来自这里 |
| 导出与索引 | `knowledge_base/data/export/`、`data/index/` | `pages.json`、`graph.json`、`timeline.json`、`kb.sqlite`（FTS5）、`embeddings.npy`、`onnx/` |
| 网站 | 本仓库 | FastAPI 后端读导出与索引；React 前端只调 `/api/*` |

## 二、目录

```text
server/
  app.py         路由（/api/*、SSE 问答、后台接口、静态资源）
  kb.py          读取导出数据；按 wiki 小节标题解析故事、疑案、小故事、关系图
  rag.py         小傅检索问答：实体识别、IDF 关键词、ONNX 向量、沿出处补原文、RRF、去重、网站玩法问题路由（GUIDE_MODULES）
  wiki_admin.py  知识库后台：资料检索、大模型起草与校验、写入 wiki、增量重建、撤回、重新部署后恢复
  llm.py         OpenAI 兼容客户端（流式 + JSON 模式）
  config.py      环境变量（.env）
web/src/
  pages/         Home Life LifeCinema Stories StoryCinema Cases Shelf Network Gallery WikiView DocReader Search AdminWiki
  components/    Markdown（[[链接]] 与出处按钮）、XiaoFu、SourceDrawer、InkStage 等
  lib/api.ts     接口类型；lib/scenes.ts 故事插画与年谱篇章配置
deploy/          package.ps1（打包）、install.sh（服务器安装，systemd）、remote.py（SSH）、requirements-server.txt
scripts/         smoke_test.py、shots.py（Playwright 截图）、mock_llm.py 等
start.*          本地启动：Windows start.bat / start.ps1，macOS start.command / start.sh，Linux start.sh
```

## 三、本地运行

```bash
./start.sh                # macOS / Linux；Windows：.\start.ps1 或双击 start.bat
./start.sh --dev          # 后端 :8000 + Vite :5173
cd web && npx tsc -b      # 前端类型检查（改前端后必跑）
```

`.env`（不入库）：`DEEPSEEK_API_KEY` 或 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`，`ADMIN_TOKEN`（启用 /admin/wiki），`KB_ROOT`（知识库不在默认位置时）。不要把任何 key、口令、服务器密码写进仓库文件或提交信息。

## 四、内容从哪里来（改内容先找对文件）

网站按 wiki 页面的**小节标题**取内容，改标题会让页面取不到数据：

| 页面 | 来源 | 读取的小节 / 字段 |
| --- | --- | --- |
| 首页长卷 | `web/src/pages/Home.tsx` 的 `SCENES` | 文字硬编码，须与 wiki 史实一致 |
| 认识傅增湘 | `wiki/people/傅增湘.md`、`timeline.json` | `## 生平概览`、`## 五大主要贡献`（表格）、`## 说法不一之处`；事件 `summary` 以“傅增湘”为主语 |
| 藏园故事 | `wiki/stories/*.md` | 情节表（`## 情节卡` 或 `## 情节（四幕）`，首列场景名）、`## 故事全文`、`## 故事里的人`、`## 史料小注`；校一页通典读 `## 校勘方法` |
| 更多藏园小故事 | `wiki/events/*.md`（无 `story` 字段的） | `## 故事`、`## 文中人物`，frontmatter `tale` 为卡片标题 |
| 史料侦探 | `wiki/cases/*.md` | `## 案情`、`## 史料卡`（卡｜史料｜说明｜指向 A/B/—｜研究者解读｜出处）或 `## 数字卡`、`## 结论`、`## 为什么旧说看似合理`；`hypothesis_labels`、`supported_hypothesis` |
| 双鉴书架 | `wiki/books`、`wiki/works` | `category`（经/史/子/集）、`edition`、`current_holder`、`relations` |
| 书林往来 | 全部实体页 | `relations`（关系边）、事件与故事中同时出现（同见一事）、页面互链；气泡大小 = `mention_total`（流水线按标题与 aliases 统计） |
| 小傅回答“怎么用” | `wiki/guide/*.md` | 改了界面就同步改对应玩法页；新增玩法关键词加到 `rag.py` 的 `GUIDE_MODULES` / `GUIDE_HINTS` |

内容约定（来自用户反馈，必须遵守）：不显示“已审”“已核”“待核”“三十秒”之类状态标识，读者直接看出处；不用“起承转合”标签；存疑或缺出处的内容写进“史料小注”或“说法不一”，不写成正文；故事各幕要前后衔接、交代背景；人物页重点写与傅增湘的具体交集。

## 五、改知识库

1. 按 `knowledge_base/wiki/AGENTS.md` 写页面：每个事实句带出处 `（[[cnki-0123#^b0045|简称 p.4]]）`，关系必须有日期与 `evidence`，书落到具体版本，不编造。
2. 查原文：`knowledge_base/pipeline/kb_search.py 关键词`，或查 `data/index/kb.sqlite` 的 `blocks` 表（段落 id 即锚点）。
3. 重建并体检（在 `knowledge_base/pipeline`）：
   ```bash
   python s05_index.py        # 重建 kb.sqlite、提及统计、data/export（改 wiki 后必跑）
   python s06_wiki.py index   # 重写 wiki/index.md
   python s06_wiki.py lint    # 死链、失效锚点、无出处段落、关系缺证据
   ```
   新页面的向量在后端启动时自动补齐（`wiki_admin.reconcile`）；全量重算用 `.venv` 跑 `s07_embed.py`。
4. 也可以用网站后台 `/admin/wiki` 补充：它调用同一套规则起草，校验出处编号与链接，写入后增量重建；上传资料入库为 `sup-NNNN`。

## 六、部署

服务器 `ubuntu@106.55.11.173`，服务 `fuzengxiang`（systemd），端口 8600，安装目录 `/opt/fuzengxiang/{app,kb,venv,admin-data}`。凭据向用户索取，经环境变量传给 `deploy/remote.py`，不要写入文件。

```powershell
.\deploy\package.ps1                                   # 构建前端并打包代码 + 知识库导出/索引/向量/wiki
python deploy\remote.py put deploy\out\fuzengxiang-deploy.tar.gz /tmp/fuzengxiang-deploy.tar.gz
python deploy\remote.py put deploy\install.sh /tmp/fzx-install.sh
python deploy\remote.py sudo "bash /tmp/fzx-install.sh /tmp/fuzengxiang-deploy.tar.gz 8600"
```

`install.sh` 会删除并重装 `/opt/fuzengxiang/kb`；后台补充的词条保存在 `/opt/fuzengxiang/admin-data`，启动时自动恢复。管理口令在服务器 `/etc/fuzengxiang.env`。部署前若后台新增过词条，可从 `admin-data/pages/` 取回放进本地 wiki，保持本地为母本。

## 七、验证（改完要拿证据）

- 前端：`cd web && npx tsc -b`；`python scripts/shots.py --base http://127.0.0.1:8000 /life /stories /network` 截图看效果（桌面 1440、移动 `--w 390 --h 844`）。
- 接口：`python scripts/smoke_test.py`；关键接口 `/api/network`、`/api/tales`、`/api/stories/<id>`、`/api/cases/<id>`、`/api/books`。
- 小傅：`POST /api/retrieve {"question": ...}` 看召回来源；网站使用类问题应 `site: true` 并召回 guide 页。
- 线上：`curl http://106.55.11.173:8600/api/health`（pages、dense.ready）。

## 八、踩过的坑

- Windows PowerShell 5 读无 BOM 的 UTF-8 `.ps1` 会把中文读乱导致语法错误：`.ps1` 存为 **UTF-8 with BOM**；`.sh`、`.command` 用 LF（见 `.gitattributes`）。
- 重建 `kb.sqlite` 前先停掉本地后端，否则 Windows 上文件被占用无法替换。
- ONNX 导出不支持中文路径，导出到 ASCII 临时目录再移动。
- 大模型 JSON 起草：正文里有原始换行，解析用 `json.loads(strict=False)`；资料过多会被截断，单次 10—14 条为宜。
- 前端 CSS 类名避免与 Markdown 内容类重名（曾因 `.thinking` 冲突出现底框）；`SplitText` 生成的 span 不要被父级 `span` 选择器误伤。
- 浮层需要独立滚动时加 `data-scroll-trap`；整页滚动用 Lenis，程序滚动用 `window.__lenis.scrollTo`。
- 知识库可能有其他工具同时在改：写入前看文件修改时间，不要整页覆盖别人刚写的内容。

## 九、提交规范

提交信息一行，前缀 `feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `style:`，中文简述，不加 Co-authored-by 等尾注。知识库不在本仓库，改动知识库不会出现在 git 中，需在汇报里说明。
