# 发布清单(今天上传,明天细改)

> 目标:**今天占位,明天打磨**。DSH 生态 5 天爆发期,awesome 榜单实时建立,先发比完美重要。

## 一、今天(30 分钟内可完成)

1. **建远程仓库**:GitHub 新建仓库,名字建议 `dsnle`(或 `dsh-nle`),描述用:
   ```
   Project memory & cognition layer for DeepSeek Harness — constrain / observe / remember / verify, built on DSH native primitives.
   ```
2. **推送**:
   ```bash
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
3. **打 topic**:仓库页 Settings → Topics,添加 **`dsh-plugin`**(官方生态发现机制,必打)+ `deepseek-harness`、`agent-memory`、`coding-agent`
4. **本地自测一遍安装**(发布前最后确认,建议 `--dry-run` 先看输出):
   ```bash
   node install-dsnle.mjs --dry-run
   ```

## 二、推广文案(可直接复制)

### 中文(发 DSH 讨论区,回应"求 memory 能力"那条 26 评热帖)

> **DSNLE:DSH 的项目记忆与认知层**
>
> 社区呼声最高的 memory 能力,我做成了一个四层系统,全部长在 DSH 原生机制上:
>
> - **约束**:强制工作流(suggest→focus→impact→编辑→select→guard),未定向改码被 deny;scope 锁支持证据推翻;shell 绕行全工具拦截
> - **观测**:内容哈希 + 内核级版本守卫(stale 写前拦截)+ 工具/文件双真相对账
> - **记忆**:learned(关键词→文件,置信度衰减跨项目提升)+ 历史会话先例检索 + git 共改/churn/rollback,落盘 skills 文件跨会话存续
> - **可靠**:契约门 + guard 总闸 + 闭合反射自我修正
>
> 证据:47 个真实仓库修复(官方断言验收)、245 项确定性回归、去 gold 化连续 20 卡 20/20。研究附录含 40 卡逐卡数据与审计裁定,全部可查。
> 一键安装:`node install-dsnle.mjs`,新会话自动挂载。
> 诚实边界:长期(跨仓库/跨月)证据是初步的——这正是开源想从真实使用里得到的。

### English

> **DSNLE — project memory & cognition for DSH**
>
> Four layers on DSH native primitives: constrain (enforced workflow + scope lock + shell bypass guard), observe (content hashing + kernel version guards + dual-source truth), remember (learned with confidence decay, historical-session precedents, git co-change/churn/rollback), verify (contract gate + guard + closing reflection).
> Evidence: 47 real-repo fixes (upstream-verified), 245 deterministic assertions, gold-free 20-card run 20/20. One-command install, auto-mounts on new sessions. Honest boundaries documented.

## 三、向 awesome 列表提 PR(今晚或明天)

候选列表(按 star 排序,全部打 PR 或任选其一):
- `awesome-dsh-plugin/awesome-dsh-plugin`(★2464)
- `AdamPlatin123/awesome-dsh-plugins`(★938,自动扫描雷达,PR 前先看它的收录格式)
- `0xsline/awesome-deepseek-harness`(★460)

PR 内容一句话即可:
```
Add DSNLE — project memory & cognition layer (learned confidence memory, session precedents, git co-change; 47 verified fixes, 245 assertions; preset install via install-dsnle.mjs)
```

## 四、明天细改清单(不阻塞发布)

- [ ] README 加一张架构图或工作流 ASCII 图
- [ ] 补一个 60 秒 demo 说明(最好有真实录屏,没有就先写文字版)
- [ ] discussions/issue 模板(怎么报告边界问题)
- [ ] 若有评论提问,把高频问题补进 README FAQ 段
- [ ] 观察 awesome 雷达收录后访问来源,决定下一步

## 五、发布后第一周建议

1. **每天看一次 DSH 更新**:官方明说兼容性破坏,你是深度集成插件,第一时间适配 = 权威性
2. **回复每一条 issue**(哪怕是"怎么装"),第一周响应速度决定社区印象
3. **记录真实使用数据**:任何用户反馈的"长期使用体验"都补进 docs/research/(这正是你缺的证据)
