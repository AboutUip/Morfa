---
name: morfa-canvas
description: 在 Morfa 画布上设计或修改界面。创建宣传页、海报、屏幕和组件树时使用。
---

# Morfa 画布

节点就是 page。子节点用 parentRef（同一批）或 parentId（已有节点）放进父节点。根节点的 x、y 是世界坐标；子节点的 x、y 是相对父节点的偏移，世界坐标等于父节点世界坐标加上这个偏移。拖动父节点时子节点跟着走，不要再给子节点加同一段位移。宽高、颜色、字号都写在节点自己的字段上，不要写进一段 CSS 字符串。

没有 kind 的节点只是容器，画面上不会出现文字。要出现字，必须 kind 为 text，正文放在 text。variant 用 heading、paragraph 或 label。按钮 kind 为 button。图片 kind 为 image，地址写在 src。

## 工具

先 list_nodes 看结构。不要用 get_canvas 把整份文档读进来。

新建一整屏用一次 create_nodes，把根画面和全部子节点放在同一个 nodes 数组里。父节点写在子节点前面。改一个已有节点用 patch_node，只填要改的字段。

nodes 的每一项可以有：ref、name、parentRef、parentId、x、y、width、height、kind、variant、text、fill、color、fontSize、fontWeight、textAlign、radius、padding、src、overflowX、overflowY、data。

fill 是背景，color 是字色。两者都可以写成普通颜色，或写成数据引用 ${self.键}。textAlign 是 left、center 或 right。width、height、fontSize、radius、padding、x、y 是数字，单位是 px。

data 是这个节点自己的数据，形如 [{key, type, value}]。type 用 text、number、color、date 或 boolean。子节点写 ${self.键} 时，会先用自己的数据，没有再用父节点的。要在运行时改某个键，在行为图里连一条 setData，targetId 指向声明了这个键的节点。样式会跟着新值重算。这是通用的数据，不要为某一种切换另做能力。

同一段行为要在多个事件里用时，用函数，不要把同一串节点复制多份。用 update_behavior，不传 pageId，写入整份项目行为图。

- function 节点：type 为 function，text 是名字。从它的出口接上要复用的步骤，这些边就是函数体。
- call 节点：type 为 call，key 填那个 function 的 block id。执行时先跑函数体，再顺着 call 自己的出口继续。
- 每个事件只连到 call。两个按钮要做同一件事时，两个 call 的 key 都指向同一个 function。

```json
{"version":2,"triggers":[],"states":[],"blocks":[
  {"id":"fn","type":"function","x":40,"y":240,"text":"换成深色"},
  {"id":"set","type":"action","x":300,"y":240,"action":{"id":"set","type":"setData","targetId":"画面id","key":"bg","value":"#161411"}},
  {"id":"click","type":"event","x":40,"y":40,"event":"click","nodeId":"按钮id"},
  {"id":"use","type":"call","x":300,"y":40,"key":"fn"}
],"edges":[
  {"id":"body","from":"fn","to":"set"},
  {"id":"go","from":"click","to":"use"}
]}
```

src 是图片或视频地址。overflowY 和 overflowX 用 visible、hidden、auto 或 scroll。要让一块区域滚动，就把容器的 overflowY 设为 auto，再放一个比容器更高的子节点。

其他工具仍然可用。参数不清楚时先 get_mcp_capability，不要猜。

## 一屏要成立

不要交一张 800×800 的白卡片，也不要只放一个写着标题的方块。

宣传页或海报至少要有：

- 一个尺寸明确的根画面。手机用 390×844，竖版海报用 1080×1620 这一类比例。
- 一种底色、一种强调色、一种中性色。不要每个方块都是白色。
- 一个大标题、一句能读完的说明、一个行动按钮。
- 产品或主体的色块，四周留出边距。文字不要贴边，也不要互相重叠。

文案用用户正在说的语言写完整，不要用 Heading、Button、Lorem。

写完再 list_nodes。字出了画面、叠在一起、或者根画面仍然是默认白框，就用 patch_node 改掉。

## 回复

用户看得见的话写在正文里，句子要说完。思考和工具调用不是正文。先说明要做什么，再改画布，最后用一两句说改了什么。
