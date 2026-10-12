import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Tekvro · 探核",
  description: "用证据看懂软件 — AI 辅助的本地软件分析工具",
  lang: "zh-CN",
  base: "/Tekvro/",
  themeConfig: {
    nav: [
      { text: "开始使用", link: "/zh-CN/quick-start" },
      { text: "H5 / JS 分析", link: "/zh-CN/javascript-h5-electron" },
      { text: "项目架构", link: "/zh-CN/architecture" },
      { text: "技术参考", link: "/mcp-contracts" },
      { text: "维护计划", link: "/roadmap" },
    ],
    sidebar: [
      {
        text: "中文入门",
        items: [
          { text: "快速上手", link: "/zh-CN/quick-start" },
          {
            text: "H5 / JavaScript / Electron",
            link: "/zh-CN/javascript-h5-electron",
          },
          { text: "项目架构", link: "/zh-CN/architecture" },
          { text: "常见问题", link: "/zh-CN/faq" },
          { text: "安全与授权", link: "/zh-CN/security" },
          { text: "品牌说明", link: "/BRAND" },
          { text: "维护路线", link: "/roadmap" },
        ],
      },
      {
        text: "高级技术资料（英语）",
        collapsed: true,
        items: [
          { text: "安装与配置", link: "/installation" },
          { text: "CLI 与 Evidence", link: "/cli" },
          { text: "MCP 契约", link: "/mcp-contracts" },
          {
            text: "JavaScript / Electron",
            link: "/javascript-artifact-reconstruction",
          },
          { text: "浏览器观察", link: "/browser-observation" },
          { text: "原生二进制", link: "/native-investigation" },
          { text: "Android", link: "/android-analysis" },
          { text: "测试", link: "/testing" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/ForceMind/Tekvro" },
    ],
    editLink: {
      pattern: "https://github.com/ForceMind/Tekvro/edit/main/docs/:path",
      text: "编辑此页",
    },
    footer: {
      message:
        "Tekvro 是 REA 的独立衍生研发项目；原作者 MIT 许可证及版权说明予以保留。",
      copyright: "© 2026 ForceMind · Original REA © 2026 morluto",
    },
  },
});
