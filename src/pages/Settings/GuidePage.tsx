import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function GuidePage() {
  return (
    <div className="mx-auto max-w-[800px] space-y-8 pb-16">
      <header>
        <h1 className="text-xl font-semibold">操作说明</h1>
        <p className="mt-1 text-sm text-mesh-dim">
          Nexus 使用指南：发现、安装、同步到智能体，连接盘古 Hub，以及上传/规范化/发布 Skill。本地离线归属为系统内部使用，不在技能平台列表中显示。
        </p>
      </header>

      <Section id="overview" title="1. 产品概览">
        <p>
          Nexus 是桌面端 AI Agent 技能管理器：从公共/企业技能源发现 Skill，安装到本机仓库，再同步到 Cursor、Claude Code
          等智能体目录；也可新建/导入 Skill，或上传 zip 经规范化后发布到 SkillHub。
        </p>
        <ul>
          <li>
            <Link to="/dashboard">工作台</Link>：总览状态、智能体网络与快捷入口
          </li>
          <li>
            <Link to="/skills/discover">发现</Link>：浏览各源技能列表并安装
          </li>
          <li>
            <Link to="/skills/mine">我的</Link>：已安装、新建、导入的 Skill
          </li>
          <li>
            <Link to="/publish">发布</Link>：上传 zip 规范化发布，或发布本地新建/导入的 Skill
          </li>
          <li>
            <Link to="/tasks">任务中心</Link>：安装、同步、发布等进度
          </li>
          <li>
            <Link to="/settings/sources">技能来源</Link> / <Link to="/settings/agents">智能体管理</Link>
            ：连接源与默认同步
          </li>
        </ul>
      </Section>

      <Section id="account" title="2. 账号与登录（48 小时）">
        <p>
          Nexus 与 SkillHub（盘古 Hub）使用<strong>同一套账号</strong>。入口在右上角用户菜单；登录框可填写 / 测试 /
          保存 SkillHub 地址。
        </p>
        <ul>
          <li>
            <strong>游客（未登录）</strong>：可浏览公共 Skill（ClawHub、讯飞、SkillsMP 等）；不能连接盘古，也不能发布。
          </li>
          <li>
            <strong>登录</strong>：填写 Hub 地址（默认 <code>http://localhost:8080</code>，也可填内网或 Cloudflare
            Tunnel 公网地址）→ 建议先「测试连接」→ 再登录。
          </li>
          <li>
            <strong>会话有效期 48 小时</strong>：登录成功后，无论是否重启应用，在 48 小时内保持登录，除非主动注销。到期后需重新登录。
          </li>
          <li>
            <strong>登录后自动连接盘古</strong>：若账号有可用命名空间，会自动一键连接盘古 Hub，无需再手动点连接。
          </li>
          <li>
            <strong>退出登录</strong>：清除本地会话与 Hub Cookie；已连接的盘古源会移除。
          </li>
        </ul>
        <h3>Cloudflare Tunnel / 临时公网地址</h3>
        <ul>
          <li>
            <code>*.trycloudflare.com</code> 等地址：<strong>ping 通不等于可用</strong>。若返回 HTTP 530 /
            1033，说明隧道未在线（本机 <code>cloudflared</code> 未跑或临时链接已失效）。
          </li>
          <li>请用浏览器打开同一地址验证；临时 tunnel 重启后 URL 会变，需更新登录框中的 Hub 地址。</li>
        </ul>
      </Section>

      <Section id="sources" title="3. 技能来源">
        <p>技能平台按「Hub / 市场」维度管理，不是按命名空间拆源。</p>
        <h3>当前预置真实源</h3>
        <ul>
          <li>ClawHub（公网）</li>
          <li>讯飞 SkillHub（公网）</li>
          <li>SkillsMP（公网索引）</li>
          <li>Pale Blue Dot（公网索引）</li>
        </ul>
        <p>
          也可手动「添加源」。系统内部仍有本地归属（新建/导入 Skill 使用），但<strong>技能来源页不展示</strong>。
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
          <li>右上角登录 SkillHub 账号（可改 Hub 地址并测试连接）</li>
          <li>登录成功且存在命名空间时，通常会<strong>自动连接</strong>盘古 Hub</li>
          <li>
            若未自动连接：打开 <Link to="/settings/sources">技能来源</Link>，点击「一键连接」
          </li>
          <li>连接后技能列表会按你有权的命名空间聚合拉取</li>
        </ol>
        <p>
          <strong>权限心跳（约 30 秒）</strong>：检查 <code>/me/namespaces</code>。部分空间失权 →
          空间与可见列表收缩；Hub Cookie 失效时源会断开，但本地 48 小时登录态仍保留——发布前会尝试自动恢复会话，必要时需重新登录刷新凭证。
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
          <li>发现页进入：可触发刷新（按新鲜度）；需要最新数据时手动点刷新</li>
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
          <li>点击卡片打开<strong>居中详情弹窗</strong>（非侧栏抽屉）：浏览说明、安装、同步到智能体</li>
          <li>安装 Skill：下载到本机 Nexus 仓库；可预览 SKILL.md</li>
          <li>批量安装 / 批量更新可用</li>
        </ul>
        <h3>我的</h3>
        <ul>
          <li>查看已安装、新建、导入的 Skill</li>
          <li>
            <strong>新建</strong>：创建 Markdown Skill（自动补全 frontmatter）
          </li>
          <li>
            <strong>导入</strong>：支持本地目录、.zip 包，或单个 .md 文件
          </li>
          <li>新建 / 导入后，可在发布页提交到盘古 Hub</li>
          <li>更新可用时，可单条或「更新全部」</li>
        </ul>
      </Section>

      <Section id="agents" title="7. 同步到智能体">
        <p>安装到 Nexus 后，还需（可选）同步到各智能体的 skills 目录，智能体才能加载。</p>
        <ul>
          <li>
            <Link to="/settings/agents">智能体管理</Link>
            ：扫描本机 Cursor / Claude Code / Codex / Trae / Qoder 等；可<strong>按智能体单独修改</strong> Skill
            路径（保存前会校验路径；保存后通常需重启生效）
          </li>
          <li>
            <strong>安装后默认同步</strong>：勾选的智能体，在 Skill 安装/更新成功后会自动 link
          </li>
          <li>
            Skill 详情弹窗：可单独开关某个智能体的同步；取消同步会删除该智能体目录中的包（Nexus 本地副本保留）
          </li>
          <li>已同步到智能体的 Skill，删除前需先取消所有智能体同步</li>
        </ul>
      </Section>

      <Section id="publish" title="8. 发布（上传规范化 + 本地 Skill）">
        <p>
          打开 <Link to="/publish">发布</Link>，先登录并确保盘古 Hub 已连接且有命名空间。弹窗相对屏幕<strong>上下左右居中</strong>。
        </p>
        <h3>方式 A：上传 Zip（推荐任意来源包）</h3>
        <ol>
          <li>选择「上传 Zip」→ 选择 <code>.zip</code>（不会直接发布）</li>
          <li>
            平台自动：解压 → 格式检测 → 补全元数据 → 生成 manifest / README / skill 说明 → 安全检查 → 重新打包
          </li>
          <li>若检测到多个入口文件，需手动选择入口</li>
          <li>预览规范化结果（名称、版本、描述、文件树、警告）</li>
          <li>选择命名空间与可见性 → 提交发布</li>
        </ol>
        <p>
          支持两种包形态：普通压缩包（如仅有脚本/配置）与标准 Skill Package（已有{' '}
          <code>manifest.json</code>）。纯文档类包也可发布，不必强制选代码入口。
        </p>
        <h3>方式 B：我的技能（新建 / 本地导入）</h3>
        <ol>
          <li>选择「我的技能」→ 选择本地新建或导入的 Skill → 填写版本</li>
          <li>选择命名空间与可见性 → 提交（客户端打包后上传）</li>
        </ol>
        <h3>可见性与审核</h3>
        <ul>
          <li>
            <strong>公开 / 仅空间内</strong>：通常进入<strong>审核中</strong>（通知与列表会显示「审核中」，不是「发布完成」）
          </li>
          <li>
            <strong>私有</strong>：上传为已上传状态，无需命名空间审核
          </li>
          <li>审核中可「撤回审核」；已发布/已上传等可「删除」远端 Skill</li>
          <li>可点「同步审核状态」拉取远端最新状态</li>
        </ul>
        <p>
          若界面显示已登录但仍提示登录：多为 Hub Cookie 失效。重新登录一次即可；发布前客户端也会尝试自动恢复会话。
        </p>
      </Section>

      <Section id="tasks" title="9. 任务与通知">
        <ul>
          <li>
            <Link to="/tasks">任务中心</Link>：安装、更新、删除、同步到智能体、发布等进度与失败原因
          </li>
          <li>失败任务<strong>不再提供一键重试</strong>（避免误操作）；请回到对应页面重新发起</li>
          <li>顶栏铃铛：通知列表；审核中的发布会提示「审核中」</li>
          <li>相对时间按本地时区解析（避免仅日期字符串被当成 UTC 午夜导致差约 8 小时）</li>
        </ul>
      </Section>

      <Section id="version" title="10. 版本与数据目录">
        <p>
          在高级设置中可查看当前应用版本、程序目录与用户数据目录。安装包会保留用户数据；应用内更新入口已简化为信息展示。
        </p>
      </Section>

      <Section id="faq" title="11. 常见问题">
        <Faq q="为什么技能来源里看不到「本地」？">
          本地归属是内部源，给新建/导入用，已从技能平台列表隐藏，避免与远程平台混淆。
        </Faq>
        <Faq q="刷新列表和同步到智能体有什么区别？">
          刷新列表：从 Hub/市场拉 Skill 到 Nexus。同步到智能体：把已安装包写进 Cursor 等目录。
        </Faq>
        <Faq q="登录后要保持多久？重启会掉吗？">
          自登录起 48 小时内有效，重启应用也保持；只有到期或主动注销才会退出。
        </Faq>
        <Faq q="登录报 HTTP 530 / Cloudflare Tunnel？">
          隧道未在线：本机 cloudflared 未运行，或 trycloudflare 临时链接已失效。用浏览器打开同一地址确认，修复隧道或更换最新 URL。
        </Faq>
        <Faq q="登录后没有盘古 Hub / 无法发布？">
          确认 Hub 地址可访问，账号至少加入一个命名空间；登录后应自动连接，否则到「技能来源」一键连接。
        </Faq>
        <Faq q="已登录已连盘古，提交发布却提示先登录？">
          多为 Hub Cookie 与界面登录态不同步。重新登录刷新凭证即可；当前版本发布前会自动探测并尝试恢复。
        </Faq>
        <Faq q="发现页为什么没有立刻拉最新列表？">
          15 分钟内优先用缓存；需要最新数据时点「刷新列表」。
        </Faq>
        <Faq q="安装后智能体里没有？">
          在「智能体管理」勾选默认同步，或在 Skill 详情弹窗里打开对应智能体开关。
        </Faq>
        <Faq q="产品名是什么？">
          桌面客户端产品名为 Nexus；与后端 SkillHub / 盘古 Hub 账号体系对接，但品牌彼此独立。
        </Faq>
      </Section>

      <Section id="changelog-today" title="12. 近期更新摘要">
        <ul>
          <li>登录会话 48 小时持久化（含重启）；登录后自动连接盘古 Hub</li>
          <li>登录框支持自定义 Hub 地址、测试连接与保存</li>
          <li>发布向导：上传 zip → 检测/规范化/预览 → 发布；弹窗屏幕居中</li>
          <li>支持发布本地新建/导入 Skill；发布前自动校验并恢复 Hub 会话</li>
          <li>Skill 详情改为居中弹窗；智能体路径可单独编辑并校验</li>
          <li>审核中通知文案、相对时间时区、任务失败不再显示重试</li>
          <li>Cloudflare Tunnel 530/1033 给出更明确的错误说明</li>
        </ul>
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
