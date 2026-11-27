---
name: morfa-canvas
description: 在 Morfa 画布上设计或修改界面。创建宣传页、海报、屏幕和组件树时使用。
---

# Morfa 画布

节点就是 page。子节点用 parentRef（同一批）或 parentId（已有节点）放进父节点。根节点的 x、y 是世界坐标；子节点的 x、y 是相对父节点的偏移，世界坐标等于父节点世界坐标加上这个偏移。拖动父节点时子节点跟着走，不要再给子节点加同一段位移。宽高、颜色、字号都写在节点自己的字段上，不要写进一段 CSS 字符串。

没有 kind 的节点只是容器，画面上不会出现文字。要出现字，必须 kind 为 text，正文放在 text。variant 用 heading、paragraph 或 label。按钮 kind 为 button。图片 kind 为 image，地址写在 src。节点名称只在编辑器里开关显示，不要为了标注再画一层文字。

带 frame（iphone、android、watch）的页面是设备壳，例如 iPhone 15 Pro Max。它只负责手机外形和运行入口。不要把界面组件 parent 到设备壳上，也不要在设备壳上写标题和按钮。

每个屏幕单独做一张没有 frame 的空白页面。组件是这张空白页的子节点，x、y 相对这张页面。设备壳和空白页是两个根节点，用 create_link 连起来，表示运行时从设备进入哪一页。连线不是父子。多个屏幕就做多张空白页，页面之间再用链接跳转，不要全塞进同一个手机框。

做完调用 capture_page 或 capture_canvas。工具会把 PNG 作为图片交回，必须看图检查重叠、出界和是不是画在设备壳上。短链接只是备用，不能代替看图。

## 工具

先 list_nodes 看结构。不要用 get_canvas 把整份文档读进来。

新建一整屏用一次 create_nodes，把根画面和全部子节点放在同一个 nodes 数组里。父节点写在子节点前面。改一个已有节点用 patch_node，只填要改的字段。

nodes 的每一项可以有：ref、name、parentRef、parentId、x、y、width、height、kind、variant、text、fill、color、fontSize、fontWeight、textAlign、radius、padding、src、overflowX、overflowY、data。

fill 是背景，color 是字色。两者都可以写成普通颜色，或写成数据引用 ${self.键}。textAlign 是 left、center 或 right。width、height、fontSize、radius、padding、x、y 是数字，单位是 px。

data 是这个节点自己的数据，形如 [{key, type, value}]。type 用 text、number、color、date 或 boolean。子节点写 ${self.键} 时，会先用自己的数据，没有再用父节点的。要在运行时改某个键，在行为图里连一条 setData，targetId 指向声明了这个键的节点。样式会跟着新值重算。这是通用的数据，不要为某一种切换另做能力。

同一段行为要在多个事件里用时，用函数，不要把同一串节点复制多份。用 update_behavior，不传 pageId，写入整份项目行为图。

行为节点在画布上只有一行标题，宽 220。横着至少隔 280，竖着至少隔 120。完整句子在右侧编辑，不要为了塞下长句子把节点排得很密。

- function 节点的 text 是名字。params 是参数列表，每项只有 key。
- 函数体里的块写 scopeId，值是这个 function 的 id。从 function 出口连出去的整段实现也会被算进这个函数。编辑器的边框包住函数节点和这段实现，一直到这条流的末尾。函数节点放进另一个函数的边框里，就是内嵌函数，它自己的体再写它的 scopeId。
- call 节点的 key 是 function 的 id。args 按参数名给值，值可以是字面量，或 ${节点id.键}。每个事件只连到 call。
- 同一组数据、样式、文本改动合成一个 apply。value 是 JSON 数组，每项有 targetId、kind、key、value。kind 用 data、style 或 text。
- 以 __名称__ 这种形式作为 setData、apply 或判断的 key 时，写的是当前这次调用内部的数据，不会写到画布节点上，调用结束就消失。
- loop 节点的 value 是次数，key 是索引名，默认 __i__。body 端口是每次重复的体，done 端口是次数用完之后。次数最多 50。

```json
{"version":2,"triggers":[],"states":[],"blocks":[
  {"id":"fn","type":"function","x":40,"y":40,"text":"换成深色","params":[{"key":"bg"}]},
  {"id":"set","type":"action","scopeId":"fn","x":80,"y":180,"action":{"id":"set","type":"apply","value":"[{\"targetId\":\"画面id\",\"kind\":\"data\",\"key\":\"bg\",\"value\":\"${bg}\"},{\"targetId\":\"\",\"kind\":\"data\",\"key\":\"__step__\",\"value\":\"1\"}]"}},
  {"id":"click","type":"event","x":40,"y":360,"event":"click","nodeId":"按钮id"},
  {"id":"use","type":"call","x":360,"y":360,"key":"fn","args":[{"key":"bg","value":"#161411"}]}
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
