import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function GuidePage() {
  return (
    <div className="mx-auto max-w-[800px] space-y-8 pb-16">
        <header>
          <h1 className="text-xl font-semibold">操作说明</h1>
          <p className="mt-1 text-sm text-mesh-dim">
            Nexus 使用指南：发现、安装、同步到智能体，以及连接企业盘古 Hub。本地离线归属为系统内部使用，不在技能平台列表中显示。
          </p>
        </header>

        <Section id="overview" title="1. 产品概览">
          <p>
            Nexus 是桌面端 AI Agent 技能管理器：从公共/企业技能源发现 Skill，安装到本机仓库，再同步到 Cursor、Claude Code
            等智能体目录；也可新建/导入 Skill 并发布到 SkillHub。
          </p>
          <ul>
            <li>
              <Link to="/dashboard">工作台</Link>：总览状态与快捷入口
            </li>
            <li>
              <Link to="/skills/discover">发现</Link>：浏览各源技能列表并安装
            </li>
            <li>
              <Link to="/skills/mine">我的</Link>：已安装、新建、导入的 Skill
            </li>
            <li>
              <Link to="/publish">发布</Link>：登录后发布到盘古 Hub 命名空间（可见性同 SkillHub）
            </li>
            <li>
              <Link to="/settings/sources">技能源配置</Link> / <Link to="/settings/agents">智能体配置</Link>
              ：连接与默认同步
            </li>
          </ul>
        </Section>

        <Section id="account" title="2. 账号与游客">
          <p>
            Nexus 与 SkillHub（盘古 Hub）使用<strong>同一套账号</strong>。入口在右上角用户菜单。
          </p>
          <ul>
            <li>
              <strong>游客（未登录）</strong>：可浏览公共 Skill（ClawHub、讯飞、SkillsMP 等匿名可读目录）；不能一键连接盘古，也不能向盘古发布。
            </li>
            <li>
              <strong>账号密码登录</strong>：登录配置的盘古 Hub（默认 <code>http://localhost:8080</code>），用于探测命名空间、连接企业源、发布。
            </li>
            <li>
              <strong>退出登录</strong>：清除会话；已连接的盘古源会标记失权并禁用，未安装的盘古列表项会清理。
            </li>
          </ul>
        </Section>

        <Section id="sources" title="3. 技能源配置">
          <p>技能平台按「Hub / 市场」维度管理，不是按命名空间拆源。</p>
          <h3>当前预置真实源</h3>
          <ul>
            <li>ClawHub（公网）</li>
            <li>讯飞 SkillHub（公网）</li>
            <li>SkillsMP（公网索引）</li>
            <li>Pale Blue Dot（公网索引）</li>
          </ul>
          <p>
            也可手动「添加源」。系统内部仍有本地归属（新建/导入 Skill 使用），但<strong>技能源配置页不展示</strong>。
          </p>
          <h3>常用操作</h3>
          <ul>
            <li>
              <strong>启用/禁用</strong>：禁用后不参与列表刷新
            </li>
            <li>
              <strong>测试连接</strong>：探测 API 可达；成功后会刷新该源列表
            </li>
            <li>
              <strong>刷新列表</strong>：拉取远程 Skill 列表（见下一节）
            </li>
            <li>
              <strong>重试失败源</strong>：仅重试上次刷新报错的源
            </li>
          </ul>
        </Section>

        <Section id="pangu" title="4. 盘古 Hub 与命名空间">
          <ol>
            <li>右上角登录 SkillHub 账号</li>
            <li>
              打开 <Link to="/settings/sources">技能源配置</Link>：若账号在 Hub 下有 ≥1 个命名空间，会出现「检测到盘古 Hub」
            </li>
            <li>
              点击<strong>一键连接</strong>：创建/更新<strong>单个</strong>盘古源（多空间挂在同一源下展示）
            </li>
            <li>连接后技能列表会按你有权的命名空间聚合拉取</li>
          </ol>
          <p>
            <strong>权限心跳（约 30 秒）</strong>：检查 <code>/me/namespaces</code>。部分空间失权 → 空间与可见列表收缩；全部失权或会话失效 →
            源断开并提示。此过程不修改 SkillHub 服务端策略，使用登录 Session。
          </p>
        </Section>

        <Section id="catalog" title="5. 刷新列表（≠ 同步到智能体）">
          <p>
            「刷新列表」= 从技能源拉取远程 Skill 到 Nexus。与「同步到智能体」（把本机 Skill 写入 Agent 目录）是两件事。
          </p>
          <h3>何时触发</h3>
          <ul>
            <li>
              <strong>首次启动</strong>：不会自动拉取，需手动点「刷新列表 / 刷新全部列表」完成首次同步
            </li>
            <li>之后启动：若距上次成功超过约 15 分钟，后台静默刷新；否则用缓存</li>
            <li>发现页进入：同样走「新鲜度」判断，不强制全量</li>
            <li>手动点「刷新列表 / 刷新全部列表」：强制刷新</li>
            <li>测试连接成功、一键连接盘古、命名空间变化（心跳）时：刷新相关源</li>
          </ul>
          <h3>源卡片信息</h3>
          <ul>
            <li>上次刷新列表时间</li>
            <li>失败原因（若有）</li>
          </ul>
        </Section>

        <Section id="discover-mine" title="6. 发现与我的">
          <h3>发现</h3>
          <ul>
            <li>按源、分类、安装状态、推荐/最新/热门/收藏筛选</li>
            <li>安装 Skill：下载到本机 Nexus 仓库</li>
            <li>批量安装 / 批量更新可用</li>
          </ul>
          <h3>我的</h3>
          <ul>
            <li>查看已安装、新建、导入的 Skill</li>
            <li>新建 / 本地导入后，可在发布页提交</li>
            <li>更新可用时，可单条或「更新全部」</li>
          </ul>
        </Section>

        <Section id="agents" title="7. 同步到智能体">
          <p>
            安装到 Nexus 后，还需（可选）同步到各智能体的 skills 目录，智能体才能加载。
          </p>
          <ul>
            <li>
              <Link to="/settings/agents">智能体配置</Link>：扫描本机 Cursor / Claude Code / Codex 等；可改路径（保存后需重启）
            </li>
            <li>
              <strong>安装后默认同步</strong>：勾选的智能体，在 Skill 安装/更新成功后会自动 link
            </li>
            <li>
              Skill 详情抽屉：可单独开关某个智能体的同步；取消同步会删除该智能体目录中的包（Nexus 本地副本保留）
            </li>
            <li>已同步到智能体的 Skill，删除前需先取消所有智能体同步</li>
          </ul>
        </Section>

        <Section id="publish" title="8. 发布">
          <ol>
            <li>登录 SkillHub，并在「技能源配置」一键连接盘古 Hub</li>
            <li>在「我的」新建或导入 Skill（仅这两类可发布）</li>
            <li>
              打开 <Link to="/publish">发布</Link>：选择 Skill → 命名空间 → 可见性（公开 / 仅空间内 / 私有）→
              版本 → 提交（与 SkillHub 空间内发布一致）
            </li>
          </ol>
          <ul>
            <li>
              <strong>游客不能发布</strong>；未连接盘古 Hub 或无命名空间时也不能发布
            </li>
            <li>公开 / 仅空间内：通常进入审核；私有：上传为已上传状态</li>
            <li>审核中可「撤回审核」；已发布/已上传等可「删除」远端 Skill</li>
          </ul>
        </Section>

        <Section id="tasks" title="9. 任务与通知">
          <ul>
            <li>
              <Link to="/tasks">任务日志</Link>：安装、更新、删除、同步到智能体、发布等进度与失败
            </li>
            <li>顶栏铃铛：通知列表；点击可跳到相关任务</li>
            <li>列表刷新成功默认用轻量 Toast，避免刷屏；失败会明确提示</li>
          </ul>
        </Section>

        <Section id="faq" title="10. 常见问题">
          <Faq q="为什么技能源配置里看不到「本地」？">
            本地归属是内部源，给新建/导入用，已从技能平台列表隐藏，避免与远程平台混淆。
          </Faq>
          <Faq q="刷新列表和同步到智能体有什么区别？">
            刷新列表：从 Hub/市场拉 Skill 到 Nexus。同步到智能体：把已安装包写进 Cursor 等目录。
          </Faq>
          <Faq q="登录后没有「检测到盘古 Hub」？">
            确认盘古地址（默认本机 8080）可访问，且账号在 SkillHub 中至少加入一个命名空间。
          </Faq>
          <Faq q="发现页为什么没有立刻拉最新列表？">
            15 分钟内优先用缓存；需要最新数据时点「刷新列表」。
          </Faq>
          <Faq q="安装后智能体里没有？">
            在「智能体配置」勾选默认同步，或在 Skill 抽屉里打开对应智能体开关。
          </Faq>
          <Faq q="产品名是什么？">
            桌面客户端产品名为 Nexus；与后端 SkillHub / 盘古 Hub 账号体系对接，但品牌彼此独立。
          </Faq>
        </Section>
    </div>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3 rounded-mesh border border-mesh-border bg-mesh-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="guide-prose space-y-3 text-sm leading-relaxed text-mesh-muted [&_a]:text-mesh-accent [&_a]:hover:underline [&_code]:rounded [&_code]:bg-mesh-panel [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_h3]:pt-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-mesh-text [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_ol_li]:list-decimal [&_strong]:text-mesh-text">
        {children}
      </div>
    </section>
  )
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="rounded-mesh border border-mesh-border bg-mesh-panel/60 px-3 py-2.5">
      <div className="text-sm font-medium text-mesh-text">{q}</div>
      <div className="mt-1 text-xs leading-relaxed text-mesh-dim">{children}</div>
    </div>
  )
}
