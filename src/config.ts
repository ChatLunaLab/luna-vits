import { Schema } from 'koishi'
import { SpeakerKeyIdMap } from './constants'

export const Config = Schema.intersect([
    Schema.object({
        defaultSpeaker: Schema.union(
            Object.values(SpeakerKeyIdMap).map((s) => s[1])
        )
            .description('全局默认的讲者。')
            .required()
    }).description('全局配置')
])

export const inject = {
    optional: ['translator', 'vits']
}

export interface Config {
    defaultSpeaker: string
}

export const name = 'luna-vits'

export const usage =
    `
配置文件在 \`data/luna-vits/config.yml\`，请前往此处查看。
如果你修改了配置文件，请重启 koishi 后查看最新的列表。

<h2>🌈 使用</h2>
<ul>
<li>建议自行添加别名。</li>
</ul>

---

<h2>🌼 指令</h2>

<h3>lunavits</h3>
<p>显示语音合成使用帮助。</p>
<pre><code>lunavits</code></pre>

<h3>lunavits -s 东雪莲|塔菲|坏女人星瞳...</h3>
<p>将输入的文本转换为东雪莲|塔菲|坏女人星瞳...的语音。</p>
<pre><code>lunavits -s 东雪莲|塔菲|坏女人星瞳... 你好</code></pre>

---

<h2>兼容原始 vits 指令</h2>
<p>下表为每个讲者对应的 speaker_id，如果某个使用了 vits 插件的插件需要这个数字的 speaker_id，你可以根据下表来获取实际的 id。</p>

<details>
<summary>点击展开/折叠 全部的 [讲者--speaker_id] 列表</summary>
<table>
<thead>
<tr>
<th>讲者</th>
<th>speaker_id</th>
</tr>
</thead>
<tbody>
` +
    Object.entries(SpeakerKeyIdMap)
        .map(
            (s) => `<tr><td>${s[1][1]}</td><td>${s[0]}</td></tr>
`
        )
        .join('') +
    `
</tbody>
</table>
</details>

---

`
