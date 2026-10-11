# DSH 股票投研

[English](README.md) | 中文

DSH 股票投研是一款面向非技术用户的 A 股投研 agent（智能体）。你可以围绕公司、行业和市场动态提问，在同一个界面中使用行情数据、公司信息和专题研究流程；无需自行组装 agent，也无需选择工作区。

本项目基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 开发，沿用其通用对话与会话基础设施，并将 Web 端的默认体验聚焦于股票研究。

## 可以做什么

- **Conversation：** 提出投研问题，在可收起的历史栏中找回对话。新对话固定使用**股票分析** preset。
- **Agents：** 从卡片启动专题研究，并在独立的分析记录中查看结果。
- **自选股：** 保存 A 股标的，查看行情、K 线、相关公告、研报和新闻，并围绕选中的股票追问。

股票分析 preset 已包含基础投研角色提示词、股票工具和网页工具，但尚未约束完整的研究方法，也没有按任务细分工具权限。回答仅供研究参考，不提供针对个人的买卖或仓位建议；使用行情数据前，请核对来源和时间。

<a id="run"></a>

<a id="run-from-source"></a>

## 从源码运行

安装 Node.js `^22.19.0` 或 `>=24.0.0`，以及 pnpm `11.7.0`，然后运行：

```sh
git clone https://github.com/mingzeng21/dsh-stock-analysis.git
cd dsh-stock-analysis
pnpm install
pnpm run build
pnpm dsh web
```

打开 `pnpm dsh web` 打印的完整地址；本机启动时通常会自动打开浏览器。开始对话前，在**设置 → 模型**中保存 [DeepSeek API 密钥](https://platform.deepseek.com/)。

行情数据由配置的同花顺金融数据和问财服务提供。使用实时数据前，请在启动进程的环境中提供 `HITHINK_FINANCE_API_KEY` 和 `IWENCAI_API_KEY`。缺少相应的服务密钥或能力权限时，相关数据请求可能失败；只有模型密钥并不能获取行情数据。

新研究会话默认使用可写的应用数据目录，用户无需选择工作区。已有工作区继续使用其记录的路径。

## 开发

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)、[开发指南](docs/development.zh.md)和[架构文档](docs/architecture.zh.md)。仓库内的 agent 遵循 [AGENTS.md](AGENTS.md)。股票 Web 组合见 [web-app](packages/bundle/web-app/README.zh.md)，行情数据集成见[股票子系统](docs/subsystems/stock.zh.md)。

## 许可证

[MIT](LICENSE)。第三方依赖许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
