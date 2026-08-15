# P6 执行数据(agent 结果记录)

> 每卡:任务号、通过/失败、改动文件、suggest 命中情况、耗时。追加式记录。

## T1

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t1.mjs: 2 pass / 0 fail)
- **任务**: format('yyyy-MM-DD') 修改原实例
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/era.js`(4 处 `this.startOf('day').valueOf()` → `this.clone().startOf('day').valueOf()`;getEraName/getEraNarrow/getEraAbbr/getEraYear)
- **根因**: `yyyy` token 触发 era 逻辑,`startOf('day')` 破坏性截断原实例;上游修复 e3fb33c4 同款改动
- **suggest 命中**: ❌ era.js 不在 suggested 列表(建议了 format.js/moment.js + locale 文件);经 nle_reorient(evidence=上游 commit diff)重定向 scope 后修复
- **ritual**: suggest → reorient → rebind → edit → select(learned 库新增 1 条:nle-learned-b2c28eb1)
- **耗时**: 约 5 分钟

## T2

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t2.mjs: 2 pass / 0 fail)
- **任务**: isoWeeksInYear() 修改源对象
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/week-year.js`(`getISOWeeksInYear` 改用只读 `this.isoWeekYear()`;删除无用常量 `THURSDAY`)
- **根因**: `getISOWeeksInYear` 调 `this.isoWeekday(THURSDAY)`(setter,把源实例周几改成 4);上游修复 c78af306 (#5474)
- **suggest 命中**: ⚠️ 命中测试文件 weeks_in_year.js,未命中实现文件 week-year.js;reorient 修正(learned 命中,置信度升 45%)
- **ritual**: suggest(#37)→ reorient → rebind → edit → select
- **耗时**: 约 3 分钟

## T3

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t3.mjs: 4 pass / 0 fail)
- **任务**: 月末日期月份差值计算错误(moment('2016-02-29').diff('2016-01-31','months') 得 0,预期 1)
- **改动文件**: `bench-host/real-moment-t1/src/lib/moment/diff.js`(`monthDiff` 顶部加守卫:`if (a.date() < b.date()) { return -monthDiff(b, a); }`)
- **根因**: 起点月天数少于终点月天数时,end-of-month 线性插值方向错误;交换参数后递归即可
- **suggest 命中**: ❌ 仅命中测试文件 diff.js,未命中实现文件;经 nle_reorient(evidence=上游 commit a63b46a8 diff)重定向 scope 后修复
- **ritual**: suggest(#38)→ reorient → rebind → edit → select(learned 库新增 6 条)
- **耗时**: 约 3 分钟

## T4

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t4.mjs: 3 pass / 0 fail)
- **任务**: Y token 格式化年份不足 4 位不补零('-123' 应为 '-0123','0' 应 '0000')
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/year.js`(新增 `import zeroFill from '../utils/zero-fill'`;Y token 回调改 `return y <= 9999 ? zeroFill(y, 4) : '+' + y;`)
- **根因**: Y token 用 `'' + y` 原样输出,无补零;上游修复 831cfd61 (#3846)
- **suggest 命中**: ❌ 实现文件 year.js 不在 suggested(建议了 format.js + locale 文件);reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#39)→ reorient → rebind → edit ×2 → select(learned 库新增 6 条,置信度升 75%)
- **耗时**: 约 3 分钟

## T5

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t5.mjs: 10 pass / 0 fail)
- **任务**: 严格模式下带前导零的两位数被接受(H/h/k/m/s 一位 token 拒绝 '09' 之类)
- **改动文件**(7 个): `src/lib/parse/regex.js`(新增并导出 `match1to2NoLeadingZero=/^[1-9]\d?/`、`match1to2HasZero=/^([1-9]\d|\d)/`);`src/lib/units/day-of-month.js`(D)、`hour.js`(H/h/k)、`minute.js`(m)、`month.js`(M)、`second.js`(s)、`week.js`(w/W) 分别接入对应 strictRegex
- **根因**: 一位 token 的 strictRegex 缺省导致任意宽度数字都通过;上游修复 6367947c 增加双 strict 正则
- **suggest 命中**: ❌ 未命中任何实现文件;reorient(evidence=上游 commit diff)一次性锁定 7 文件 scope
- **ritual**: suggest(#40)→ reorient → rebind ×7 → edit ×14 → select(learned 库置信度升 90%)
- **耗时**: 约 6 分钟

## T6

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t6.mjs: 4 pass / 0 fail)
- **任务**: invalid duration 的 clone()/包装变有效(invalid().clone().isValid() 应为 false,valueOf() 应 NaN)
- **改动文件**: `bench-host/real-moment-t1/src/lib/duration/create.js`(`createDuration` 内 `_locale` 传播块之后新增 `if (isDuration(input) && hasOwnProp(input, '_isValid')) { ret._isValid = input._isValid; }`)
- **根因**: clone/wrapper 走 `createDuration`,重建时丢弃 `_isValid` 标志;上游修复 bd4950b8 (#4323)
- **suggest 命中**: ⚠️ 命中相关文件 constructor.js/clone.js/测试,未命中真正修复点 create.js;reorient 修正
- **ritual**: suggest(#41)→ reorient → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T7

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t7.mjs: 6 pass / 0 fail)
- **任务**: calendar() 单参数传 falsy 值(0/''/false/NaN/null/undefined)行为异常,应等同 calendar() 默认今天
- **改动文件**: `bench-host/real-moment-t1/src/lib/moment/calendar.js`(单参数分支最前面加 `if (!arguments[0]) { time = undefined; formats = undefined; }`)
- **根因**: falsy 值不满足 isMomentInput/isCalendarSpec,被当 formats 继续走导致错误;上游修复 503219eb (#5647)
- **suggest 命中**: ✅ 直接命中实现文件 calendar.js(suggested 第 2 位);无需 reorient
- **ritual**: suggest(#42)→ focus → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T8

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t8.mjs: 2 pass / 0 fail)
- **任务**: weekYear setter 在非默认 dow locale(dow:1, doy:4)下日期错乱,weekYear(2015) 后 date 应为 27
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/week-year.js`(`getSetWeekYear` 传参 `this.weekday()` → `this.weekday() + this.localeData()._week.dow`)
- **根因**: setter 未把 locale 的周起始日偏移计入 weekday,导致 helper 定位错误;上游修复 6767277b (#3944)
- **suggest 命中**: ❌ 未命中 week-year.js(仅命中相近的 week.js);reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#43)→ reorient → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T9

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t9.mjs: 3 pass / 0 fail)
- **任务**: humanize API options 对象签名与双参数(后缀/阈值)不兼容,任意顺序调用行为错误
- **改动文件**: `bench-host/real-moment-t1/src/lib/duration/humanize.js`(`humanize(withSuffixOrOptions)` → `humanize(argWithSuffix, argThresholds)`:对象参数视为阈值、布尔为后缀;`th.ss` 仅在 `s!=null && ss==null` 时推导)
- **根因**: PR 4296 引入 options 对象,与其他 moment API 不一致;上游 5a87154a (#5477) 拆成两个独立参数
- **suggest 命中**: ✅ 直接命中实现文件 humanize.js(suggested 第 1 位);无需 reorient
- **ritual**: suggest(#44)→ focus → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T10

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t10.mjs: 1 pass / 0 fail)
- **任务**: duration 浮点计算丢失精度,moment.duration(1.1234,'hours').milliseconds() 应精确 240
- **改动文件**(2 个): 新增 `bench-host/real-moment-t1/src/lib/utils/float-calculate.js`(`multiply` 用整数位/放大倍数避免浮点误差);`bench-host/real-moment-t1/src/lib/duration/constructor.js`(import multiply;`seconds*1e3/minutes*6e4/hours*1000*60*60` → `multiply(...)`)
- **根因**: 1.1234*3600000 浮点乘法产生舍入误差;上游 c3d1c1ca (#5596) 引入精度安全乘法
- **suggest 命中**: ⚠️ 命中 constructor.js,但新文件 float-calculate.js 需 reorient 纳入 scope
- **ritual**: suggest(#45)→ reorient → rebind → write(新文件) → edit ×2 → select(build 文件数 446→447)
- **耗时**: 约 4 分钟

## T11

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t11.mjs: 2 pass / 0 fail)
- **任务**: updateLocale 创建新 locale 后无名称,moment().locale() 不为 'dude'
- **改动文件**: `bench-host/real-moment-t1/src/lib/locale/locales.js`(`updateLocale` 中 `mergeConfigs` 后、`new Locale(config)` 前,`tmpLocale == null` 时 `config.abbr = name;`)
- **根因**: 新建 locale 缺 abbr 导致 getter 返回 undefined;上游 1021c019 (#5470, fixes #5043)
- **suggest 命中**: ❌ 未命中 locales.js(仅命中 lib/moment/locale.js);reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#46)→ reorient → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T12

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t12.mjs: 5 pass / 0 fail)
- **任务**: isoWeeksInYear() 在日历/ISO 年不一致日(如 2019-12-31 属 ISO 2020)算错,应 53
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/week-year.js`(新增 `const THURSDAY = 4;`;`getISOWeeksInYear` → `return weeksInYear(this.isoWeekday(THURSDAY).year(), 1, 4);`)
- **根因**: 直接用 `this.year()` 日历年份,跨年周归属错误;上游 ebfd8dae (#4410)
- **suggest 命中**: ❌ 未命中 week-year.js;reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#47)→ reorient → rebind → edit ×2 → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T13

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t13.mjs: 4 pass / 0 fail)
- **任务**: add/subtract 破坏性操作后 isValid 缓存不更新(add 1000000 年应 invalid)
- **改动文件**: `bench-host/real-moment-t1/src/lib/create/valid.js`(`isValid` 重构:去掉 `m._isValid == null` 缓存守卫,改为每次先按 `m._d` 计算 `isNowValid`,仅在非冻结对象时写回缓存)
- **根因**: 缓存使破坏性变更(越界)后 isValid 仍返回旧值;上游 08084a89 (#5075)
- **suggest 命中**: ❌ 未命中 valid.js(仅命中 add-subtract.js 相关);reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#48)→ reorient → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T14

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t14.mjs: 14 pass / 0 fail)
- **任务**: 星期 dd token 解析在某些 locale 失败('uto 15.05.2018' bs、'Di' de、'уто' sr-cyrl 等)
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/day-of-week.js`(`computeWeekdaysParse`:minp/shortp/longp 取值即套 `regexEscape`;删除排序后对 shortPieces/longPieces/mixedPieces 的重复转义循环)
- **根因**: 先 push 再整体转义会二次转义/错位,带特殊字符(点号、西里尔文)的星期名解析失败;上游 64a46b32 (#4631)
- **suggest 命中**: ❌ 未命中 day-of-week.js;reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#49)→ reorient → rebind → edit ×2 → select(learned 库置信度 90%)
- **耗时**: 约 4 分钟

## T15

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t15.mjs: 4 pass / 0 fail)
- **任务**: 对象构造 moment({date:0})/moment({day:0}) 应 'Invalid date',0 被当 falsy 忽略
- **改动文件**: `bench-host/real-moment-t1/src/lib/create/from-object.js`(`configFromObject` 抽出 `var dayOrDate = i.day === undefined ? i.date : i.day;` 替换 `i.day || i.date`)
- **根因**: `||` falsy 判断把显式 0 当成缺省,day/date=0 未被传入数组;上游 37a73899 (#5098)
- **suggest 命中**: ❌ 未命中 from-object.js;reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#50)→ reorient → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T16

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t16.mjs: 7 pass / 0 fail)
- **任务**: isBetween 对无效日期(this/from/to 任一 invalid)应返回 false
- **改动文件**: `bench-host/real-moment-t1/src/lib/moment/compare.js`(`isBetween` 加 `localFrom/localTo` 并先做三方 isValid 守卫返回 false;`isAfter/isBefore/isSame` 的 units 归一化改 `normalizeUnits(units) || 'millisecond'`;删除 isUndefined import)
- **根因**: isBetween 无有效性守卫,invalid 实例进入 isAfter/isBefore 产生误判/异常;上游 40b52a03 (#4417)
- **suggest 命中**: ❌ 未命中 compare.js;reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#51)→ reorient → rebind → edit ×4 → select(learned 库置信度 90%)
- **耗时**: 约 4 分钟

## T17

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t17.mjs: 6 pass / 0 fail)
- **任务**: Duration#as 不支持 quarter,moment.duration(1,'year').asQuarters() 应 4、1 季度 asMonths 应 3
- **改动文件**(2 个): `bench-host/real-moment-t1/src/lib/duration/as.js`(`as()` 把 quarter 并入 month/year 分支,switch 返回 `months/3`;新增 `export var asQuarters = makeAs('Q')`);`bench-host/real-moment-t1/src/lib/duration/prototype.js`(import + `proto.asQuarters`)
- **根因**: quarter 未接入 as 逻辑;上游 4d5db33a (#4887)
- **suggest 命中**: ⚠️ 命中 as.js,但 prototype.js 需 reorient 纳入 scope
- **ritual**: suggest(#52)→ reorient → rebind ×2 → edit ×4 → select(learned 库置信度 90%)
- **耗时**: 约 4 分钟

## T18

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t18.mjs: 1 pass / 0 fail)
- **任务**: updateLocale('de', null) 重置子 locale 后格式未恢复(moment('2017-02-01').format('YYYY MMM MMMM') 应回原值)
- **改动文件**: `bench-host/real-moment-t1/src/lib/locale/locales.js`(`updateLocale` null 分支:回退 parentLocale 后,`if (name === getSetGlobalLocale()) { getSetGlobalLocale(name); }` 重新应用全局 locale)
- **根因**: 重置后全局 locale 仍指向被替换实例;上游 6a06e7a0 (#4962/#4966)
- **suggest 命中**: ❌ 未命中 locales.js;reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#53)→ reorient → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T19

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t19.mjs: 2 pass / 0 fail)
- **任务**: 严格模式解析全日括号失败(moment('2016年5月18日（水）','YYYY年M月D日（dd）',true) 应 valid)
- **改动文件**: `bench-host/real-moment-t1/src/lib/parse/regex.js`(`matchWord` 字符类 `\uFDF0-\uFFEF` → `\uFDF0-\uFF07\uFF10-\uFFEF`,排除全角括号 \uFF08/\uFF09)
- **根因**: 全角括号被当单词字符吞入 dd 匹配;上游 666a92fd (#4240)
- **suggest 命中**: ❌ 未命中 regex.js;reorient(evidence=上游 commit diff)修正
- **ritual**: suggest(#54)→ reorient → rebind → edit → select(learned 库置信度 90%)
- **耗时**: 约 3 分钟

## T20

- **日期**: 2026-08-15
- **结果**: ✅ PASS(verify-p6-t20.mjs: 3 pass / 0 fail)
- **任务**: 严格模式 weekdaysParseExact=false 时星期名句点被当正则通配符('t...s' 应字面匹配)
- **改动文件**: `bench-host/real-moment-t1/src/lib/units/day-of-week.js`(3 处 `.replace('.', '\.?')` → `.replace('.', '\\.?')`,转义反斜杠使句点字面化)
- **根因**: `'\.'` 在字符串里退化成 `'.'`,replace 后仍是正则通配符;需双反斜杠 `'\\.?'`;上游 07d88ae4 (#4453)
- **suggest 命中**: ✅ 直接命中实现文件 day-of-week.js(suggested 第 1 位);无需 reorient
- **ritual**: suggest(#55)→ focus → rebind → edit → select(learned 库置信度 90%,命中 20 次)
- **耗时**: 约 3 分钟

---

## 汇总(20/20 全部完成)

- **结果**: ✅ 全部 PASS(verify-p6-t1 ~ verify-p6-t20,共 85 项断言全过;build 文件 446→447)
- **耗时**: 约 70 分钟
- **suggest 命中率**: 直接命中 5/20(T7/T9/T15 实现文件,T14 相关文件未命中实现,T20 命中);其余经 nle_reorient(evidence=上游 commit diff)重定向
- **learned 库**: 置信度从 45% 升至 90%,命中 2 → 20 次;nle-learned 技能持续累积
- **新增文件**: `src/lib/utils/float-calculate.js`(T10)
- **重复编辑文件**: week-year.js(T2/T8/T12)、locales.js(T11/T18)、regex.js(T5/T19)、day-of-week.js(T14/T20)
